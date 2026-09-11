# Proposal-Builder

Create, manage, and send professional client proposals. A full-stack app: vanilla JS frontend with live preview, Express API, SQLite database, and token-based auth — with built-in integration with [Client-Tracker](https://github.com/slugworth95/Client-Tracker).

## Features

### Proposal Management
- **Create Proposals** — build detailed proposals for any project type
- **Save & Load** — proposals persist per-user in SQLite (no more localStorage)
- **Version History** — save multiple versions of a proposal with descriptive labels
- **Search** — find saved proposals by title, client, or proposal number
- **Reset** — clear all fields and start fresh

### Company Branding
- Company name, tagline & address — flows through the preview, print, and email output, including a generated initials icon

### Line Items & Product Catalog
- Pick items from a per-user catalog (Product, Service, Labor, Custom) or add custom items
- Manage products directly from the UI (add / edit / delete / reset to defaults)
- Automatic calculations: quantity × unit price, subtotal, discount, estimated tax (7%), grand total

### Volume / Partner Pricing Tiers
- Standard (list price), Tier 1 (5% off), Tier 2 (10% off), Tier 3 (15% off), or custom discount %

### Payment Terms
- 50% Deposit / 50% on Completion, Net 30, Net 60, 100% Due Upon Delivery, or Custom

### Client Tracker Integration
- Paste your Client Tracker URL + API token, click **Fetch Clients**, pick a client, and the proposal auto-fills client name, email, and company — the linked client id is stored on the proposal

### Export & Sharing
- **Print / Save as PDF** — print-optimized layout
- **Email to Client** — pre-filled email via mail client
- **Download JSON / Import JSON** — full proposal backup and restore
- **Export CSV** — proposal summary + line items for spreadsheets

### Presentation
- Project photo, client signature field, valid-until date, estimated completion / lead time

## Run locally

Requires Node.js 22.5+ (uses the built-in `node:sqlite` — no native dependencies).

```bash
npm install
npm start
```

Open http://localhost:3001. The SQLite database is created automatically in `data/` (gitignored).

- `npm start` — run the server
- `npm run dev` — run with auto-restart on file changes

> Note: Proposal Builder runs on port **3001** so it can run alongside Client Tracker (port 3000).

## Project structure

```
Proposal-Builder/
├── server/
│   ├── index.js          # Express app: static frontend + /api routes
│   ├── db.js             # SQLite schema (users, sessions, proposals, catalog, versions)
│   ├── auth.js           # register/login + bearer-token middleware
│   └── routes/
│       ├── proposals.js  # Proposal CRUD + version history
│       └── catalog.js    # Per-user product catalog
├── public/               # Frontend (served by Express)
│   ├── index.html
│   ├── css/styles.css
│   └── js/{api.js,app.js}
├── reference/            # Original single-file reference app
├── data/                 # SQLite file (created at runtime, gitignored)
└── package.json
```

## API reference

Base URL: `http://localhost:3001` (override with `PORT` env var).

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Service discovery: `{ service, status, version }` |

### Auth

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password }` | Create account (password ≥ 8 chars). Returns `{ user, token }` |
| POST | `/api/auth/login` | `{ email, password }` | Returns `{ user, token }` |

All endpoints below require `Authorization: Bearer <token>`.

### Proposals

| Method | Path | Description |
|---|---|---|
| GET | `/api/proposals?search=` | List proposal summaries (no full data) |
| GET | `/api/proposals/:id` | Full proposal: `{ id, title, clientName, propNum, data, createdAt, updatedAt }` |
| POST | `/api/proposals` | Create. Body: `{ data }` (the full proposal object) |
| PUT | `/api/proposals/:id` | Update. Body: `{ data }` |
| DELETE | `/api/proposals/:id` | Delete (cascades versions) |

### Versions

| Method | Path | Description |
|---|---|---|
| GET | `/api/proposals/:id/versions` | List versions (newest first) |
| POST | `/api/proposals/:id/versions` | Save version. Body: `{ label, data }` |
| DELETE | `/api/proposals/:id/versions/:versionId` | Delete a version |

### Catalog

| Method | Path | Description |
|---|---|---|
| GET | `/api/catalog` | List catalog items |
| POST | `/api/catalog` | Add. Body: `{ label, category, price }` |
| PUT | `/api/catalog/:id` | Update item |
| DELETE | `/api/catalog/:id` | Delete item |
| POST | `/api/catalog/reset` | Restore the default catalog |

### Proposal data shape

The `data` object is the full form state:

```json
{
  "companyName": "Your Company Name",
  "companyTagline": "",
  "companyAddress": "",
  "repName": "Your Name",
  "repPhone": "(555) 123-4567",
  "repEmail": "you@yourcompany.com",
  "propNum": "PROP-0001",
  "title": "Henderson Project",
  "clientEmail": "client@example.com",
  "clientName": "The Hendersons",
  "projectAddress": "123 Main St",
  "validUntil": "2026-10-01",
  "projectType": "Product & Service Delivery",
  "notesTerms": "50% deposit due at signing...",
  "builderLicense": "",
  "projectName": "",
  "jobsiteAddress": "",
  "discountTier": "Standard",
  "customDiscountPct": 0,
  "paymentTerms": "50% deposit due at signing, balance due on completion.",
  "leadTime": "4-6 weeks",
  "lineItems": [
    { "id": 1, "label": "Standard Unit", "category": "Product", "qty": 2, "price": 250, "supplyOnly": false, "specNotes": "" }
  ],
  "photoDataUrl": null,
  "clientId": 3
}
```

`clientId` is the linked Client Tracker client id (set via the Fetch Clients integration).

## Integrating with Client Tracker

1. Run Client Tracker (`npm start` in `Client-Tracker`, port 3000) and create an account.
2. In Proposal Builder, open the **Client Tracker Integration** section.
3. Enter `http://localhost:3000` and paste your Client Tracker API token (from the app's sign-in response, or `POST /api/auth/login`).
4. Click **Fetch Clients**, then pick a client — the proposal auto-fills.

## Roadmap

- [x] Full reference feature set (catalog, tiers, versions, preview, print, email)
- [x] Server-side persistence with auth (replaces localStorage)
- [x] Client Tracker integration
- [x] JSON export/import + CSV export
- [ ] PDF generation (server-side)
- [ ] Proposal status tracking (draft / sent / accepted)