// SQLite setup and schema. Uses Node's built-in node:sqlite — no native deps.
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "proposal-builder.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = OFF;

  CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,
    client_name TEXT,
    prop_num TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS catalog_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Product',
    price REAL NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS proposal_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT,
    data TEXT NOT NULL,
    saved_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_proposals_user ON proposals(user_id);
  CREATE INDEX IF NOT EXISTS idx_catalog_user ON catalog_items(user_id);
  CREATE INDEX IF NOT EXISTS idx_versions_proposal ON proposal_versions(proposal_id);
`);

// Migration: add columns if the proposals table predates them.
const propCols = db.prepare("PRAGMA table_info(proposals)").all().map((c) => c.name);
if (!propCols.includes("status")) {
  db.exec("ALTER TABLE proposals ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'");
}
if (!propCols.includes("sent_at")) {
  db.exec("ALTER TABLE proposals ADD COLUMN sent_at TEXT");
}
if (!propCols.includes("accepted_at")) {
  db.exec("ALTER TABLE proposals ADD COLUMN accepted_at TEXT");
}

module.exports = db;