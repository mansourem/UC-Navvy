# UC Navvy – Data Contributor Guide

How to add floorplans, routes, buildings, and nodes to UC Navvy.

---

## Table of Contents

1. [Overview](#overview)
2. [Adding a Building](#adding-a-building)
3. [Adding Nodes & Routes](#adding-nodes--routes)
4. [Adding Floorplans](#adding-floorplans)
5. [Connecting Everything Together](#connecting-everything-together)
6. [Database vs Local JSON](#database-vs-local-json)
7. [Coordinate Conventions](#coordinate-conventions)
8. [Data Schema Reference](#data-schema-reference)
9. [Tools & Tips](#tools--tips)

---

## Overview

UC Navvy's navigation is built from three types of data:

| Data | File / Table | Purpose |
|---|---|---|
| **Buildings** | `buildings.json` / `buildings` table | Polygon footprints, entrance node IDs, available floors |
| **Nodes** | `nodes.json` / `nodes` table | Points along walkways, hallways, entrances, elevators |
| **Edges** | `edges.json` / `edges` table | Connections between nodes (what paths exist) |
| **Floorplans** | GeoJSON files / `floorplans` table | Wall/room drawings rendered as indoor map overlays |

All four must be updated when adding a new building or route. The router can only find a path if the new nodes are connected to the existing graph.

---

## Adding a Building

### Step 1 — Draw the Building Polygon

Use [geojson.io](https://geojson.io) to draw the building footprint:

1. Go to [geojson.io](https://geojson.io) and navigate to UC's campus (`39.1317, -84.5158`)
2. Select the **Polygon** tool and click around the building's roofline
3. Close the polygon by clicking the first point again
4. Copy the coordinates from the right-hand JSON panel

> **Coordinate order warning:** GeoJSON uses `[longitude, latitude]` but UC Navvy (Leaflet) uses `[latitude, longitude]`. You must swap each pair when copying into `buildings.json`.
>
> GeoJSON gives you: `[-84.518, 39.134]`  
> You need to enter: `[39.134, -84.518]`

### Step 2 — Add to `buildings.json`

Open `buildings.json` and append a new entry to the array:

```json
{
  "name": "Zimmer Hall",
  "building_id": "zimmer_hall",
  "coordinates": [
    [39.13400, -84.51800],
    [39.13385, -84.51775],
    [39.13360, -84.51785],
    [39.13360, -84.51820],
    [39.13385, -84.51830]
  ],
  "entrance_nodes": ["node_200", "node_201"],
  "floors": ["1", "2", "3"]
}
```

| Field | Description |
|---|---|
| `name` | Display name shown in dropdowns |
| `building_id` | Lowercase, underscored unique ID used by the API |
| `coordinates` | Polygon vertices as `[lat, lng]` pairs |
| `entrance_nodes` | Node IDs of the building's door nodes (add these in the next step) |
| `floors` | List of floor numbers available — drives the floor selector dropdown |

### Step 3 — Add to the Database

```sql
INSERT INTO buildings (building_id, name, coordinates, entrance_nodes, floors)
VALUES (
  'zimmer_hall',
  'Zimmer Hall',
  '[[39.134,-84.518],[39.13385,-84.51775],[39.1336,-84.51785],[39.1336,-84.5182],[39.13385,-84.5183]]',
  ARRAY['node_200', 'node_201'],
  ARRAY['1', '2', '3']
);
```

---

## Adding Nodes & Routes

Nodes are the points the router moves between. Edges are the connections between them. Every walkway, hallway, intersection, entrance, elevator, and staircase needs nodes.

### Step 1 — Plan Your Nodes

Before placing anything, identify what you need:

- **Entrance nodes** — one per door, at the building threshold. These connect indoor and outdoor graphs.
- **Intersection nodes** — at every path fork, hallway junction, or turn.
- **Elevator nodes** — at each elevator door on each floor. Set `elevator: true`.
- **Staircase nodes** — at each stairwell entry on each floor. Set `staircase: true`.
- **Waypoint nodes** — along long straight paths every ~10–20 meters for routing accuracy.

### Step 2 — Place Nodes on a Map

Use [geojson.io](https://geojson.io):

1. Navigate to the building
2. Use the **Marker** tool to click node positions
3. For each marker, add properties in the sidebar: `node_id`, `floor`, `entrance`, `elevator`, etc.
4. Export as GeoJSON, then convert to UC Navvy's node format

Or place them directly by editing `nodes.json`. Node IDs must be unique — continue from the highest existing `node_N` number.

### Step 3 — Add to `nodes.json`

Append each node to the `nodes` array:

```json
{
  "node_id": "node_200",
  "latitude": 39.13395,
  "longitude": -84.51808,
  "floor": "outside",
  "location": "outside",
  "building_id": null,
  "entrance": false,
  "elevator": false,
  "staircase": false,
  "accessible": true
}
```

**For an entrance node** (sits at a building door, connects indoor/outdoor):

```json
{
  "node_id": "node_201",
  "latitude": 39.13388,
  "longitude": -84.51800,
  "floor": "1",
  "location": "Zimmer Hall",
  "building_id": "zimmer_hall",
  "entrance": true,
  "elevator": false,
  "staircase": false,
  "accessible": true
}
```

**For an elevator node** (one per floor, same shaft):

```json
{
  "node_id": "node_210",
  "latitude": 39.13382,
  "longitude": -84.51795,
  "floor": "2",
  "location": "Zimmer Hall",
  "building_id": "zimmer_hall",
  "entrance": false,
  "elevator": true,
  "staircase": false,
  "accessible": true
}
```

| Field | Values | Notes |
|---|---|---|
| `node_id` | `"node_N"` | Must be unique across all nodes |
| `latitude` / `longitude` | decimal degrees | Use 6+ decimal places |
| `floor` | `"outside"`, `"1"`, `"2"`, ... | String, not integer |
| `location` | `"outside"` or building name | Must match building `name` field exactly |
| `building_id` | building_id or `null` | `null` for outdoor nodes |
| `entrance` | `true` / `false` | Marks nodes used as building entry/exit points |
| `elevator` | `true` / `false` | Required for accessible floor routing |
| `staircase` | `true` / `false` | Skipped in accessible-only mode |
| `accessible` | `true` / `false` | Whether the node itself is ADA accessible |

### Step 4 — Add Edges to `edges.json`

Edges define which nodes are connected. The format is an adjacency list — each entry lists a node and all its neighbors.

**Adding a new isolated path** — add a new path entry:

```json
{
  "node": "node_200",
  "connections": {
    "node_201": true,
    "node_150": true
  }
}
```

**Connecting to an existing node** — find that node's entry and add your new node to its connections:

```json
{
  "node": "node_150",
  "connections": {
    "node_149": true,
    "node_151": true,
    "node_200": true
  }
}
```

> **Both directions must exist.** If node_200 connects to node_150, then node_150 must also list node_200. The router is bidirectional but the data must be explicit.

**For accessible edge metadata** (used when Accessible Route is enabled):

```json
{
  "node": "node_200",
  "connections": { "node_201": true },
  "accessible": { "node_201": true }
}
```

Set `"accessible": false` for any edge that is inaccessible (e.g., a step, narrow passage, or door without a ramp). The accessible router will skip those edges entirely.

### Step 5 — Add to the Database

```sql
-- Nodes
INSERT INTO nodes (node_id, latitude, longitude, floor, location, building_id, entrance, elevator, staircase, accessible)
VALUES
  ('node_200', 39.13395, -84.51808, 'outside', 'outside', null, false, false, false, true),
  ('node_201', 39.13388, -84.51800, '1', 'Zimmer Hall', 'zimmer_hall', true, false, false, true);

-- Edges
INSERT INTO edges (from_node, to_node, accessible, indoor)
VALUES
  ('node_200', 'node_201', true, false),
  ('node_201', 'node_200', true, false);
```

---

## Adding Floorplans

Floorplans are GeoJSON `FeatureCollection` files where each feature is a `LineString` representing a wall, corridor, or room boundary. They match the format of the provided `Layer_06.geojson` example.

### Layer Naming Convention

The layer name encodes the floor number: `Layer_XX` where `XX` is the zero-padded floor number.

| Layer Name | Floor |
|---|---|
| `Layer_01` | Floor 1 |
| `Layer_06` | Floor 6 |
| `Layer_B1` | Basement 1 (convention) |

### Step 1 — Prepare the GeoJSON

If you have CAD drawings (DWG/DXF), export them to GeoJSON using QGIS:

1. Open QGIS → **Layer > Add Layer > Add Vector Layer** → select your DWG/DXF
2. Set the correct CRS (should be `WGS84 / EPSG:4326`)
3. **Layer > Save As** → Format: GeoJSON, CRS: EPSG:4326
4. Confirm coordinates land near `39.13°N, 84.51°W`

If drawing manually on [geojson.io](https://geojson.io), draw LineStrings along walls and room boundaries, then export.

### Step 2 — Add to the Database

```sql
INSERT INTO floorplans (building_id, floor, geojson)
VALUES (
  'zimmer_hall',
  '1',
  '{"type":"FeatureCollection","name":"Layer_01","features":[...]}'
);
```

Or via the API (if a POST endpoint is available):

```bash
curl -X POST https://uc-navvy-api.onrender.com/api/floorplans \
  -H "Content-Type: application/json" \
  -d '{
    "building_id": "zimmer_hall",
    "floor": "1",
    "geojson": { "type": "FeatureCollection", "features": [...] }
  }'
```

### Step 3 — Add Local Fallback (Optional, for development)

In `api.js`, update the `dbFloorplan` function to look for local files when the API is unavailable:

```js
async function dbFloorplan(bid, floor) {
  return apiFetch(
    `/api/floorplans/${bid}/${String(floor).padStart(2,'0')}`,
    `floorplans/${bid}_floor${floor}.geojson`  // local fallback path
  );
}
```

Then save your GeoJSON as `floorplans/zimmer_hall_floor1.geojson`.

### Step 4 — Update the Building's Floor List

Make sure the `floors` array on the building entry includes the floor you just added, otherwise it won't appear in the floor selector:

```json
"floors": ["1", "2", "3"]
```

---

## Connecting Everything Together

A new building is only routable if its nodes are connected to the rest of the graph. Here's how to verify the chain is complete:

```
Outdoor path node (existing)
    ↕  edge
New outdoor waypoint node
    ↕  edge
Entrance node (floor: "1", entrance: true)
    ↕  edge
Indoor hallway nodes (floor: "1")
    ↕  edge
Elevator/staircase node (floor: "1", elevator: true)
    ↕  edge  ← this edge crosses floors
Elevator/staircase node (floor: "2", elevator: true)
    ↕  edge
Indoor hallway nodes (floor: "2")
```

**Checklist before testing a new building:**

- [ ] Building polygon added to `buildings.json` / DB
- [ ] `entrance_nodes` list on the building references real node IDs
- [ ] Entrance nodes exist in `nodes.json` / DB with `entrance: true`
- [ ] Entrance nodes have edges connecting them to outdoor path nodes
- [ ] Entrance nodes have edges connecting them to indoor hallway nodes
- [ ] All floor transitions go through `elevator: true` or `staircase: true` nodes
- [ ] Elevator nodes on different floors are connected by edges
- [ ] `floors` array on building matches the floors that have floorplan data
- [ ] All edge connections are bidirectional

---

## Database vs Local JSON

UC Navvy always tries the database first and falls back to local JSON automatically. The API status indicator in the route planner shows which source is active.

| | Database (Supabase) | Local JSON |
|---|---|---|
| **Use for** | Production, shared data | Development, testing |
| **Files** | `buildings`, `nodes`, `edges`, `floorplans` tables | `buildings.json`, `nodes.json`, `edges.json` |
| **API** | `https://uc-navvy-api.onrender.com` | Served as static files |
| **Updates live?** | Yes | Requires file edit + page reload |

When working locally, edit the JSON files. When ready to go live, insert the same data into the database.

---

## Coordinate Conventions

| Context | Order | Example |
|---|---|---|
| UC Navvy nodes / buildings | `[latitude, longitude]` | `[39.13255, -84.51628]` |
| GeoJSON floorplans | `[longitude, latitude]` | `[-84.51628, 39.13255]` |
| Leaflet `L.marker()` / `L.polygon()` | `[latitude, longitude]` | `[39.13255, -84.51628]` |
| Google Maps URL | `latitude,longitude` | `39.13255,-84.51628` |

Floorplan GeoJSON coordinates stay in GeoJSON order (`[lng, lat]`) — Leaflet's `L.geoJSON()` handles the conversion automatically.

---

## Data Schema Reference

### Node

```json
{
  "node_id": "node_200",
  "latitude": 39.13395,
  "longitude": -84.51808,
  "floor": "outside",
  "location": "outside",
  "building_id": null,
  "entrance": false,
  "elevator": false,
  "staircase": false,
  "accessible": true
}
```

### Edge (local `edges.json` format)

```json
{
  "node": "node_200",
  "connections": {
    "node_201": true,
    "node_150": true
  },
  "accessible": {
    "node_201": true,
    "node_150": false
  }
}
```

### Building

```json
{
  "name": "Zimmer Hall",
  "building_id": "zimmer_hall",
  "coordinates": [
    [39.13400, -84.51800],
    [39.13385, -84.51775],
    [39.13360, -84.51785],
    [39.13360, -84.51820],
    [39.13385, -84.51830]
  ],
  "entrance_nodes": ["node_201", "node_202"],
  "floors": ["1", "2", "3"]
}
```

### Floorplan GeoJSON

```json
{
  "type": "FeatureCollection",
  "name": "Layer_01",
  "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" } },
  "features": [
    {
      "type": "Feature",
      "properties": { "fid": 1, "Layer": "01", "Text": null },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [-84.51800, 39.13388],
          [-84.51790, 39.13382]
        ]
      }
    }
  ]
}
```

---

## Tools & Tips

**Recommended tools:**

| Tool | Use |
|---|---|
| [geojson.io](https://geojson.io) | Place nodes, draw polygons, export GeoJSON |
| [QGIS](https://qgis.org) | Convert CAD/DWG floorplans to GeoJSON |
| [kepler.gl](https://kepler.gl) | Visualize large node/edge datasets |
| Supabase dashboard | Direct DB inserts and table inspection |

**Finding coordinates quickly:**

Right-click any point in Google Maps → the coordinates appear at the top of the context menu. Remember to swap to `[lat, lng]` order for node and building data.

**Verifying your data:**

Open `routing.html`, enable **Show All Nodes** in the options panel, and zoom in to your new building. You should see your nodes appear as colored dots. Green = entrance, yellow = elevator, blue = regular. If a node doesn't appear, its coordinates may be wrong.

**Testing a route:**

Select your new building as start or destination and click **Find Route**. If no route is found, the most common causes are:
1. Entrance nodes aren't listed in the building's `entrance_nodes` array
2. Entrance nodes aren't connected to the outdoor path graph via edges
3. A typo in a node ID somewhere in the chain

**Bulk importing with MappingTest.py:**

The `MappingTest.py` file in the repo is a good place to build a bulk import script. A CSV with columns `node_id, lat, lng, floor, building_id, entrance, elevator` can be read with `pandas` and inserted into Supabase via the `supabase-py` client or direct `psycopg2` connection.# UC Navvy – Data Contributor Guide