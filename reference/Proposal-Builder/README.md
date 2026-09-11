# Proposal Builder

A single-page HTML application for generating, managing, and sending professional project proposals. Fully generic — set your own company name, catalog, and terms so it works for any product or service business.

## 🚀 Features

### Proposal Management
- **Create Proposals** — Build detailed proposals for any project type (installation, consulting, delivery, custom projects, etc.).
- **Save & Load** — Persist proposals locally and reload them later.
- **Version History** — Save multiple versions of a proposal with a descriptive label.
- **Reset** — Clear all fields and start fresh.

### Company Branding
- **Company Name, Tagline & Address** — Set once and it flows through the preview, print, and email output automatically, including a generated initials icon.

### Line Items & Product Catalog
- **Add Line Items** — Pick items from a predefined catalog (Product, Service, Labor, Custom) or add a custom item with your own description.
- **Manage Products** — Add new items to the catalog directly from the UI.
- **Automatic Calculations** — Quantity × Unit Price = Total per line item; subtotal, discount, estimated tax (7%), and grand total are computed automatically.

### Volume / Partner Pricing Tiers
- **Standard (List Price)** — No discount.
- **Tier 1 — Volume Builder** — 5% off.
- **Tier 2 — Preferred Partner** — 10% off.
- **Tier 3 — Strategic Partner** — 15% off.
- **Custom Discount** — Set a custom discount percentage.

### Payment Terms
Choose from:
- 50% Deposit / 50% on Completion
- Net 30
- Net 60
- 100% Due Upon Delivery
- Custom Terms

### Export & Sharing
- **🖨️ Print / Save as PDF** — Print-optimized layout for physical or digital delivery.
- **✉️ Email to Client** — Send the proposal directly via email.
- **📥 Download JSON** — Export proposal data as JSON for backup or offline processing.
- **📤 Import JSON** — Restore a proposal from a previously exported JSON file.

### Presentation
- **Project Photo** — Attach a project photo to the proposal.
- **Client Signature** — Space for the client to sign off on the proposal.
- **Valid Until Date** — Set the proposal's expiration date.
- **Estimated Completion / Lead Time** — Communicate timeline expectations.

## 📄 Proposal Output

The generated proposal includes:
- Your company name, tagline, and icon
- Your name, phone, and email
- Proposal number (auto-generated, e.g., `PROP-0001`)
- Client and project details
- Scope of work
- Itemized line items with quantities, unit prices, and totals
- Discount and estimated tax breakdown
- Total amount due
- Terms & conditions
- Client signature field

## 🛠️ Tech Stack

- **Pure HTML / CSS / JavaScript** — Single self-contained HTML file. No external dependencies or build tools required.
- **Local Storage** — Proposals and saved data persist in the browser's local storage.
- **Browser APIs** — Print, download (JSON), and file upload (JSON import) all use native browser functionality.

## 🚦 Getting Started

1. Open `index.html` in any modern web browser.
2. Fill in your company info (name, tagline, address) and rep info once.
3. Add line items from the product catalog or create custom items.
4. Adjust discount tier and payment terms as needed.
5. Save, print, email, or export the proposal.

## 📁 File Structure

- index.html — The complete application (single-page app)
- No additional files, frameworks, or libraries are needed.

## 📝 Notes & Terms

> All Rights Reserved 

## 📧 Contact

**Caelan Wilkinson**    
📞 ‪(734) 331-0787‬   
✉️ Caelan@Slugworth.org  
🌐 slugworth.org
