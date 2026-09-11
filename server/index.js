// Proposal Builder — Express server.
// Serves the frontend from /public and exposes the JSON API under /api.
const path = require("node:path");
const express = require("express");
const { register, login, requireAuth } = require("./auth");
const proposalsRouter = require("./routes/proposals");
const catalogRouter = require("./routes/catalog");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: "10mb" })); // proposals can carry a base64 project photo
app.use(express.static(path.join(__dirname, "..", "public")));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ service: "proposal-builder", status: "ok", version: "2.0.0" });
});

// Auth
app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, and password are required" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }
  try {
    const { user, token } = register({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      password: String(password),
    });
    res.status(201).json({ user, token });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "An account with that email already exists" });
    }
    throw err;
  }
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }
  const result = login({
    email: String(email).trim().toLowerCase(),
    password: String(password),
  });
  if (!result) return res.status(401).json({ error: "Invalid email or password" });
  res.json(result);
});

// Protected API
app.use("/api/proposals", requireAuth, proposalsRouter);
app.use("/api/catalog", requireAuth, catalogRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Proposal Builder running at http://localhost:${PORT}`);
});