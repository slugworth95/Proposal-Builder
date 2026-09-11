// Proposal Builder — starter app logic.
// Drafts are stored in localStorage so they survive page reloads.

const STORAGE_KEY = "proposal-builder.drafts";

function loadDrafts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveDrafts(drafts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

function renderDrafts() {
  const list = document.getElementById("draft-list");
  const drafts = loadDrafts();

  if (drafts.length === 0) {
    list.innerHTML = '<li class="empty">No drafts yet.</li>';
    return;
  }

  list.innerHTML = drafts
    .map(
      (d) =>
        `<li><strong>${escapeHtml(d.client)}</strong> — ${escapeHtml(
          d.title
        )} ($${Number(d.price || 0).toFixed(2)})</li>`
    )
    .join("");
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

document.getElementById("proposal-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const draft = {
    client: document.getElementById("client-name").value.trim(),
    title: document.getElementById("project-title").value.trim(),
    scope: document.getElementById("project-scope").value.trim(),
    price: document.getElementById("project-price").value,
    createdAt: new Date().toISOString(),
  };

  const drafts = loadDrafts();
  drafts.push(draft);
  saveDrafts(drafts);

  const status = document.getElementById("status");
  status.textContent = `Draft saved for ${draft.client}.`;
  status.hidden = false;

  event.target.reset();
  renderDrafts();
});

renderDrafts();