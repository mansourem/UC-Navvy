# UC Navvy – Enhanced Navigation System

Campus navigation for the University of Cincinnati with multi-floor, multi-building, indoor/outdoor, accessible routing, and database-backed floorplans.

## New Features

### Multi-Building + Multi-Floor Navigation
Routes between any two buildings, automatically selecting optimal entrance pairs. Floor transitions are penalized to prefer direct routes; elevator/stair nodes are flagged for routing decisions.

### Indoor/Outdoor Combined Routing  
Path segments are automatically classified (outdoor / indoor / floor_change) and rendered with distinct colors:
- Red = outdoor path
- Blue dashed = indoor path  
- Green = accessible route

Turn-by-turn instructions are generated: "Enter building", "Take elevator up to floor 3", "Continue outdoors (~80m)"

### Accessible Routes (ADA)
Toggle the Accessible Route switch to:
- Skip edges marked `accessible: false`
- Require elevator nodes at floor transitions (no stairs)
- Draw route in green

### Database API (Supabase via Render)
`https://uc-navvy-api.onrender.com` — falls back to local JSON automatically.

| Endpoint | Purpose |
|---|---|
| GET /health | Health check |
| GET /api/nodes | All navigation nodes |
| GET /api/edges | All navigation edges |
| GET /api/buildings | Buildings + entrance nodes |
| GET /api/buildings/:id/floors | Available floors |
| GET /api/floorplans/:buildingId/:floor | GeoJSON floorplan |

### Floorplan Rendering (GeoJSON)
Floorplans auto-load when a route passes through a building. Each floor = one GeoJSON FeatureCollection (`Layer_XX` naming, e.g. `Layer_06` = floor 6).

## New Files

| File | Purpose |
|---|---|
| `routing.html` | Full-featured route planner UI (replaces old version) |
| `api.js` | Database API service with local fallback |
| `routing-engine.js` | Enhanced Dijkstra (multi-floor, accessible, annotated) |
| `floorplan-manager.js` | Indoor floorplan loading & rendering |

## Database Schema

**nodes:** node_id, latitude, longitude, floor, location, building_id, entrance, elevator, staircase, accessible

**edges:** edge_id, from_node, to_node, accessible, indoor, weight

**buildings:** building_id, name, coordinates (JSONB), entrance_nodes (TEXT[]), floors (TEXT[])

**floorplans:** floorplan_id, building_id, floor, geojson (JSONB)

## Running Locally

```bash
python3 -m http.server 8080
# open http://localhost:8080/routing.html
```
