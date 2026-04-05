const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { Client } = require("pg");

const DATA_FILE = path.join(__dirname, "data/Baldwin");
const BATCH_SIZE = 100;

function isJsonFile(name) {
  return name.toLowerCase().endsWith(".json");
}
function isEdgeFile(name) {
  return name.toLowerCase().includes("edge");
}

async function importEdges(client, filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const { edges } = JSON.parse(raw);

  if (!Array.isArray(edges) || edges.length === 0) {
    console.error("No edges found in", filePath);
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

  console.log(`Importing nodes from ${DATA_FILE}...`);
  const floorDirs = fs.readdirSync(DATA_FILE, { withFileTypes: true }); 
  console.log(`Found ${floorDirs.length} sets of edges in ${DATA_FILE}.`);

  for (const dir of floorDirs) {
    const floorID = dir.name;
    const floorPath = path.join(DATA_FILE, floorID);
    
    const files = fs.readdirSync(floorPath, { withFileTypes: true });
    console.log(`Found ${files.length} files in ${floorPath}.`); 

    for (const file of files) {
      if (!file.isFile()) continue;
      if (!isJsonFile(file.name)) continue;
      if (!isEdgeFile(file.name)) continue;

      console.log(`Processing file ${dir.name}/${file.name}...`);
      try {
        await importEdges(client, path.join(floorPath, file.name));
      } catch (err) {
        console.error(`❌ Failed on ${floorPath}/${file.name}: ${err.message}`);
      }
    }
  }

   await client.end();
  console.log("🎉 Finished importing all building floors.");
}

main().catch((e) => {
  console.error("❌ Import failed:", e.message);
  process.exit(1);
});