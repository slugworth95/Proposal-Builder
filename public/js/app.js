// Proposal Builder — UI logic.
// Adapted from the reference single-file app: localStorage replaced with the
// Proposal Builder API, plus auth, Client Tracker integration, and CSV export.

// ═══════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════
const $ = (id) => document.getElementById(id);

const authView = $("auth-view");
const appView = $("app-view");
const authForm = $("auth-form");
const authTitle = $("auth-title");
const authSubmit = $("auth-submit");
const authToggle = $("auth-toggle");
const authStatus = $("auth-status");
const nameField = $("auth-name");
const nameLabel = $("name-label");

let authMode = "login";

function showAuth() {
  authView.hidden = false;
  appView.hidden = true;
}

function showApp() {
  authView.hidden = true;
  appView.hidden = false;
}

function setAuthStatus(message, isError = false) {
  authStatus.textContent = message;
  authStatus.hidden = false;
  authStatus.style.color = isError ? "#b91c1c" : "";
}

authToggle.addEventListener("click", () => {
  authMode = authMode === "login" ? "register" : "login";
  authTitle.textContent = authMode === "login" ? "Sign In" : "Create Account";
  authSubmit.textContent = authMode === "login" ? "Sign In" : "Create Account";
  nameField.hidden = nameLabel.hidden = authMode !== "register";
  authStatus.hidden = true;
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  try {
    if (authMode === "register") {
      const name = nameField.value.trim();
      if (!name) return setAuthStatus("Please enter your name.", true);
      const { token } = await API.register(name, email, password);
      API.setToken(token);
    } else {
      const { token } = await API.login(email, password);
      API.setToken(token);
    }
    authForm.reset();
    showApp();
    init();
  } catch (err) {
    setAuthStatus(err.message, true);
  }
});

$("logout-button").addEventListener("click", async () => {
  await API.logout();
  API.setToken(null);
  showAuth();
});

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
let PRODUCT_CATALOG = [];
let lineItems = [];
let photoDataUrl = null;
let itemIdCounter = 0;
let currentSavedId = null;
let isDirty = false;
let versions = [];
let currentVersionId = null;
let savedProposals = [];
let fetchedClients = [];
let linkedClientId = null;
let acceptedNoted = false; // true once the acceptance note has been added in Client Tracker

const defaultItems = [
  { label: "Standard Unit", qty: 2 },
  { label: "Standard Installation", qty: 1 },
  { label: "Labor (per hour)", qty: 4 },
];

// ═══════════════════════════════════════════════
// CATALOG
// ═══════════════════════════════════════════════
async function loadCatalog() {
  try {
    PRODUCT_CATALOG = await API.listCatalog();
  } catch {
    PRODUCT_CATALOG = [];
  }
  updateCatalogBadge();
}

function badgeClass(cat) {
  if (!cat || cat === "Custom") return "badge-custom";
  const map = { Product: "badge-product", Service: "badge-service", Labor: "badge-labor" };
  return map[cat] || "badge-custom";
}

function catalogBadgeClass(cat) {
  if (!cat || cat === "Custom") return "cb-custom";
  const map = { Product: "cb-product", Service: "cb-service", Labor: "cb-labor" };
  return map[cat] || "cb-custom";
}

function isCatalogLabel(label) {
  return PRODUCT_CATALOG.some((p) => p.label === label);
}

// ─── Catalog editor ───
let catalogEditorOpen = false;
function toggleCatalogEditor() {
  catalogEditorOpen = !catalogEditorOpen;
  const body = document.getElementById("catalogEditorBody");
  const arrow = document.getElementById("catalogArrow");
  body.classList.toggle("open", catalogEditorOpen);
  arrow.classList.toggle("open", catalogEditorOpen);
  if (catalogEditorOpen) renderCatalogTable();
}

function renderCatalogTable() {
  const tbody = document.getElementById("catalogTableBody");
  tbody.innerHTML = "";
  const searchVal = document.getElementById("catalogSearch").value.toLowerCase().trim();
  const filtered = searchVal
    ? PRODUCT_CATALOG.filter((p) => {
        const s = [p.label, p.category].filter(Boolean).join(" ").toLowerCase();
        return s.includes(searchVal);
      })
    : PRODUCT_CATALOG;
  if (filtered.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" class="catalog-no-results">No matching products</td>`;
    tbody.appendChild(tr);
    document.getElementById("catalogCountText").textContent = `0 matches for "${searchVal}"`;
    return;
  }
  filtered.forEach((p) => {
    const realIndex = PRODUCT_CATALOG.indexOf(p);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="catalog-name-cell">${escHtml(p.label)}</div>
      </td>
      <td><span class="cat-badge ${catalogBadgeClass(p.category)}">${p.category || "Custom"}</span></td>
      <td style="text-align:right;">
        <div class="catalog-price-cell">$${p.price.toFixed(2)}</div>
      </td>
      <td>
        <div class="edit-actions">
          <button class="save-btn" data-index="${realIndex}" title="Save" style="display:none;">✓</button>
          <button class="cancel-btn" data-index="${realIndex}" title="Cancel" style="display:none;">↺</button>
          <button class="del-btn" data-index="${realIndex}" title="Remove">✕</button>
        </div>
      </td>
    `;
    const nameCell = tr.querySelector(".catalog-name-cell");
    const priceCell = tr.querySelector(".catalog-price-cell");
    const saveBtn = tr.querySelector(".save-btn");
    const cancelBtn = tr.querySelector(".cancel-btn");
    const delBtn = tr.querySelector(".del-btn");

    const startEdit = () => {
      const currentName = p.label;
      nameCell.innerHTML = `<input class="edit-input" type="text" value="${escAttr(currentName)}">`;
      priceCell.innerHTML = `<input class="edit-input edit-price" type="number" min="0" step="0.01" value="${p.price}">`;
      saveBtn.style.display = "inline-block";
      cancelBtn.style.display = "inline-block";
      delBtn.style.display = "none";
      const input = nameCell.querySelector("input");
      const priceInput = priceCell.querySelector("input");
      input.focus();
      input.select();
      saveBtn.onclick = async function () {
        const newName = input.value.trim();
        const newPrice = parseFloat(priceInput.value);
        if (!newName) { alert("Please enter a product name."); return; }
        if (isNaN(newPrice) || newPrice < 0) { alert("Please enter a valid price."); return; }
        if (PRODUCT_CATALOG.some((entry, idx) => idx !== realIndex && entry.label.toLowerCase() === newName.toLowerCase())) {
          alert("A product with this name already exists.");
          return;
        }
        try {
          const updated = await API.updateCatalogItem(p.id, { label: newName, category: p.category, price: newPrice });
          PRODUCT_CATALOG[realIndex] = updated;
          refreshLineItemDropdowns();
          updateCatalogBadge();
          renderCatalogTable();
          showStatus('Updated "' + newName + '"', "ok");
        } catch (err) { alert(err.message); }
      };
      cancelBtn.onclick = function () {
        renderCatalogTable();
      };
    };
    nameCell.addEventListener("click", startEdit);
    priceCell.addEventListener("click", startEdit);
    tr.querySelector(".del-btn").addEventListener("click", function () {
      removeCatalogItem(parseInt(this.dataset.index));
    });
    tbody.appendChild(tr);
  });
  document.getElementById("catalogCountText").textContent =
    searchVal
      ? filtered.length + " of " + PRODUCT_CATALOG.length + " products"
      : PRODUCT_CATALOG.length + " product" + (PRODUCT_CATALOG.length !== 1 ? "s" : "") + " in catalog";
}

function updateCatalogBadge() {
  document.getElementById("catalogCountBadge").textContent =
    "(" + PRODUCT_CATALOG.length + " products)";
}

async function addCatalogItem() {
  const nameInput = document.getElementById("newCatName");
  const catSelect = document.getElementById("newCatCategory");
  const priceInput = document.getElementById("newCatPrice");
  const name = nameInput.value.trim();
  const category = catSelect.value;
  const price = parseFloat(priceInput.value);
  if (!name) { alert("Please enter a product name."); return; }
  if (isNaN(price) || price < 0) { alert("Please enter a valid price."); return; }
  if (PRODUCT_CATALOG.some((p) => p.label.toLowerCase() === name.toLowerCase())) {
    alert("A product with this name already exists.");
    return;
  }
  try {
    const created = await API.createCatalogItem({ label: name, category, price });
    PRODUCT_CATALOG.push(created);
    nameInput.value = "";
    priceInput.value = "";
    renderCatalogTable();
    refreshLineItemDropdowns();
    updateCatalogBadge();
    showStatus('Added "' + name + '"', "ok");
  } catch (err) { alert(err.message); }
}

async function removeCatalogItem(index) {
  const removed = PRODUCT_CATALOG[index];
  if (!removed) return;
  if (!confirm('Remove "' + removed.label + '" from the catalog?')) return;
  try {
    await API.deleteCatalogItem(removed.id);
    PRODUCT_CATALOG.splice(index, 1);
    renderCatalogTable();
    refreshLineItemDropdowns();
    updateCatalogBadge();
    showStatus('Removed "' + removed.label + '"', "ok");
  } catch (err) { alert(err.message); }
}

async function resetCatalogToDefaults() {
  if (!confirm("Reset catalog to the default product list? Any custom additions will be lost.")) return;
  try {
    PRODUCT_CATALOG = await API.resetCatalog();
    renderCatalogTable();
    refreshLineItemDropdowns();
    updateCatalogBadge();
    showStatus("Catalog reset to defaults.", "ok");
  } catch (err) { alert(err.message); }
}

function refreshLineItemDropdowns() {
  renderLineItems();
  updatePreview();
}

// ═══════════════════════════════════════════════
// VERSION HISTORY
// ═══════════════════════════════════════════════
async function loadVersions() {
  if (!currentSavedId) {
    versions = [];
    rebuildVersionSelect();
    return;
  }
  try {
    versions = await API.listVersions(currentSavedId);
  } catch {
    versions = [];
  }
  rebuildVersionSelect();
}

function rebuildVersionSelect() {
  const select = document.getElementById("versionSelect");
  const bar = document.getElementById("versionBar");
  if (!currentSavedId || versions.length === 0) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "flex";
  select.innerHTML = "";
  const sorted = [...versions].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  sorted.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.id;
    const date = new Date(v.savedAt.replace(" ", "T") + "Z").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
    const label = v.label || "v" + (versions.indexOf(v) + 1);
    opt.textContent = label + " (" + date + ")";
    if (v.id === currentVersionId) opt.selected = true;
    select.appendChild(opt);
  });
}

async function pushVersion(label) {
  if (!currentSavedId) return;
  if (!label) {
    const count = versions.length + 1;
    label = "v" + count;
  }
  const state = gatherFormState();
  try {
    const v = await API.createVersion(currentSavedId, { label, data: state });
    versions.push({ id: v.id, label: v.label, data: v.data, savedAt: v.savedAt });
    currentVersionId = v.id;
    rebuildVersionSelect();
    showStatus('Version "' + label + '" saved!', "ok");
  } catch (err) { alert(err.message); }
}

function saveVersionManually() {
  const label = prompt('Name this version (e.g., "After builder review"):');
  if (label === null) return;
  pushVersion(label || undefined);
}

function restoreVersion(versionId) {
  if (!versionId) return;
  const v = versions.find((item) => item.id === versionId);
  if (!v) { showStatus("Version not found.", "warn"); return; }
  if (isDirty && !confirm("You have unsaved changes. Restore this version anyway?")) return;
  applyFormState(v.data);
  currentVersionId = versionId;
  showStatus("Version restored!", "ok");
}

function markDirty() {
  isDirty = true;
}

// ═══════════════════════════════════════════════
// SAVED PROPOSALS (API-backed)
// ═══════════════════════════════════════════════
async function rebuildSavedSelect() {
  const select = document.getElementById("savedProposalsSelect");
  const searchInput = document.getElementById("searchSaved");
  const currentVal = select.value;
  const searchVal = (searchInput ? searchInput.value : "").toLowerCase().trim();
  try {
    savedProposals = await API.listProposals({ search: searchVal });
  } catch {
    savedProposals = [];
  }
  select.innerHTML = '<option value="">— Saved proposals —</option>';
  if (searchVal && savedProposals.length === 0) {
    const opt = document.createElement("option");
    opt.disabled = true;
    opt.textContent = "No matches found";
    select.appendChild(opt);
  }
  savedProposals.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    const date = new Date(p.updatedAt.replace(" ", "T") + "Z").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "2-digit",
    });
    const label = p.title || (p.propNum ? p.propNum + " - " : "Proposal - ") + (p.clientName || "No client");
    opt.textContent = searchVal ? label + " (" + date + ") 🔍" : label + " (" + date + ")";
    select.appendChild(opt);
  });
  const availableValues = [...select.options].map((o) => o.value).filter(Boolean);
  if (currentVal && availableValues.includes(currentVal)) {
    select.value = currentVal;
  } else if (savedProposals.length > 0) {
    select.value = savedProposals[0].id;
  } else {
    select.value = "";
  }
  updateSaveStatus();
}

function updateSaveStatus() {
  const el = document.getElementById("saveStatus");
  if (!el) return;
  const count = savedProposals.length;
  el.textContent = count > 0 ? count + " saved proposal" + (count > 1 ? "s" : "") : "";
  el.className = "save-status" + (count > 0 ? " ok" : "");
}

// ═══════════════════════════════════════════════
// SAVE / LOAD / DELETE
// ═══════════════════════════════════════════════
function gatherFormState() {
  return {
    companyName: document.getElementById("companyName").value,
    companyTagline: document.getElementById("companyTagline").value,
    companyAddress: document.getElementById("companyAddress").value,
    repName: document.getElementById("repName").value,
    repPhone: document.getElementById("repPhone").value,
    repEmail: document.getElementById("repEmail").value,
    propNum: document.getElementById("propNum").value,
    title: document.getElementById("proposalTitle").value,
    status: document.getElementById("proposalStatus").value,
    clientEmail: document.getElementById("clientEmail").value,
    clientName: document.getElementById("clientName").value,
    projectAddress: document.getElementById("projectAddress").value,
    validUntil: document.getElementById("validUntil").value,
    projectType: document.getElementById("projectType").value,
    notesTerms: document.getElementById("notesTerms").value,
    builderLicense: document.getElementById("builderLicense").value,
    projectName: document.getElementById("projectName").value,
    jobsiteAddress: document.getElementById("jobsiteAddress").value,
    discountTier: document.getElementById("discountTier").value,
    customDiscountPct: parseFloat(document.getElementById("customDiscountPct").value) || 0,
    paymentTerms: document.getElementById("paymentTerms").value,
    leadTime: document.getElementById("leadTime").value,
    lineItems: lineItems.map((item) => ({ ...item })),
    photoDataUrl: photoDataUrl,
    clientId: linkedClientId,
    acceptedNoted,
  };
}

function applyFormState(state) {
  document.getElementById("companyName").value = state.companyName || "Your Company Name";
  document.getElementById("companyTagline").value = state.companyTagline || "";
  document.getElementById("companyAddress").value = state.companyAddress || "";
  document.getElementById("repName").value = state.repName || "";
  document.getElementById("repPhone").value = state.repPhone || "";
  document.getElementById("repEmail").value = state.repEmail || "";
  document.getElementById("propNum").value = state.propNum || "";
  document.getElementById("proposalTitle").value = state.title || "";
  document.getElementById("proposalStatus").value = state.status || "draft";
  document.getElementById("clientEmail").value = state.clientEmail || "";
  document.getElementById("clientName").value = state.clientName || "";
  document.getElementById("projectAddress").value = state.projectAddress || "";
  document.getElementById("validUntil").value = state.validUntil || "";
  document.getElementById("projectType").value = state.projectType || "Product & Service Delivery";
  document.getElementById("notesTerms").value = state.notesTerms || "";
  document.getElementById("builderLicense").value = state.builderLicense || "";
  document.getElementById("projectName").value = state.projectName || "";
  document.getElementById("jobsiteAddress").value = state.jobsiteAddress || "";
  document.getElementById("discountTier").value = state.discountTier || "Standard";
  document.getElementById("customDiscountPct").value = state.customDiscountPct || 0;
  document.getElementById("paymentTerms").value = state.paymentTerms || "50% deposit due at signing, balance due on completion.";
  document.getElementById("leadTime").value = state.leadTime || "";
  document.getElementById("customDiscountGroup").style.display =
    state.discountTier === "Custom" ? "block" : "none";
  linkedClientId = state.clientId || null;
  acceptedNoted = !!state.acceptedNoted;
  photoDataUrl = state.photoDataUrl || null;
  if (photoDataUrl) {
    document.getElementById("photoPreviewSmall").src = photoDataUrl;
    document.getElementById("photoPreviewSmall").classList.add("show");
    document.getElementById("photoPlaceholderSmall").style.display = "none";
  } else {
    document.getElementById("photoPreviewSmall").classList.remove("show");
    document.getElementById("photoPreviewSmall").src = "";
    document.getElementById("photoPlaceholderSmall").style.display = "flex";
  }
  lineItems = (state.lineItems || []).map((item) => ({ ...item }));
  itemIdCounter = lineItems.reduce((max, item) => Math.max(max, item.id || 0), 0);
  isDirty = false;
  renderLineItems();
  updatePreview();
}

async function saveCurrentProposal() {
  const state = gatherFormState();
  try {
    if (currentSavedId) {
      await API.updateProposal(currentSavedId, { data: state });
      showStatus("Proposal updated!", "ok");
    } else {
      const created = await API.createProposal({ data: state });
      currentSavedId = created.id;
      versions = [];
      showStatus("Proposal saved!", "ok");
    }
    isDirty = false;
    await rebuildSavedSelect();
    document.getElementById("savedProposalsSelect").value = currentSavedId;
    await maybeNotifyAccepted(state);
  } catch (err) {
    alert(err.message);
  }
}

// When a proposal is accepted, add a timestamped note to the linked client in
// Client Tracker. Runs once per proposal (guarded by state.acceptedNoted).
async function maybeNotifyAccepted(state) {
  if (state.status !== "accepted" || state.acceptedNoted) return;
  if (!state.clientId) {
    showStatus("Accepted — link a Client Tracker client to auto-add a note.", "warn");
    return;
  }
  const url = document.getElementById("ctUrl").value.trim().replace(/\/+$/, "");
  const token = document.getElementById("ctToken").value.trim();
  if (!url || !token) return;
  const total = document.getElementById("previewTotal").textContent;
  const body =
    "Proposal " + (state.propNum || "") +
    (state.title ? " (" + state.title + ")" : "") +
    " accepted on " + new Date().toLocaleDateString() +
    " — Total: " + total;
  try {
    const res = await fetch(url + "/api/clients/" + state.clientId + "/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    acceptedNoted = true;
    state.acceptedNoted = true;
    if (currentSavedId) await API.updateProposal(currentSavedId, { data: state });
    showStatus("Note added to client in Client Tracker", "ok");
  } catch (err) {
    showStatus("Could not add note: " + err.message, "warn");
  }
}

async function loadSelectedProposal() {
  const select = document.getElementById("savedProposalsSelect");
  const id = select.value;
  if (!id) { showStatus("Select a proposal to load.", "warn"); return; }
  if (isDirty && !confirm("You have unsaved changes. Load anyway?")) return;
  try {
    const full = await API.getProposal(id);
    applyFormState(full.data);
    currentSavedId = id;
    await loadVersions();
    showStatus("Proposal loaded!", "ok");
  } catch (err) {
    alert(err.message);
  }
}

async function deleteSelectedProposal() {
  const select = document.getElementById("savedProposalsSelect");
  const id = select.value;
  if (!id) { showStatus("Select a proposal to delete.", "warn"); return; }
  if (!confirm("Delete this saved proposal and all its versions?")) return;
  try {
    await API.deleteProposal(id);
    if (currentSavedId === id) {
      currentSavedId = null;
      versions = [];
      document.getElementById("versionBar").style.display = "none";
    }
    await rebuildSavedSelect();
    showStatus("Proposal deleted.", "ok");
  } catch (err) {
    alert(err.message);
  }
}

function showStatus(msg, type) {
  const bar = document.querySelector(".save-load-bar");
  let statusEl = document.getElementById("saveStatus");
  if (!statusEl) {
    statusEl = document.createElement("span");
    statusEl.id = "saveStatus";
    statusEl.className = "save-status";
    bar.appendChild(statusEl);
  }
  statusEl.textContent = msg;
  statusEl.className = "save-status " + (type || "ok");
  setTimeout(() => updateSaveStatus(), 3000);
}

// ═══════════════════════════════════════════════
// EXPORT / IMPORT
// ═══════════════════════════════════════════════
function exportProposalJSON() {
  const state = gatherFormState();
  state.exportedAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Proposal-" + (state.propNum || "export") + ".json";
  a.click();
  URL.revokeObjectURL(url);
  showStatus("JSON exported!", "ok");
}

function importProposalJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const state = JSON.parse(e.target.result);
      if (!state.propNum && !state.clientName) {
        alert("This doesn't appear to be a valid proposal file.");
        return;
      }
      applyFormState(state);
      currentSavedId = null;
      document.getElementById("savedProposalsSelect").value = "";
      showStatus("Proposal imported from file!", "ok");
    } catch {
      alert("Failed to parse JSON file.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function exportProposalCSV() {
  const state = gatherFormState();
  let subtotal = 0;
  state.lineItems.forEach((item) => {
    subtotal += item.qty * item.price;
  });
  let discountPct = 0;
  if (state.discountTier === "Tier 1") discountPct = 5;
  else if (state.discountTier === "Tier 2") discountPct = 10;
  else if (state.discountTier === "Tier 3") discountPct = 15;
  else if (state.discountTier === "Custom") discountPct = state.customDiscountPct || 0;
  const discountAmount = subtotal * (discountPct / 100);
  const afterDiscount = subtotal - discountAmount;
  const tax = afterDiscount * 0.07;
  const total = afterDiscount + tax;

  const rows = [
    ["Proposal", state.propNum || ""],
    ["Client", state.clientName || ""],
    ["Project", state.projectName || ""],
    ["Company", state.companyName || ""],
    [],
    ["Description", "Category", "Qty", "Unit Price", "Total"],
    ...state.lineItems.map((item) => [
      item.label || "(custom item)",
      item.category || "Custom",
      item.qty,
      item.price.toFixed(2),
      (item.qty * item.price).toFixed(2),
    ]),
    [],
    ["Subtotal", "", "", "", subtotal.toFixed(2)],
    ["Discount (" + discountPct + "%)", "", "", "", "-" + discountAmount.toFixed(2)],
    ["Estimated Tax (7%)", "", "", "", tax.toFixed(2)],
    ["Total", "", "", "", total.toFixed(2)],
  ];
  const csv = rows
    .map((r) => r.map((c) => '"' + String(c === undefined || c === null ? "" : c).replace(/"/g, '""') + '"').join(","))
    .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Proposal-" + (state.propNum || "export") + ".csv";
  a.click();
  URL.revokeObjectURL(url);
  showStatus("CSV exported!", "ok");
}

// ═══════════════════════════════════════════════
// CLIENT TRACKER INTEGRATION
// ═══════════════════════════════════════════════
function loadTrackerSettings() {
  document.getElementById("ctUrl").value =
    localStorage.getItem("proposal-builder.ctUrl") || "http://localhost:3000";
  // Auto-fill the token from the shared SSO cookie (current session first).
  document.getElementById("ctToken").value =
    getCookie("slugworth_token") || localStorage.getItem("proposal-builder.ctToken") || "";
  document.getElementById("schedulerUrl").value =
    localStorage.getItem("proposal-builder.schedulerUrl") || "http://localhost:3003";
}

async function fetchClientsFromTracker() {
  const url = document.getElementById("ctUrl").value.trim().replace(/\/+$/, "");
  const token = document.getElementById("ctToken").value.trim();
  if (!url || !token) {
    alert("Enter the Client Tracker URL and API token.");
    return;
  }
  localStorage.setItem("proposal-builder.ctUrl", url);
  localStorage.setItem("proposal-builder.ctToken", token);
  try {
    const res = await fetch(url + "/api/clients", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) throw new Error("Client Tracker returned HTTP " + res.status);
    fetchedClients = await res.json();
    const select = document.getElementById("ctClientSelect");
    select.innerHTML =
      '<option value="">— Select a client —</option>' +
      fetchedClients
        .map(
          (c) =>
            '<option value="' + escAttr(c.id) + '">' +
            escHtml(c.name) +
            (c.company ? " (" + escHtml(c.company) + ")" : "") +
            "</option>"
        )
        .join("");
    showStatus(fetchedClients.length + " clients loaded from Client Tracker", "ok");
  } catch (err) {
    alert("Could not reach Client Tracker: " + err.message);
  }
}

function applyTrackerClient() {
  const select = document.getElementById("ctClientSelect");
  const id = select.value;
  if (!id) return;
  const client = fetchedClients.find((c) => String(c.id) === String(id));
  if (!client) return;
  document.getElementById("clientName").value = client.name || "";
  document.getElementById("clientEmail").value = client.email || "";
  document.getElementById("projectAddress").value = client.company || "";
  linkedClientId = client.id;
  markDirty();
  updatePreview();
  showStatus('Client "' + client.name + '" applied to proposal', "ok");
}

// ═══════════════════════════════════════════════
// WORKFLOW: ACCEPT & SCHEDULE
// ═══════════════════════════════════════════════
async function acceptAndSchedule() {
  document.getElementById("proposalStatus").value = "accepted";
  markDirty();
  updatePreview();
  await saveCurrentProposal();
  const t = new Date();
  t.setDate(t.getDate() + 1);
  document.getElementById("sched-date").value =
    t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
  document.getElementById("sched-time").value = "09:00";
  document.getElementById("schedule-dialog").showModal();
}

document.getElementById("schedule-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = document.getElementById("schedulerUrl").value.trim().replace(/\/+$/, "");
  const token = API.token;
  if (!url || !token) {
    alert("Enter the Scheduling Tool URL and make sure you're signed in.");
    return;
  }
  localStorage.setItem("proposal-builder.schedulerUrl", url);
  const state = gatherFormState();
  const payload = {
    clientName: state.clientName || "Client",
    clientEmail: state.clientEmail || null,
    date: document.getElementById("sched-date").value,
    time: document.getElementById("sched-time").value,
    durationMin: Number(document.getElementById("sched-duration").value),
    notes: "From proposal " + (state.propNum || "") + (state.title ? " — " + state.title : ""),
    clientId: state.clientId || null,
    proposalId: currentSavedId,
    proposalUrl: window.location.origin,
  };
  try {
    const res = await fetch(url + "/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || "HTTP " + res.status);
    document.getElementById("schedule-dialog").close();
    alert("Appointment created for " + payload.clientName + " on " + payload.date + " at " + payload.time + ".");
    if (confirm("Open the Scheduling Tool?")) window.open(url, "_blank");
  } catch (err) {
    alert("Could not create appointment: " + err.message);
  }
});

document.getElementById("sched-cancel").addEventListener("click", () => {
  document.getElementById("schedule-dialog").close();
});

// ═══════════════════════════════════════════════
// EMAIL (mailto:)
// ═══════════════════════════════════════════════
function emailProposal() {
  const clientEmail = document.getElementById("clientEmail").value.trim();
  if (!clientEmail) {
    alert('Please enter a client email address in the "Client Email" field.');
    return;
  }
  const companyName = document.getElementById("companyName").value || "Your Company Name";
  const companyAddress = document.getElementById("companyAddress").value;
  const repName = document.getElementById("repName").value || "Your Name";
  const repPhone = document.getElementById("repPhone").value || "(555) 123-4567";
  const propNum = document.getElementById("propNum").value || "PROP-0001";
  const clientName = document.getElementById("clientName").value || "Client";
  const address = document.getElementById("projectAddress").value || "Address";
  const total = document.getElementById("previewTotal").textContent;
  const subtotal = document.getElementById("previewSubtotal").textContent;
  const tax = document.getElementById("previewTax").textContent;
  const projectType = document.getElementById("projectType").value;
  const notes = document.getElementById("notesTerms").value;
  const validUntil = document.getElementById("previewValidUntil").textContent;
  const leadTime = document.getElementById("leadTime").value;
  const projectName = document.getElementById("projectName").value;
  const jobsite = document.getElementById("jobsiteAddress").value;
  const builderLicense = document.getElementById("builderLicense").value;
  let linesText = "";
  lineItems.forEach((item, i) => {
    const desc = item.label || "(custom item)";
    const supplyOnly = item.supplyOnly ? " [Supply Only]" : "";
    const specNote = item.specNotes ? " — " + item.specNotes : "";
    linesText += (i + 1) + ". " + desc + specNote + supplyOnly + " — " + item.qty + " x $" + item.price.toFixed(2) + " = $" + (item.qty * item.price).toFixed(2) + "\n";
  });
  let extraInfo = "";
  if (projectName) extraInfo += "\nProject Name: " + projectName;
  if (jobsite) extraInfo += "\nJob Site: " + jobsite;
  if (builderLicense) extraInfo += "\nLicense/Certification: " + builderLicense;
  if (leadTime) extraInfo += "\nLead Time: " + leadTime;
  const subject = encodeURIComponent("Project Proposal " + propNum + " — " + companyName);
  const body = encodeURIComponent(
    "Hi " + clientName + ",\n\n" +
    "Please find your project proposal below from " + companyName + ".\n\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "PROPOSAL " + propNum + "\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
    "Prepared for: " + clientName + "\n" +
    "Project address: " + address + "\n" +
    "Project type: " + projectType + "\n" +
    "Rep: " + repName + " · " + repPhone + "\n" +
    validUntil + "\n" +
    extraInfo +
    "\n\n── Scope of Work ──\n" +
    (linesText || "  (no line items)\n") +
    "\nSubtotal: " + subtotal + "\n" +
    "Tax (7%): " + tax + "\n" +
    "Total: " + total + "\n\n" +
    "── Terms ──\n" + notes + "\n\n" +
    "── Signature ──\n" +
    "Client signature: _______________\n\n" +
    "Thank you for choosing " + companyName + "!\n" +
    (companyAddress ? companyAddress + "\n" : "") +
    (repPhone ? repPhone + "\n" : "")
  );
  window.open("mailto:" + encodeURIComponent(clientEmail) + "?subject=" + subject + "&body=" + body, "_blank");
  showStatus("Email client opened!", "ok");
}

// ═══════════════════════════════════════════════
// LINE ITEMS
// ═══════════════════════════════════════════════
function addLineItem(product, qty, price) {
  const id = ++itemIdCounter;
  const p = product || { label: "", category: "Custom", price: 0 };
  lineItems.push({
    id,
    label: p.label,
    category: p.category || "Custom",
    qty: qty || 1,
    price: price !== undefined ? price : p.price,
    supplyOnly: false,
    specNotes: "",
  });
  markDirty();
  renderLineItems();
  updatePreview();
}

function removeLineItem(id) {
  lineItems = lineItems.filter((item) => item.id !== id);
  markDirty();
  renderLineItems();
  updatePreview();
}

function syncLineItemRow(row, item) {
  const prod = PRODUCT_CATALOG.find((p) => p.label === item.label);
  const cat = prod ? prod.category : "Custom";
  const badge = badgeClass(cat);
  const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
  const isCustom = !isCatalogLabel(item.label);
  const lineTotal = item.qty * item.price;
  const badgeEl = row.querySelector(".item-category-badge");
  if (badgeEl) {
    badgeEl.className = "item-category-badge " + badge;
    badgeEl.textContent = catLabel;
  }
  const select = row.querySelector(".item-select");
  const customInput = row.querySelector(".item-custom-desc");
  const qtyInput = row.querySelector(".item-qty");
  const priceInput = row.querySelector(".item-price");
  const totalInput = row.querySelector(".item-line-total");
  if (select) {
    select.value = isCustom ? "__custom__" : item.label;
  }
  if (customInput) customInput.value = isCustom ? item.label : "";
  if (qtyInput) qtyInput.value = item.qty;
  if (priceInput) priceInput.value = item.price;
  if (totalInput) totalInput.value = "$" + lineTotal.toFixed(2);
}

function renderLineItems() {
  const container = document.getElementById("lineItemsContainer");
  container.innerHTML = "";
  lineItems.forEach((item) => {
    const prod = PRODUCT_CATALOG.find((p) => p.label === item.label);
    const cat = prod ? prod.category : "Custom";
    const badge = badgeClass(cat);
    const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
    const isCustom = !isCatalogLabel(item.label);
    const lineTotal = item.qty * item.price;
    const div = document.createElement("div");
    div.className = "line-item";
    div.dataset.id = item.id;
    let optionsHtml = '<option value="">— Type custom below —</option>';
    PRODUCT_CATALOG.forEach((p) => {
      const selected = p.label === item.label ? "selected" : "";
      optionsHtml += '<option value="' + escAttr(p.label) + '" ' + selected + ">" + escHtml(p.label) + " ($" + p.price + ")</option>";
    });
    optionsHtml += '<option disabled>──────────────</option>';
    optionsHtml += '<option value="__custom__" ' + (isCustom ? "selected" : "") + ">Custom item</option>";
    div.innerHTML = `
      <div class="form-group">
        <label>
          Product/Services
          <span class="item-category-badge ${badge}">${catLabel}</span>
        </label>
        <select class="item-select">${optionsHtml}</select>
        <input type="text" class="item-custom-desc"
               placeholder="Or type custom description…"
               value="${isCustom ? escAttr(item.label) : ""}"
               style="margin-top:0.3rem;font-size:0.8rem;">
      </div>
      <div class="form-group">
        <label>Qty</label>
        <input type="number" class="item-qty" min="1" value="${item.qty}">
      </div>
      <div class="form-group">
        <label>Unit Price</label>
        <input type="number" class="item-price" min="0" step="0.01" value="${item.price}">
      </div>
      <div class="form-group">
        <label>Total</label>
        <input type="text" class="item-line-total" value="$${lineTotal.toFixed(2)}" readonly style="background:#eef;">
      </div>
      <button class="remove-btn" title="Remove">✕</button>
      <div class="item-extras">
        <label class="supply-toggle">
          <input type="checkbox" class="item-supply-only" ${item.supplyOnly ? "checked" : ""}>
          Supply Only (no install)
        </label>
        <label>
          Spec notes:
          <input type="text" class="item-spec-notes" placeholder="e.g. Low-E glass, argon fill"
                 value="${escAttr(item.specNotes || "")}">
        </label>
      </div>
    `;
    const select = div.querySelector(".item-select");
    const customInput = div.querySelector(".item-custom-desc");
    const qtyInput = div.querySelector(".item-qty");
    const priceInput = div.querySelector(".item-price");
    const supplyCheck = div.querySelector(".item-supply-only");
    const specNotesInput = div.querySelector(".item-spec-notes");
    select.addEventListener("change", function () {
      const val = this.value;
      if (val === "") return;
      if (val === "__custom__") {
        item.label = customInput.value || "";
        item.category = "Custom";
        item.price = item.price || 0;
      } else {
        const prod = PRODUCT_CATALOG.find((p) => p.label === val);
        if (prod) {
          item.label = prod.label;
          item.category = prod.category;
          item.price = prod.price;
        }
      }
      markDirty();
      syncLineItemRow(div, item);
      updatePreview();
    });
    customInput.addEventListener("input", function () {
      const currentLabel = item.label;
      const isCustomSelection = select.value === "__custom__" || !isCatalogLabel(currentLabel);
      if (isCustomSelection) {
        item.label = this.value || "";
        item.category = "Custom";
      }
      markDirty();
      syncLineItemRow(div, item);
      updatePreview();
    });
    qtyInput.addEventListener("input", function () {
      item.qty = Number(this.value) || 1;
      markDirty();
      syncLineItemRow(div, item);
      updatePreview();
    });
    priceInput.addEventListener("input", function () {
      item.price = Number(this.value) || 0;
      markDirty();
      syncLineItemRow(div, item);
      updatePreview();
    });
    supplyCheck.addEventListener("change", function () {
      item.supplyOnly = this.checked;
      markDirty();
      updatePreview();
    });
    specNotesInput.addEventListener("input", function () {
      item.specNotes = this.value;
      markDirty();
      updatePreview();
    });
    div.querySelector(".remove-btn").addEventListener("click", function () {
      removeLineItem(item.id);
    });
    container.appendChild(div);
  });
}

// ═══════════════════════════════════════════════
// PHOTO
// ═══════════════════════════════════════════════
function handlePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    photoDataUrl = e.target.result;
    document.getElementById("photoPreviewSmall").src = photoDataUrl;
    document.getElementById("photoPreviewSmall").classList.add("show");
    document.getElementById("photoPlaceholderSmall").style.display = "none";
    updatePreview();
  };
  reader.readAsDataURL(file);
}

// ═══════════════════════════════════════════════
// PREVIEW
// ═══════════════════════════════════════════════
function getInitials(name) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function updatePreview() {
  const companyName = document.getElementById("companyName").value || "Your Company Name";
  const companyTagline = document.getElementById("companyTagline").value;
  const repName = document.getElementById("repName").value || "Your Name";
  const repPhone = document.getElementById("repPhone").value || "(555) 123-4567";
  const repEmail = document.getElementById("repEmail").value || "you@yourcompany.com";
  const propNum = document.getElementById("propNum").value || "PROP-0001";
  const clientName = document.getElementById("clientName").value || "Client";
  const address = document.getElementById("projectAddress").value || "Address";
  const validUntil = document.getElementById("validUntil").value;
  const projectType = document.getElementById("projectType").value;
  const notes = document.getElementById("notesTerms").value;
  const builderLicense = document.getElementById("builderLicense").value;
  const projectName = document.getElementById("projectName").value;
  const jobsiteAddress = document.getElementById("jobsiteAddress").value;
  const discountTier = document.getElementById("discountTier").value;
  const customDiscountPct = parseFloat(document.getElementById("customDiscountPct").value) || 0;
  document.getElementById("previewIcon").textContent = getInitials(companyName) || "YC";
  document.getElementById("previewCompanyName").textContent = companyName;
  document.getElementById("previewFooterCompany").textContent = companyName;
  const taglineEl = document.getElementById("previewTagline");
  if (companyTagline) {
    taglineEl.textContent = companyTagline;
    taglineEl.style.display = "";
  } else {
    taglineEl.style.display = "none";
  }
  document.getElementById("previewRep").textContent = repName + " · " + repPhone + " · " + repEmail;
  document.getElementById("previewPropNum").textContent = propNum;
  document.getElementById("previewClientName").textContent = clientName;
  document.getElementById("previewAddress").textContent = address;
  document.getElementById("previewProjectType").textContent = projectType;
  document.getElementById("customDiscountGroup").style.display =
    discountTier === "Custom" ? "block" : "none";
  const builderInfoEl = document.getElementById("previewBuilderInfo");
  let builderParts = [];
  if (projectName) builderParts.push("Project: " + projectName);
  if (builderLicense) builderParts.push("License: " + builderLicense);
  if (jobsiteAddress) builderParts.push("Ship to: " + jobsiteAddress);
  if (discountTier && discountTier !== "Standard") {
    builderParts.push("Pricing: " + discountTier);
  }
  if (builderParts.length > 0) {
    builderInfoEl.style.display = "block";
    builderInfoEl.textContent = builderParts.join(" · ");
  } else {
    builderInfoEl.style.display = "none";
  }
  if (validUntil) {
    const d = new Date(validUntil + "T00:00:00");
    document.getElementById("previewValidUntil").textContent =
      "Valid until " + d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } else {
    document.getElementById("previewValidUntil").textContent = "Valid until —";
  }
  const paymentTerms = document.getElementById("paymentTerms").value;
  const leadTime = document.getElementById("leadTime").value;
  let combinedNotes = notes;
  if (paymentTerms && !notes.includes(paymentTerms)) {
    combinedNotes = paymentTerms + "\n" + notes;
  }
  document.getElementById("previewNotes").textContent = combinedNotes;
  const leadTimeEl = document.getElementById("previewLeadTime");
  leadTimeEl.textContent = leadTime ? "Lead time: " + leadTime : "";
  const previewPhoto = document.getElementById("previewPhoto");
  const placeholder = document.getElementById("previewPhotoPlaceholder");
  if (photoDataUrl) {
    previewPhoto.src = photoDataUrl;
    previewPhoto.classList.add("show");
    placeholder.style.display = "none";
  } else {
    previewPhoto.classList.remove("show");
    placeholder.style.display = "flex";
  }
  const tbody = document.getElementById("previewTableBody");
  tbody.innerHTML = "";
  let subtotal = 0;
  lineItems.forEach((item) => {
    const total = item.qty * item.price;
    subtotal += total;
    const tr = document.createElement("tr");
    let desc = item.label || "(custom item)";
    if (item.supplyOnly) desc += " [Supply Only]";
    if (item.specNotes) desc += "\n" + item.specNotes;
    tr.innerHTML = `
      <td>${escHtml(desc)}</td>
      <td>${item.qty}</td>
      <td>$${item.price.toFixed(2)}</td>
      <td>$${total.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
  if (lineItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:#999;text-align:center;padding:1rem 0;">No line items added yet</td></tr>';
  }
  let discountPct = 0;
  if (discountTier === "Tier 1") discountPct = 5;
  else if (discountTier === "Tier 2") discountPct = 10;
  else if (discountTier === "Tier 3") discountPct = 15;
  else if (discountTier === "Custom") discountPct = customDiscountPct || 0;
  const discountAmount = subtotal * (discountPct / 100);
  const afterDiscount = subtotal - discountAmount;
  const tax = afterDiscount * 0.07;
  const total = afterDiscount + tax;
  document.getElementById("previewDiscountLabel").textContent = discountPct + "%";
  document.getElementById("previewDiscount").textContent = "-$" + discountAmount.toFixed(2);
  document.getElementById("previewSubtotal").textContent = "$" + subtotal.toFixed(2);
  document.getElementById("previewTax").textContent = "$" + tax.toFixed(2);
  document.getElementById("previewTotal").textContent = "$" + total.toFixed(2);
}

// ═══════════════════════════════════════════════
// PRINT
// ═══════════════════════════════════════════════
function printProposal() {
  const companyName = document.getElementById("companyName").value || "Your Company Name";
  const previewContent = document.getElementById("previewPaper").innerHTML;
  const w = window.open("", "_blank");
  w.document.write("<!DOCTYPE html>\n<html><head><title>Proposal — " + companyName + "</title>\n" +
    "<style>\n" +
    "  @page { margin: 0.5in; }\n" +
    "  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a1a; padding: 0; margin: 0; }\n" +
    "  .print-paper { max-width: 700px; margin: 0 auto; padding: 20px; }\n" +
    "  .preview-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0a2e4a; padding-bottom: 1.25rem; margin-bottom: 1.25rem; position: relative; }\n" +
    "  .preview-header::after { content: ''; position: absolute; bottom: -2px; left: 0; width: 60px; height: 2px; background: #c9a84c; }\n" +
    "  .preview-header .company { display: flex; align-items: center; gap: 0.75rem; }\n" +
    "  .preview-header .icon { width: 44px; height: 44px; background: transparent; border: none; border-radius: 0; display: flex; align-items: center; justify-content: center; }\n" +
    "  .preview-header .icon.icon-initials { background: #0a2e4a; color: #fff; border-radius: 50%; font-weight: 700; font-size: 1rem; letter-spacing: 0.5px; }\n" +
    "  .preview-header .company-name { font-size: 1.05rem; font-weight: 700; color: #0a2e4a; letter-spacing: 0.3px; }\n" +
    "  .preview-header .company-tagline { font-size: 0.65rem; color: #c9a84c; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; margin-top: 0.1rem; }\n" +
    "  .preview-header .company-contact { font-size: 0.7rem; color: #777; margin-top: 0.15rem; }\n" +
    "  .prop-num { font-size: 0.95rem; font-weight: 700; color: #fff; background: #0a2e4a; padding: 0.35rem 0.75rem; border-radius: 6px; letter-spacing: 1px; white-space: nowrap; }\n" +
    "  .preview-title { text-align: center; margin: 1.25rem 0 0.5rem; font-size: 1.3rem; font-weight: 600; color: #0a2e4a; letter-spacing: 0.5px; }\n" +
    "  .preview-client { text-align: center; font-size: 0.85rem; color: #666; margin-bottom: 1.25rem; padding-bottom: 1rem; border-bottom: 1px solid #e8ecf0; }\n" +
    "  .preview-client strong { color: #0a2e4a; }\n" +
    "  .preview-photo { width: 100%; height: 180px; object-fit: cover; border-radius: 8px; margin-bottom: 1.2rem; }\n" +
    "  .preview-section-title { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1.5px; color: #0a2e4a; font-weight: 700; margin-bottom: 0.6rem; padding-bottom: 0.35rem; border-bottom: 1px solid #e0e4ea; }\n" +
    "  .preview-table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 0.85rem; }\n" +
    "  .preview-table th { text-align: left; padding: 0.5rem; border-bottom: 2px solid #0a2e4a; color: #0a2e4a; font-size: 0.7rem; text-transform: uppercase; }\n" +
    "  .preview-table td { padding: 0.5rem; border-bottom: 1px solid #eee; white-space: pre-wrap; }\n" +
    "  .preview-table td:last-child, .preview-table th:last-child { text-align: right; }\n" +
    "  .preview-table td:nth-child(2), .preview-table th:nth-child(2), .preview-table td:nth-child(3), .preview-table th:nth-child(3) { text-align: center; }\n" +
    "  .preview-totals { margin-left: auto; width: 220px; margin-bottom: 1.2rem; }\n" +
    "  .preview-totals .row { display: flex; justify-content: space-between; padding: 0.3rem 0; font-size: 0.85rem; }\n" +
    "  .preview-totals .row.total { font-weight: 700; font-size: 1.1rem; border-top: 2px solid #0a2e4a; padding-top: 0.5rem; margin-top: 0.3rem; color: #0a2e4a; }\n" +
    "  .preview-notes { font-size: 0.78rem; color: #555; background: #f6f8fa; padding: 0.8rem; border-radius: 6px; margin-bottom: 1.2rem; white-space: pre-wrap; border-left: 3px solid #c9a84c; }\n" +
    "  .preview-footer { display: flex; justify-content: space-between; border-top: 1px solid #dde2e8; padding-top: 1rem; margin-top: 0.5rem; font-size: 0.72rem; color: #888; }\n" +
    "  .preview-footer .valid-until { font-weight: 600; color: #0a2e4a; }\n" +
    "  .sig-line { text-align: right; }\n" +
    "  .sig-line .line { width: 180px; border-top: 1px solid #333; margin-top: 0.3rem; display: inline-block; }\n" +
    "  .print-builder-info { font-size: 0.8rem; color: #555; margin-bottom: 0.8rem; padding: 0.4rem 0.6rem; background: #f6f8fa; border-radius: 4px; }\n" +
    "</style></head><body>\n" +
    '<div class="print-paper">' + previewContent + "</div>\n" +
    "<script>window.onload=function(){window.print();window.close();}<\\/script>\n" +
    "</body></html>");
  w.document.close();
}

// ═══════════════════════════════════════════════
// RESET
// ═══════════════════════════════════════════════
function resetProposal() {
  if (!confirm("Reset the form? Unsaved changes will be lost.")) return;
  document.getElementById("repName").value = "Your Name";
  document.getElementById("repPhone").value = "(555) 123-4567";
  document.getElementById("repEmail").value = "you@yourcompany.com";
  document.getElementById("propNum").value = "PROP-0001";
  document.getElementById("proposalTitle").value = "";
  document.getElementById("clientEmail").value = "";
  document.getElementById("clientName").value = "";
  document.getElementById("projectAddress").value = "";
  document.getElementById("projectType").value = "Product & Service Delivery";
  document.getElementById("builderLicense").value = "";
  document.getElementById("projectName").value = "";
  document.getElementById("jobsiteAddress").value = "";
  document.getElementById("discountTier").value = "Standard";
  document.getElementById("customDiscountPct").value = 0;
  document.getElementById("customDiscountGroup").style.display = "none";
  document.getElementById("paymentTerms").value = "50% deposit due at signing, balance due on completion.";
  document.getElementById("leadTime").value = "";
  const t = new Date();
  document.getElementById("validUntil").value = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
  document.getElementById("notesTerms").value = "50% deposit due at signing, balance due on completion. Standard warranty applies to all products and services provided.";
  document.getElementById("photoInput").value = "";
  photoDataUrl = null;
  document.getElementById("photoPreviewSmall").classList.remove("show");
  document.getElementById("photoPreviewSmall").src = "";
  document.getElementById("photoPlaceholderSmall").style.display = "flex";
  lineItems = [];
  itemIdCounter = 0;
  currentSavedId = null;
  linkedClientId = null;
  versions = [];
  document.getElementById("versionBar").style.display = "none";
  document.getElementById("savedProposalsSelect").value = "";
  isDirty = false;
  defaultItems.forEach((item) => {
    const prod = PRODUCT_CATALOG.find((p) => p.label === item.label);
    addLineItem(prod || { label: item.label, category: "Custom", price: 0 }, item.qty);
  });
  updatePreview();
  showStatus("Form reset.", "ok");
}

// ═══════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════
function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function escAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
async function init() {
  const t = new Date();
  document.getElementById("validUntil").value = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
  const searchInput = document.getElementById("searchSaved");
  if (searchInput) {
    searchInput.addEventListener("input", rebuildSavedSelect);
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        loadSelectedProposal();
      }
    });
  }
  document.getElementById("discountTier").addEventListener("change", function () {
    document.getElementById("customDiscountGroup").style.display =
      this.value === "Custom" ? "block" : "none";
    markDirty();
    updatePreview();
  });
  loadTrackerSettings();
  await loadCatalog();
  await rebuildSavedSelect();
  updateCatalogBadge();
  if (lineItems.length === 0) {
    defaultItems.forEach((item) => {
      const prod = PRODUCT_CATALOG.find((p) => p.label === item.label);
      addLineItem(prod || { label: item.label, category: "Custom", price: 0 }, item.qty);
    });
  }
  updatePreview();
  markDirty();

  // Deep link: ?proposal=<id> loads that proposal (used by the Scheduling Tool's
  // "Open Proposal" link).
  const params = new URLSearchParams(window.location.search);
  const proposalParam = params.get("proposal");
  if (proposalParam) {
    try {
      const full = await API.getProposal(proposalParam);
      applyFormState(full.data);
      currentSavedId = full.id;
      await loadVersions();
      showStatus("Proposal loaded from link!", "ok");
    } catch {
      showStatus("Could not load linked proposal.", "warn");
    }
  }
}

// ─── Boot ───
async function boot() {
  if (API.token) {
    try {
      await API.me();
      showApp();
      init();
    } catch {
      API.setToken(null);
      showAuth();
    }
  } else {
    showAuth();
  }
}
boot();