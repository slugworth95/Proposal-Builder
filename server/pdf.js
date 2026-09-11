// Server-side PDF rendering for proposals.
// Pure-JS (pdfkit) — no browser, no native deps. Mirrors the print layout:
// company header, prepared-for block, project photo, scope-of-work table,
// totals, notes/terms, and a signature footer.
const PDFDocument = require("pdfkit");

const NAVY = "#0a2e4a";
const GOLD = "#c9a84c";
const GRAY = "#777777";
const DARK = "#1a1a1a";
const LIGHT = "#f6f8fa";
const ROW_BORDER = "#eeeeee";
const SECTION_BORDER = "#e0e4ea";

const PAGE_W = 612; // LETTER
const PAGE_H = 792;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2; // 512

function money(n) {
  return "$" + (Number(n) || 0).toFixed(2);
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(String(iso).length === 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function getInitials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Accepts a data:image/jpeg|png;base64,... URL. Returns a Buffer or null.
function parsePhoto(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  return Buffer.from(m[2], "base64");
}

function buildProposalPdf(data = {}) {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
  });

  const chunks = [];
  doc.on("data", (c) => chunks.push(c));

  const state = { y: MARGIN };

  function ensureSpace(needed) {
    if (state.y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      state.y = MARGIN;
    }
  }

  // ─── Header ───
  const companyName = data.companyName || "Your Company Name";
  const tagline = data.companyTagline || "";
  const repName = data.repName || "Your Name";
  const repPhone = data.repPhone || "";
  const repEmail = data.repEmail || "";
  const propNum = data.propNum || "PROP-0001";

  // Initials icon
  doc.circle(MARGIN + 22, state.y + 22, 22).fill(NAVY);
  const initials = getInitials(companyName) || "YC";
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(initials, MARGIN, state.y + 15, { width: 44, align: "center" });

  // Company block
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(companyName, MARGIN + 44, state.y, { width: 320 });
  let headerY = state.y + 20;
  if (tagline) {
    doc
      .fillColor(GOLD)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(String(tagline).toUpperCase(), MARGIN + 44, headerY, { width: 320 });
    headerY += 12;
  }
  const contact = [repName, repPhone, repEmail].filter(Boolean).join(" · ");
  if (contact) {
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(8)
      .text(contact, MARGIN + 44, headerY, { width: 320 });
  }

  // Proposal number badge (right)
  const badgeW = doc.widthOfString(propNum, { font: "Helvetica-Bold", fontSize: 9 }) + 22;
  const badgeX = PAGE_W - MARGIN - badgeW;
  doc.roundedRect(badgeX, state.y, badgeW, 22, 4).fill(NAVY);
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(propNum, badgeX, state.y + 6, { width: badgeW, align: "center" });

  // Header rule
  state.y = MARGIN + 46;
  doc
    .moveTo(MARGIN, state.y)
    .lineTo(PAGE_W - MARGIN, state.y)
    .lineWidth(2)
    .strokeColor(NAVY)
    .stroke();
  doc
    .moveTo(MARGIN, state.y + 2)
    .lineTo(MARGIN + 60, state.y + 2)
    .lineWidth(2)
    .strokeColor(GOLD)
    .stroke();
  state.y += 16;

  // ─── Title + prepared-for ───
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("Project Proposal", MARGIN, state.y, { width: CONTENT_W, align: "center" });
  state.y += 26;
  const clientName = data.clientName || "Client";
  const address = data.projectAddress || "Address";
  doc
    .fillColor("#666666")
    .font("Helvetica")
    .fontSize(10)
    .text("Prepared for — " + clientName + " · " + address, MARGIN, state.y, {
      width: CONTENT_W,
      align: "center",
    });
  state.y += 22;

  // ─── Builder info strip ───
  const builderParts = [];
  if (data.projectName) builderParts.push("Project: " + data.projectName);
  if (data.builderLicense) builderParts.push("License: " + data.builderLicense);
  if (data.jobsiteAddress) builderParts.push("Ship to: " + data.jobsiteAddress);
  if (data.discountTier && data.discountTier !== "Standard") {
    builderParts.push("Pricing: " + data.discountTier);
  }
  if (builderParts.length > 0) {
    const infoText = builderParts.join(" · ");
    const infoH = doc.heightOfString(infoText, { width: CONTENT_W - 16, fontSize: 8 }) + 12;
    ensureSpace(infoH + 10);
    doc.rect(MARGIN, state.y, CONTENT_W, infoH).fill(LIGHT);
    doc
      .fillColor("#555555")
      .font("Helvetica")
      .fontSize(8)
      .text(infoText, MARGIN + 8, state.y + 6, { width: CONTENT_W - 16 });
    state.y += infoH + 12;
  }

  // ─── Project photo ───
  const photoBuf = parsePhoto(data.photoDataUrl);
  if (photoBuf) {
    try {
      const img = doc.openImage(photoBuf);
      const scale = Math.min(CONTENT_W / img.width, 180 / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ensureSpace(h + 12);
      doc.image(photoBuf, MARGIN + (CONTENT_W - w) / 2, state.y, { width: w, height: h });
      state.y += h + 12;
    } catch {
      // Unsupported image — skip silently rather than failing the whole PDF.
    }
  }

  // ─── Scope of work ───
  const projectType = data.projectType || "Product & Service Delivery";
  ensureSpace(40);
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("SCOPE OF WORK · " + String(projectType).toUpperCase(), MARGIN, state.y, {
      width: CONTENT_W,
    });
  state.y += 12;
  doc
    .moveTo(MARGIN, state.y)
    .lineTo(PAGE_W - MARGIN, state.y)
    .lineWidth(1)
    .strokeColor(SECTION_BORDER)
    .stroke();
  state.y += 8;

  // Table geometry
  const colX = { desc: MARGIN, qty: 290, price: 350, total: 440 };
  const colW = { desc: 240, qty: 60, price: 90, total: 72 };

  // Header row
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(7)
    .text("Description", colX.desc, state.y, { width: colW.desc });
  doc.text("Qty", colX.qty, state.y, { width: colW.qty, align: "center" });
  doc.text("Unit Price", colX.price, state.y, { width: colW.price, align: "right" });
  doc.text("Total", colX.total, state.y, { width: colW.total, align: "right" });
  state.y += 14;
  doc
    .moveTo(MARGIN, state.y)
    .lineTo(PAGE_W - MARGIN, state.y)
    .lineWidth(2)
    .strokeColor(NAVY)
    .stroke();
  state.y += 4;

  const lineItems = Array.isArray(data.lineItems) ? data.lineItems : [];

  function drawRow(item) {
    let desc = item.label || "(custom item)";
    if (item.supplyOnly) desc += " [Supply Only]";
    const spec = item.specNotes || "";
    const descH = doc.heightOfString(desc, { width: colW.desc, fontSize: 8.5, lineGap: 1 });
    const specH = spec
      ? doc.heightOfString(spec, { width: colW.desc, fontSize: 7.5, lineGap: 1 })
      : 0;
    const rowH = Math.max(18, descH + specH + 10);
    ensureSpace(rowH + 6);

    doc
      .fillColor(DARK)
      .font("Helvetica")
      .fontSize(8.5)
      .text(desc, colX.desc, state.y + 4, { width: colW.desc, lineGap: 1 });
    if (spec) {
      doc
        .fillColor(GRAY)
        .font("Helvetica")
        .fontSize(7.5)
        .text(spec, colX.desc, state.y + 4 + descH + 2, { width: colW.desc, lineGap: 1 });
    }
    doc
      .fillColor(DARK)
      .font("Helvetica")
      .fontSize(8.5)
      .text(String(item.qty), colX.qty, state.y + 4, { width: colW.qty, align: "center" });
    doc
      .fillColor(DARK)
      .font("Helvetica")
      .fontSize(8.5)
      .text(money(item.price), colX.price, state.y + 4, { width: colW.price, align: "right" });
    doc
      .fillColor(DARK)
      .font("Helvetica")
      .fontSize(8.5)
      .text(money(item.qty * item.price), colX.total, state.y + 4, {
        width: colW.total,
        align: "right",
      });
    doc
      .moveTo(MARGIN, state.y + rowH)
      .lineTo(PAGE_W - MARGIN, state.y + rowH)
      .lineWidth(0.5)
      .strokeColor(ROW_BORDER)
      .stroke();
    state.y += rowH;
  }

  if (lineItems.length === 0) {
    doc
      .fillColor("#999999")
      .font("Helvetica")
      .fontSize(8.5)
      .text("No line items added yet", MARGIN, state.y + 4, {
        width: CONTENT_W,
        align: "center",
      });
    state.y += 22;
  } else {
    lineItems.forEach(drawRow);
  }

  // ─── Totals ───
  let subtotal = 0;
  lineItems.forEach((item) => {
    subtotal += (Number(item.qty) || 0) * (Number(item.price) || 0);
  });
  let discountPct = 0;
  if (data.discountTier === "Tier 1") discountPct = 5;
  else if (data.discountTier === "Tier 2") discountPct = 10;
  else if (data.discountTier === "Tier 3") discountPct = 15;
  else if (data.discountTier === "Custom") discountPct = Number(data.customDiscountPct) || 0;
  const discountAmount = subtotal * (discountPct / 100);
  const afterDiscount = subtotal - discountAmount;
  const tax = afterDiscount * 0.07;
  const total = afterDiscount + tax;

  state.y += 10;
  ensureSpace(90);
  const totalsX = PAGE_W - MARGIN - 220; // 220pt wide block, right-aligned
  const totalsW = 220;

  function totalsRow(label, value, opts = {}) {
    doc
      .fillColor(opts.color || "#1a1a1a")
      .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(opts.bold ? 12 : 9)
      .text(label, totalsX, state.y, { width: totalsW - 90 });
    doc
      .fillColor(opts.color || "#1a1a1a")
      .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(opts.bold ? 12 : 9)
      .text(value, totalsX + totalsW - 90, state.y, { width: 90, align: "right" });
    state.y += opts.bold ? 20 : 16;
  }

  totalsRow("Subtotal", money(subtotal));
  totalsRow("Discount (" + discountPct + "%)", "-" + money(discountAmount));
  totalsRow("Estimated Tax (7%)", money(tax));
  doc
    .moveTo(totalsX, state.y)
    .lineTo(PAGE_W - MARGIN, state.y)
    .lineWidth(2)
    .strokeColor(NAVY)
    .stroke();
  state.y += 6;
  totalsRow("Total", money(total), { bold: true, color: NAVY });

  // ─── Notes / terms ───
  const notes = data.notesTerms || "";
  if (notes) {
    state.y += 10;
    const notesH = doc.heightOfString(notes, { width: CONTENT_W - 16, fontSize: 8.5, lineGap: 2 }) + 16;
    ensureSpace(notesH + 10);
    doc.rect(MARGIN, state.y, CONTENT_W, notesH).fill(LIGHT);
    doc.rect(MARGIN, state.y, 3, notesH).fill(GOLD);
    doc
      .fillColor("#555555")
      .font("Helvetica")
      .fontSize(8.5)
      .text(notes, MARGIN + 8, state.y + 8, { width: CONTENT_W - 16, lineGap: 2 });
    state.y += notesH + 14;
  }

  // ─── Footer ───
  ensureSpace(70);
  doc
    .moveTo(MARGIN, state.y)
    .lineTo(PAGE_W - MARGIN, state.y)
    .lineWidth(1)
    .strokeColor("#dde2e8")
    .stroke();
  state.y += 10;

  const validUntil = data.validUntil ? "Valid until " + fmtDate(data.validUntil) : "Valid until —";
  const leadTime = data.leadTime ? "\nLead time: " + data.leadTime : "";
  doc
    .fillColor(GRAY)
    .font("Helvetica")
    .fontSize(8)
    .text(
      "Prepared by " + companyName + "\n" + validUntil + leadTime,
      MARGIN,
      state.y,
      { width: 300, lineGap: 2 }
    );

  doc
    .fillColor(GRAY)
    .font("Helvetica")
    .fontSize(8)
    .text("Client signature", PAGE_W - MARGIN - 180, state.y, { width: 180, align: "right" });
  doc
    .moveTo(PAGE_W - MARGIN - 180, state.y + 14)
    .lineTo(PAGE_W - MARGIN, state.y + 14)
    .lineWidth(1)
    .strokeColor("#333333")
    .stroke();

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

module.exports = { buildProposalPdf };