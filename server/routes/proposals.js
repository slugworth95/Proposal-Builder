// Proposal CRUD + version history API.
const express = require("express");
const db = require("../db");
const { buildProposalPdf } = require("../pdf");

const router = express.Router();

const VALID_STATUSES = ["draft", "sent", "accepted", "declined", "invoiced"];

function serializeProposal(row) {
  if (!row) return null;
  let data = {};
  try {
    data = JSON.parse(row.data);
  } catch {
    data = {};
  }
  return {
    id: row.id,
    title: row.title,
    clientName: row.client_name,
    propNum: row.prop_num,
    status: row.status,
    sentAt: row.sent_at || null,
    acceptedAt: row.accepted_at || null,
    data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Compute status timestamps for a transition. Once set, they are kept for
// history even if the status later moves back to draft.
function statusTimestamps(existing, newStatus) {
  const now = new Date().toISOString();
  return {
    sent_at: existing.sent_at || (newStatus === "sent" ? now : null),
    accepted_at: existing.accepted_at || (newStatus === "accepted" ? now : null),
  };
}

function serializeVersion(row) {
  if (!row) return null;
  let data = {};
  try {
    data = JSON.parse(row.data);
  } catch {
    data = {};
  }
  return { id: row.id, label: row.label, data, savedAt: row.saved_at };
}

// GET /api/proposals?search=&status= — list summaries (no full data)
router.get("/", (req, res) => {
  const { search = "", status = "" } = req.query;
  let sql =
    "SELECT id, title, client_name, prop_num, status, sent_at, accepted_at, created_at, updated_at FROM proposals WHERE user_id = ?";
  const params = [req.user.id];
  if (search) {
    sql += " AND (title LIKE ? OR client_name LIKE ? OR prop_num LIKE ?)";
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (VALID_STATUSES.includes(status)) {
    sql += " AND status = ?";
    params.push(status);
  }
  sql += " ORDER BY updated_at DESC";
  const rows = db.prepare(sql).all(...params);
  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      clientName: r.client_name,
      propNum: r.prop_num,
      status: r.status,
      sentAt: r.sent_at || null,
      acceptedAt: r.accepted_at || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  );
});

// GET /api/proposals/:id — full proposal
router.get("/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM proposals WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "Proposal not found" });
  res.json(serializeProposal(row));
});

// POST /api/proposals — create
router.post("/", (req, res) => {
  const { data } = req.body || {};
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return res.status(400).json({ error: "data object is required" });
  }
  const result = db
    .prepare(
      "INSERT INTO proposals (user_id, title, client_name, prop_num, status, data) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      req.user.id,
      data.title || null,
      data.clientName || null,
      data.propNum || null,
      VALID_STATUSES.includes(data.status) ? data.status : "draft",
      JSON.stringify(data)
    );
  res
    .status(201)
    .json(serializeProposal(db.prepare("SELECT * FROM proposals WHERE id = ?").get(Number(result.lastInsertRowid))));
});

// POST /api/proposals/pdf — generate a PDF from a data object without saving.
// Must be registered before POST /:id so "pdf" isn't treated as an id.
router.post("/pdf", (req, res) => {
  const { data } = req.body || {};
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return res.status(400).json({ error: "data object is required" });
  }
  sendPdf(res, data);
});

// GET /api/proposals/:id/pdf — generate a PDF for a saved proposal.
router.get("/:id/pdf", (req, res) => {
  const row = db
    .prepare("SELECT * FROM proposals WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "Proposal not found" });
  let data = {};
  try {
    data = JSON.parse(row.data);
  } catch {
    data = {};
  }
  sendPdf(res, data);
});

function sendPdf(res, data) {
  const safe = String(data.propNum || "export").replace(/[^a-zA-Z0-9-_]/g, "_");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Proposal-${safe}.pdf"`);
  buildProposalPdf(data)
    .then((buf) => res.send(buf))
    .catch((err) => {
      console.error("PDF generation failed:", err);
      res.status(500).json({ error: "Could not generate PDF" });
    });
}

// PUT /api/proposals/:id — update
router.put("/:id", (req, res) => {
  const existing = db
    .prepare("SELECT * FROM proposals WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: "Proposal not found" });

  const { data } = req.body || {};
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return res.status(400).json({ error: "data object is required" });
  }

  const newStatus = VALID_STATUSES.includes(data.status) ? data.status : existing.status;
  const ts = statusTimestamps(existing, newStatus);

  db.prepare(
    `UPDATE proposals
     SET title = ?, client_name = ?, prop_num = ?, status = ?, data = ?,
         sent_at = ?, accepted_at = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    data.title || null,
    data.clientName || null,
    data.propNum || null,
    newStatus,
    JSON.stringify(data),
    ts.sent_at,
    ts.accepted_at,
    existing.id
  );

  res.json(serializeProposal(db.prepare("SELECT * FROM proposals WHERE id = ?").get(existing.id)));
});

// POST /api/proposals/:id/status — update just the status (used by other tools
// in the workflow, e.g. Scheduling Tool marks a proposal "invoiced").
router.post("/:id/status", (req, res) => {
  const existing = db
    .prepare("SELECT * FROM proposals WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: "Proposal not found" });

  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }

  // Keep the data blob's status in sync with the column.
  let data = {};
  try {
    data = JSON.parse(existing.data);
  } catch {
    data = {};
  }
  data.status = status;

  const ts = statusTimestamps(existing, status);

  db.prepare(
    `UPDATE proposals
     SET status = ?, data = ?, sent_at = ?, accepted_at = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(status, JSON.stringify(data), ts.sent_at, ts.accepted_at, existing.id);
  res.json(serializeProposal(db.prepare("SELECT * FROM proposals WHERE id = ?").get(existing.id)));
});

// DELETE /api/proposals/:id
router.delete("/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM proposals WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: "Proposal not found" });
  res.status(204).end();
});

// ─── Versions ───

// GET /api/proposals/:id/versions
router.get("/:id/versions", (req, res) => {
  const proposal = db
    .prepare("SELECT id FROM proposals WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!proposal) return res.status(404).json({ error: "Proposal not found" });
  const rows = db
    .prepare("SELECT * FROM proposal_versions WHERE proposal_id = ? ORDER BY saved_at DESC, id DESC")
    .all(proposal.id);
  res.json(rows.map(serializeVersion));
});

// POST /api/proposals/:id/versions — save a version
router.post("/:id/versions", (req, res) => {
  const proposal = db
    .prepare("SELECT id FROM proposals WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!proposal) return res.status(404).json({ error: "Proposal not found" });

  const { label, data } = req.body || {};
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return res.status(400).json({ error: "data object is required" });
  }

  const result = db
    .prepare(
      "INSERT INTO proposal_versions (proposal_id, user_id, label, data) VALUES (?, ?, ?, ?)"
    )
    .run(proposal.id, req.user.id, label || null, JSON.stringify(data));
  res
    .status(201)
    .json(serializeVersion(db.prepare("SELECT * FROM proposal_versions WHERE id = ?").get(Number(result.lastInsertRowid))));
});

// DELETE /api/proposals/:id/versions/:versionId
router.delete("/:id/versions/:versionId", (req, res) => {
  const result = db
    .prepare("DELETE FROM proposal_versions WHERE id = ? AND proposal_id = ? AND user_id = ?")
    .run(req.params.versionId, req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: "Version not found" });
  res.status(204).end();
});

module.exports = router;