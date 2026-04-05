// require("dotenv").config();
// const fs = require("fs");
// const path = require("path");
// // const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { Client } = require("pg");

const DATA_FILE = path.join(__dirname, "data", "outside_nodes.json");
const BATCH_SIZE = 100;

// if (!process.env.VITE_SUPABASE_URL) {
//   console.error("Missing VITE_SUPABASE_URL in .env");
//   process.exit(1);
// }

// const pool = new Pool({
//   connectionString: process.env.VITE_SUPABASE_URL,
//   ssl: { rejectUnauthorized: false },
// });

async function importNodes(client) {
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  const { nodes } = JSON.parse(raw);

  if (!Array.isArray(nodes) || nodes.length === 0) {
    console.error("No nodes found in", DATA_FILE);
    process.exit(1);
  }

  console.log(`Importing ${nodes.length} nodes in batches of ${BATCH_SIZE}...`);

  // const client = await pool.connect();
  // console.log("Connected to database.");

  try {
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${i / BATCH_SIZE + 1} (${batch.length} nodes)...`);
      await client.query("BEGIN");
      for (const node of batch) {
        const { id, lat, lng, building, floor, entrance, ada, type } = node;
        await client.query(
          `INSERT INTO nodes (id, lat, lng, building, floor, entrance, ada, type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             lat      = EXCLUDED.lat,
             lng      = EXCLUDED.lng,
             building = EXCLUDED.building,
             floor    = EXCLUDED.floor,
             entrance = EXCLUDED.entrance,
             ada      = EXCLUDED.ada,
             type     = EXCLUDED.type`,
          [id, lat, lng, building, floor ?? null, entrance, ada, type]
        );
        inserted++;
      }
      await client.query("COMMIT");

      console.log(`  Processed ${Math.min(i + BATCH_SIZE, nodes.length)} / ${nodes.length}`);
    }

    console.log(`Done. Upserted: ${inserted}, skipped: ${skipped}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Import failed:", err.message);
    process.exit(1);
  } finally {
    // client.release();
    // await pool.end();
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL || process.env.VITE_SUPABASE_URL;

  if (!dbUrl) {
    throw new Error("No database URL found. Set DATABASE_URL (or VITE_SUPABASE_URL) in .env");
  }

  if (dbUrl.startsWith("https://") || dbUrl.startsWith("http://")) {
    throw new Error(
      `DATABASE_URL looks like an HTTP URL, not a PostgreSQL connection string.\n` +
      `Expected format: postgresql://postgres:PASSWORD@db.<project>.supabase.co:5432/postgres\n` +
      `Got: ${dbUrl}`
    );
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connected to database.");
  await importNodes(client);

  await client.end();
  console.log("Finished importing all nodes.");
}

main().catch((e) => {
  console.error("Import failed:", e.message || e);
  process.exit(1);
});