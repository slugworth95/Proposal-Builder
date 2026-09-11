// Proposal CRUD + version history API.
const express = require("express");
const db = require("../db");

const router = express.Router();

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
    data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

// GET /api/proposals?search= — list summaries (no full data)
router.get("/", (req, res) => {
  const { search = "" } = req.query;
  let sql =
    "SELECT id, title, client_name, prop_num, created_at, updated_at FROM proposals WHERE user_id = ?";
  const params = [req.user.id];
  if (search) {
    sql += " AND (title LIKE ? OR client_name LIKE ? OR prop_num LIKE ?)";
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  sql += " ORDER BY updated_at DESC";
  const rows = db.prepare(sql).all(...params);
  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      clientName: r.client_name,
      propNum: r.prop_num,
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
      "INSERT INTO proposals (user_id, title, client_name, prop_num, data) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      req.user.id,
      data.title || null,
      data.clientName || null,
      data.propNum || null,
      JSON.stringify(data)
    );
  res
    .status(201)
    .json(serializeProposal(db.prepare("SELECT * FROM proposals WHERE id = ?").get(Number(result.lastInsertRowid))));
});

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

  db.prepare(
    `UPDATE proposals
     SET title = ?, client_name = ?, prop_num = ?, data = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(data.title || null, data.clientName || null, data.propNum || null, JSON.stringify(data), existing.id);

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