const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { Client } = require("pg");

// ===== EDIT THIS =====
const ROOT_DIR = "./v2_layers/"; 
// Example expected structure:
// ROOT_DIR/
//   Rhodes/Layer_01.geojson
//   Rhodes/Layer_02.geojson
//   Baldwin/Layer_01.geojson
// =====================

function readJson(fp) {
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}

function isGeoJsonFile(name) {
  return name.toLowerCase().endsWith(".geojson");
}

// Extract floor number from filenames like:
// "1.geojson", "01.geojson", "Layer_01.geojson", "Layer_9.geojson"
function parseFloorNumber(filename) {
  const base = path.basename(filename, path.extname(filename));
  const match = base.match(/(\d+)/);
  if (!match) {
    throw new Error(`Could not extract floor number from filename: ${filename}`);
  }
  return parseInt(match[1], 10);
}

async function importFloor(client, buildingId, floorNum, geojsonPath) {
  const geo = readJson(geojsonPath);

  if (!geo || typeof geo !== "object") {
    throw new Error(`GeoJSON parse failed: ${geojsonPath}`);
  }

  if (geo.type !== "FeatureCollection") {
    console.warn(`⚠️ ${geojsonPath} has type "${geo.type}" (expected FeatureCollection)`);
  }

  await client.query(
    `
    insert into floor_layers (building_id, floor, geojson)
    values ($1, $2, $3::jsonb)
    on conflict (building_id, floor)
    do update set geojson = excluded.geojson
    `,
    [buildingId, floorNum, JSON.stringify(geo)]
  );

  const check = await client.query(
    `select building_id, floor, jsonb_array_length(geojson->'features') as feature_count
     from floor_layers
     where building_id = $1 and floor = $2`,
    [buildingId, floorNum]
  );

  console.log(`✅ Imported ${buildingId} floor ${floorNum}:`, check.rows[0]);
}

async function main() {
  if (!process.env.VITE_SUPABASE_URL) {
    throw new Error("VITE_SUPABASE_URL missing. Check your .env file.");
  }

  const client = new Client({
    connectionString: process.env.VITE_SUPABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const entries = fs.readdirSync(ROOT_DIR, { withFileTypes: true });
  const buildingDirs = entries.filter(e => e.isDirectory());

  for (const dir of buildingDirs) {
    const buildingId = dir.name;
    const buildingPath = path.join(ROOT_DIR, buildingId);

    const files = fs.readdirSync(buildingPath, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile()) continue;
      if (!isGeoJsonFile(file.name)) continue;

      const floorNum = parseFloorNumber(file.name);
      const geojsonPath = path.join(buildingPath, file.name);

      try {
        await importFloor(client, buildingId, floorNum, geojsonPath);
      } catch (err) {
        console.error(`❌ Failed on ${buildingId}/${file.name}: ${err.message}`);
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