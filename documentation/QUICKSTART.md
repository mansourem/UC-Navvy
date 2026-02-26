# Quick Start Guide - Multi-Floor Campus Navigation

## Getting Started in 5 Minutes

### Step 1: Access the Application

Open `multi_floor_navigation.html` in any modern web browser.

### Step 2: Select Your Starting Location

1. Click the "Starting Location" dropdown
2. Choose a building (e.g., "Rhodes Hall")
3. Click a floor button (e.g., "Ground Floor")
4. A green marker will appear on the map

### Step 3: Select Your Destination

1. Click the "Destination" dropdown
2. Choose a different building or same building with different floor
3. Click a floor button
4. A compass will update on the map

### Step 4: Find Your Route

Click the **"Find Route"** button. The system will:
- Calculate the optimal path
- Display distance and estimated walking time
- Show turn-by-turn directions
- Draw the route on the map in red

### Step 5: Follow the Directions

Use the turn-by-turn list to navigate:
- Buildings are highlighted in **blue**
- Floors are shown in **italics**
- Green marker = start point
- Red marker = destination

### Pro Tips

**🔄 Quick Swap**
- Click "⇅ Swap Locations" to instantly swap start and end points

**♿ Accessibility**
- Check "Wheelchair accessible only" for accessible routes
- Check "Avoid stairs" to use elevators only

**📍 Zoom to Route**
- After finding a route, the map automatically zooms to show the complete path

**🗺️ Explore**
- Click on floor plan outlines to see building/floor details
- Drag the map to explore the campus

---

## Configuration for Your Campus

### Adding Your First Building

1. **Edit `building_floors.json`**

2. **Add your building** in the `buildings` array:

```json
{
  "building_id": "my_building",
  "name": "My Building Name",
  "coordinates": [
    [latitude, longitude],
    [latitude, longitude],
    [latitude, longitude],
    [latitude, longitude]
  ],
  "floors": [
    {
      "floor_id": "my_b_ground",
      "floor_name": "Ground Floor",
      "floor_number": 0,
      "elevation_m": 0,
      "geojson": {
        "type": "Feature",
        "properties": {
          "name": "My Building - Ground Floor",
          "floor_id": "my_b_ground"
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [latitude, longitude],
              [latitude, longitude],
              [latitude, longitude],
              [latitude, longitude],
              [latitude, longitude]
            ]
          ]
        }
      }
    }
  ],
  "entrances": [
    {
      "node_id": "node_my_b_ent_1",
      "floor_id": "my_b_ground",
      "accessible": true,
      "wheelchair_accessible": true
    }
  ],
  "elevator_nodes": [
    {
      "node_id": "node_elevator_my_1",
      "floors": ["my_b_ground", "my_b_1"],
      "accessible": true
    }
  ],
  "stairs": [
    {
      "node_id": "node_stairs_my_1",
      "floors": ["my_b_ground", "my_b_1"],
      "accessible": true
    }
  ]
}
```

3. **Add nodes to `nodes.json`** for your building:

```json
{
  "node_id": "node_my_b_ent_1",
  "latitude": 39.1330,
  "longitude": -84.5165,
  "location": "my_building",
  "floor": "my_b_ground",
  "entrance": true,
  "elevator": false
}
```

4. **Add connections to `edges.json`**:

```json
{
  "node": "node_my_b_ent_1",
  "connections": {
    "node_next_node": true,
    "node_another_node": true
  }
}
```

### Getting GeoJSON Floor Plan Coordinates

#### Option 1: Using Google Earth or Maps

1. Open Google Earth
2. Find your building
3. Use the measurement tool to find corner coordinates
4. Record latitude and longitude for each corner

#### Option 2: Using Online Tools

- **Geojson.io**: Draw polygons and export as GeoJSON
  - Visit: https://geojson.io
  - Draw your floor plan
  - Export as GeoJSON
  - Copy the coordinates

#### Option 3: From Existing Floor Plans

If you have DXF or floor plan images:
1. Use a GIS tool to import floor plans
2. Convert to GeoJSON format
3. Extract coordinate arrays

### Understanding Coordinates Format

In `building_floors.json`, coordinates follow this pattern:

```javascript
"coordinates": [
  [39.1335, -84.5155],  // Top-left [latitude, longitude]
  [39.1330, -84.5155],  // Top-right
  [39.1330, -84.5165],  // Bottom-right
  [39.1335, -84.5165],  // Bottom-left
  [39.1335, -84.5155]   // Back to start (must close polygon)
]
```

**Important**: The first and last coordinates MUST be the same to close the polygon.

---

## Data File Reference

### Three Main Data Files

#### 1. **building_floors.json**

Contains complete building layout information.

**Key Fields:**
- `building_id`: Unique identifier (lowercase with underscores)
- `name`: Display name
- `coordinates`: Building boundary as polygon
- `floors[]`: Array of floors in building
- `floors.floor_id`: Unique floor ID (e.g., "rhodes_ground")
- `floors.floor_number`: Numeric floor level
- `floors.elevation_m`: Real-world elevation in meters
- `floors.geojson`: GeoJSON feature for floor plan
- `entrances[]`: Entry point nodes
- `elevator_nodes[]`: Elevator access points
- `stairs[]`: Stairwell locations

#### 2. **nodes.json**

Individual waypoints for routing.

**Key Fields:**
- `node_id`: Unique node identifier
- `latitude`, `longitude`: GPS coordinates
- `location`: Building name
- `floor`: Which floor this node is on
- `entrance`: Boolean - is this an entrance?
- `elevator`: Boolean - is this an elevator?

#### 3. **edges.json**

Connections between nodes (walkable paths).

**Key Fields:**
- `node`: Source node ID
- `connections`: Object of connected node IDs with true value

---

## Troubleshooting

### Map shows empty

- **Check browser console** (F12 → Console tab)
- **Verify file paths** - make sure building_floors.json, nodes.json, edges.json exist
- **Check CORS** - if loading from remote server, verify CORS headers

### Route not found

- **Verify entrance nodes** - make sure entrance node IDs exist in nodes.json
- **Check connections** - ensure edges connect the buildings
- **Check floor IDs** - make sure floor IDs match exactly

### Performance is slow

- **Reduce detail** - simplify polygon coordinates
- **Check console** - for any JavaScript errors
- **Try smaller area** - test with fewer floors/buildings first

### Floor plans not showing

- **Verify geojson structure** - use https://geojson.io to validate
- **Check coordinates order** - must close polygon (first = last)
- **Verify coordinate format** - should be [latitude, longitude]

### Route takes wrong path

- **Check edge connections** - verify all required edges exist
- **Verify floor change penalties** - adjust in multi_floor_routing.js
- **Try different entrances** - algorithm tests all entrance combinations

---

## Data Collection Checklist

Before adding a new building, gather:

- [ ] Building name and identifier
- [ ] Building boundary coordinates (lat/lon at 4 corners)
- [ ] Number of floors
- [ ] Entrance locations (lat/lon)
- [ ] Elevator locations (lat/lon, which floors)
- [ ] Stair locations (lat/lon, which floors)
- [ ] Connection nodes to other buildings
- [ ] Node IDs for each waypoint

---

## Common Configurations

### Multi-Floor Building with Single Entrance

```json
{
  "building_id": "simple_building",
  "name": "Simple Building",
  "floors": [
    { "floor_id": "sb_ground", "floor_number": 0 },
    { "floor_id": "sb_1", "floor_number": 1 },
    { "floor_id": "sb_2", "floor_number": 2 }
  ],
  "entrances": [
    { "node_id": "node_sb_ent", "floor_id": "sb_ground" }
  ],
  "elevator_nodes": [
    { "node_id": "node_sb_elev", "floors": ["sb_ground", "sb_1", "sb_2"] }
  ],
  "stairs": [
    { "node_id": "node_sb_stairs", "floors": ["sb_ground", "sb_1", "sb_2"] }
  ]
}
```

### Building with Multiple Entrances

```json
{
  "entrances": [
    { "node_id": "node_north_entrance", "floor_id": "floor_ground" },
    { "node_id": "node_south_entrance", "floor_id": "floor_ground" },
    { "node_id": "node_loading_dock", "floor_id": "floor_ground", "wheelchair_accessible": false }
  ]
}
```

### Connected Buildings (Campus)

```json
{
  "connector_nodes": [
    {
      "node_id": "node_bridge_path",
      "from_building": "building_1",
      "to_building": "building_2",
      "description": "Underground tunnel"
    }
  ]
}
```

---

## Next Steps

1. ✅ **Review system** - Open multi_floor_navigation.html
2. 📋 **Collect data** - Gather building coordinates and layout
3. ✏️ **Create configuration** - Add your buildings to building_floors.json
4. 🧪 **Test** - Start with one building, then add more
5. 🎨 **Customize** - Adjust colors, speed estimates, penalties
6. 📱 **Deploy** - Host on web server for campus access

---

## Support

For detailed information, see **MULTIFLOOR_README.md**

For API reference, see **multi_floor_routing.js** comments

---

**Happy Navigating! 🧭**
