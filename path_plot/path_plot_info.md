## Floorplan Access
---

file type: geojson  
naming schema: `floorplans/{building}/Layer_{floor}.geojson`  
path: /home/elaine/senior_design/floorplans/

## Defining Paths
---
Graph format (same schema for indoor and outdoor):
```
GET /api/graph/{building}   — indoor building graph (all floors)
GET /api/graph/campus       — outdoor campus walking graph
```

Node shape:
```
  {
    id:       number   — unique integer within this graph
    lat:      number
    lng:      number
    floor:    number | null   — null for outdoor nodes
    entrance: boolean  — true = building entrance/exit point
    ada:      boolean  — false = not wheelchair accessible
    type:     'corridor'|'room'|'elevator'|'stair'|'ramp'|'entrance'|'outdoor'
    label:    string   — optional human-readable name
  }
```

Edge shape:
```
  {
    id:       number   — unique integer within this graph
    from:     number   — node id
    to:       number   — node id
    weight:   number   — metres (auto-calculated from coords if absent)
    type:     'corridor'|'elevator'|'stair'|'ramp'|'outdoor'|'entrance'
    ada:      boolean  — false = not wheelchair accessible (e.g. stair edges)
    directed: boolean  — default false (bidirectional)
  }
```

Stitching indoor → outdoor:
- Entrance nodes in a building graph and the campus graph share the same numeric `id`.
- mergeGraphs() deduplicates by id so they become a single connected graph.