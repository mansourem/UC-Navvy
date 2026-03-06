require("dotenv").config();
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const { Pool } = require("pg");

const app = express();

// Android + web clients
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "50mb" }));

if (!process.env.SUPABASE_DB_URL) {
  console.error("Missing SUPABASE_DB_URL in .env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

// Health check
app.get("/health", async (req, res) => {
  try {
    const r = await pool.query("select 1 as ok");
    res.json({ ok: true, db: r.rows[0].ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 1) Get one floorplan layer
app.get("/api/floorplan/:building/:floor", async (req, res) => {
  const building = req.params.building;
  const floor = parseInt(req.params.floor, 10);
  if (!Number.isFinite(floor)) return res.status(400).json({ error: "floor must be an integer" });

  try {
    const r = await pool.query(
      "select geojson from floor_layers where building_id = $1 and floor = $2",
      [building, floor]
    );

    if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });

    // Add caching (optional but good)
    res.set("Cache-Control", "public, max-age=3600"); // 1 hour
    res.json(r.rows[0].geojson);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// 2) Get campus-wide routing graph
app.get("/api/campus/graph", async (req, res) => {
  try {
    const r = await pool.query(
      "select nodes, edges from campus_graph where id = 1"
    );

    if (r.rowCount === 0) return res.status(404).json({ error: "campus_graph missing (id=1)" });

    res.set("Cache-Control", "public, max-age=3600");
    res.json({ nodes: r.rows[0].nodes, edges: r.rows[0].edges });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Optional: list buildings available
app.get("/api/buildings", async (req, res) => {
  try {
    const r = await pool.query(
      "select distinct building_id from floor_layers order by building_id"
    );
    res.json(r.rows.map(x => x.building_id));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

const port = parseInt(process.env.PORT || "3001", 10);
app.listen(port, "0.0.0.0", () => {
  console.log(`API running on http://localhost:${port}`);
});