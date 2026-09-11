// Per-user product catalog API (replaces localStorage in the reference app).
const express = require("express");
const db = require("../db");

const router = express.Router();

const DEFAULT_CATALOG = [
  { label: "Standard Unit", category: "Product", price: 250 },
  { label: "Premium Unit", category: "Product", price: 450 },
  { label: "Deluxe Unit", category: "Product", price: 650 },
  { label: "Basic Package", category: "Product", price: 150 },
  { label: "Add-on Accessory", category: "Product", price: 75 },
  { label: "Consultation (per session)", category: "Service", price: 100 },
  { label: "Standard Installation", category: "Service", price: 300 },
  { label: "Premium Installation", category: "Service", price: 500 },
  { label: "Delivery Fee", category: "Service", price: 50 },
  { label: "Site Preparation", category: "Service", price: 200 },
  { label: "Labor (per hour)", category: "Labor", price: 75 },
  { label: "Labor (per day)", category: "Labor", price: 500 },
  { label: "Rush / Overtime Labor (per hour)", category: "Labor", price: 110 },
  { label: "Cleanup & Disposal", category: "Labor", price: 150 },
];

const VALID_CATEGORIES = ["Product", "Service", "Labor", "Custom"];

function serializeItem(row) {
  return {
    id: row.id,
    label: row.label,
    category: row.category,
    price: row.price,
    position: row.position,
  };
}

// GET /api/catalog
router.get("/", (req, res) => {
  // Seed the default catalog for new users (matches the reference app's behavior).
  const count = db
    .prepare("SELECT COUNT(*) AS c FROM catalog_items WHERE user_id = ?")
    .get(req.user.id).c;
  if (count === 0) {
    const insert = db.prepare(
      "INSERT INTO catalog_items (user_id, label, category, price, position) VALUES (?, ?, ?, ?, ?)"
    );
    DEFAULT_CATALOG.forEach((item, i) => {
      insert.run(req.user.id, item.label, item.category, item.price, i);
    });
  }
  const rows = db
    .prepare("SELECT * FROM catalog_items WHERE user_id = ? ORDER BY position, id")
    .all(req.user.id);
  res.json(rows.map(serializeItem));
});

// POST /api/catalog — add item
router.post("/", (req, res) => {
  const { label, category = "Product", price = 0 } = req.body || {};
  if (!label || !String(label).trim()) {
    return res.status(400).json({ error: "label is required" });
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` });
  }
  const p = Number(price);
  if (Number.isNaN(p) || p < 0) {
    return res.status(400).json({ error: "price must be a non-negative number" });
  }
  const maxPos = db
    .prepare("SELECT COALESCE(MAX(position), -1) AS p FROM catalog_items WHERE user_id = ?")
    .get(req.user.id).p;
  const result = db
    .prepare("INSERT INTO catalog_items (user_id, label, category, price, position) VALUES (?, ?, ?, ?, ?)")
    .run(req.user.id, String(label).trim(), category, p, maxPos + 1);
  res
    .status(201)
    .json(serializeItem(db.prepare("SELECT * FROM catalog_items WHERE id = ?").get(Number(result.lastInsertRowid))));
});

// PUT /api/catalog/:id — update item
router.put("/:id", (req, res) => {
  const existing = db
    .prepare("SELECT * FROM catalog_items WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: "Item not found" });

  const { label, category, price } = req.body || {};
  const next = {
    label: label !== undefined ? String(label).trim() : existing.label,
    category: category !== undefined ? category : existing.category,
    price: price !== undefined ? Number(price) : existing.price,
  };
  if (!next.label) return res.status(400).json({ error: "label cannot be empty" });
  if (!VALID_CATEGORIES.includes(next.category)) {
    return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` });
  }
  if (Number.isNaN(next.price) || next.price < 0) {
    return res.status(400).json({ error: "price must be a non-negative number" });
  }

  db.prepare("UPDATE catalog_items SET label = ?, category = ?, price = ? WHERE id = ?").run(
    next.label,
    next.category,
    next.price,
    existing.id
  );
  res.json(serializeItem(db.prepare("SELECT * FROM catalog_items WHERE id = ?").get(existing.id)));
});

// DELETE /api/catalog/:id
router.delete("/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM catalog_items WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: "Item not found" });
  res.status(204).end();
});

// POST /api/catalog/reset — restore default catalog
router.post("/reset", (req, res) => {
  db.prepare("DELETE FROM catalog_items WHERE user_id = ?").run(req.user.id);
  const insert = db.prepare(
    "INSERT INTO catalog_items (user_id, label, category, price, position) VALUES (?, ?, ?, ?, ?)"
  );
  DEFAULT_CATALOG.forEach((item, i) => {
    insert.run(req.user.id, item.label, item.category, item.price, i);
  });
  const rows = db
    .prepare("SELECT * FROM catalog_items WHERE user_id = ? ORDER BY position, id")
    .all(req.user.id);
  res.json(rows.map(serializeItem));
});

module.exports = router;