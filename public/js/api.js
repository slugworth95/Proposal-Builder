// Thin fetch wrapper around the Proposal Builder API.
// Stores the bearer token in localStorage.

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function clearAuthCookie() {
  document.cookie = "slugworth_token=; Path=/; SameSite=Lax; Max-Age=0";
}

const API = {
  token: localStorage.getItem("proposal-builder.token") || getCookie("slugworth_token") || null,

  async request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const res = await fetch(path, { ...options, headers });

    if (res.status === 401) {
      this.setToken(null);
      throw new ApiError(401, "Session expired. Please sign in again.");
    }
    if (res.status === 204) return null;

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`);
    }
    return data;
  },

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem("proposal-builder.token", token);
    else {
      localStorage.removeItem("proposal-builder.token");
      clearAuthCookie();
    }
  },

  register(name, email, password) {
    return this.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  },

  login(email, password) {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  me() {
    return this.request("/api/auth/me");
  },

  logout() {
    return this.request("/api/auth/logout", { method: "POST" }).catch(() => null);
  },

  // Proposals
  listProposals(params = {}) {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    const q = qs.toString();
    return this.request(`/api/proposals${q ? `?${q}` : ""}`);
  },

  getProposal(id) {
    return this.request(`/api/proposals/${id}`);
  },

  createProposal({ data }) {
    return this.request("/api/proposals", { method: "POST", body: JSON.stringify({ data }) });
  },

  updateProposal(id, { data }) {
    return this.request(`/api/proposals/${id}`, { method: "PUT", body: JSON.stringify({ data }) });
  },

  deleteProposal(id) {
    return this.request(`/api/proposals/${id}`, { method: "DELETE" });
  },

  // Versions
  listVersions(proposalId) {
    return this.request(`/api/proposals/${proposalId}/versions`);
  },

  createVersion(proposalId, { label, data }) {
    return this.request(`/api/proposals/${proposalId}/versions`, {
      method: "POST",
      body: JSON.stringify({ label, data }),
    });
  },

  deleteVersion(proposalId, versionId) {
    return this.request(`/api/proposals/${proposalId}/versions/${versionId}`, { method: "DELETE" });
  },

  // Catalog
  listCatalog() {
    return this.request("/api/catalog");
  },

  createCatalogItem(item) {
    return this.request("/api/catalog", { method: "POST", body: JSON.stringify(item) });
  },

  updateCatalogItem(id, item) {
    return this.request(`/api/catalog/${id}`, { method: "PUT", body: JSON.stringify(item) });
  },

  deleteCatalogItem(id) {
    return this.request(`/api/catalog/${id}`, { method: "DELETE" });
  },

  resetCatalog() {
    return this.request("/api/catalog/reset", { method: "POST" });
  },
};