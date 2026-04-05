const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { Client } = require("pg");

const DATA_FILE = path.join(__dirname, "data", "outside_edges.json");
const BATCH_SIZE = 100;

async function importEdges(client) {
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  const { edges } = JSON.parse(raw);

  if (!Array.isArray(edges) || edges.length === 0) {
    console.error("No edges found in", DATA_FILE);
    process.exit(1);
  }

  console.log(`Importing ${edges.length} edges in batches of ${BATCH_SIZE}...`);

  try {
    let inserted = 0;

    for (let i = 0; i < edges.length; i += BATCH_SIZE) {
      const batch = edges.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${i / BATCH_SIZE + 1} (${batch.length} edges)...`);

      await client.query("BEGIN");
      for (const edge of batch) {
        const { id, from, to, type, ada } = edge;
        await client.query(
          `INSERT INTO edges (id, from_node, to_node, type, ada)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             from_node = EXCLUDED.from_node,
             to_node   = EXCLUDED.to_node,
             type      = EXCLUDED.type,
             ada       = EXCLUDED.ada`,
          [id, from, to, type, ada]
        );
        inserted++;
      }
      await client.query("COMMIT");

      console.log(`  Processed ${Math.min(i + BATCH_SIZE, edges.length)} / ${edges.length}`);
    }

    console.log(`Done. Upserted: ${inserted}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Import failed:", err.message);
    process.exit(1);
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL || process.env.VITE_SUPABASE_URL;

  if (!dbUrl) {
    throw new Error("No database URL found. Set DATABASE_URL in .env");
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
  await importEdges(client);

  await client.end();
  console.log("Finished importing all edges.");
}

main().catch((e) => {
  console.error("Import failed:", e.message || e);
  process.exit(1);
});
