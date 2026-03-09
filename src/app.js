const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

// Routes
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const geoportalRoutes = require("./routes/geoportal.routes");
const kpiRoutes = require("./routes/kpi.routes");
const financeRoutes = require("./routes/finance.routes");
const projetsRoutes = require("./routes/projets.routes");
const fondsRoutes = require("./routes/fonds.routes");
const projetsImportRoutes = require("./routes/projets.import.routes");
const financementRoutes = require("./routes/financement.routes");
const programmesRoutes = require("./routes/programmes.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const beneficiairesRoutes = require("./routes/beneficiaires.routes");

const app = express();

app.use(cors());
app.use(express.json());

// Fichiers statiques (UI)
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Auth & Admin
app.use("/api", authRoutes);
app.use("/api", adminRoutes);

// API modules (protégés par permissions à l'intérieur des routers)
app.use("/api", geoportalRoutes);
app.use("/api", kpiRoutes);
app.use("/api", financeRoutes);
app.use("/api", projetsRoutes);
app.use("/api", fondsRoutes);
app.use("/api", projetsImportRoutes);
app.use("/api", financementRoutes);
app.use("/api/programmes", programmesRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", beneficiairesRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

module.exports = app;
