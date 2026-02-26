# Multi-Floor, Multi-Building Campus Navigation System

A comprehensive indoor/outdoor navigation routing system for university campuses that supports multi-floor buildings and inter-building pathfinding.

## Features

- **Multi-Floor Navigation**: Navigate between different floors within buildings using elevators/stairs
- **Multi-Building Routing**: Find routes between buildings on campus
- **GeoJSON Floor Plans**: Support for GeoJSON polygon outlines of floor plans
- **Accessibility Options**: Filter routes by wheelchair accessibility and elevator availability
- **Visual Route Display**: Display routes on an interactive Leaflet map
- **Dijkstra Pathfinding**: Optimized shortest-path algorithm with floor transition penalties
- **Distance Calculation**: Haversine distance calculation for accurate routing
- **Floor-Aware Cost Function**: Applies penalties for floor changes to prefer same-floor routes

## System Architecture

### Core Components

1. **multi_floor_routing.js** - Core routing engine
   - Dijkstra's algorithm with floor awareness
   - Intra-building (within building, multi-floor) routing
   - Inter-building (between buildings) routing
   - Distance calculations and path formatting

2. **multi_floor_interface.js** - UI Controller
   - Building selection interface
   - Floor selector buttons
   - Route calculation and display
   - Map rendering with Leaflet

3. **multi_floor_navigation.html** - User interface
   - Navigation panel with building/floor selectors
   - Accessibility options
   - Route information display
   - Interactive map

4. **building_floors.json** - Building configuration
   - Building definitions with GeoJSON floor plans
   - Floor information with elevation data
   - Entrance node locations
   - Elevator and stair locations

5. **nodes.json** - Navigation nodes
   - Building nodes with lat/lon coordinates
   - Floor associations
   - Entrance/elevator flags

6. **edges.json** - Navigation edges
   - Connections between nodes
   - Defines walkable paths on campus

## Data Structure

### building_floors.json Format

```json
{
  "type": "FeatureCollection",
  "buildings": [
    {
      "building_id": "rhodes_hall",
      "name": "Rhodes Hall",
      "coordinates": [[lat, lon], ...],
      "floors": [
        {
          "floor_id": "rhodes_ground",
          "floor_name": "Ground Floor",
          "floor_number": 0,
          "elevation_m": 0,
          "geojson": {
            "type": "Feature",
            "properties": {...},
            "geometry": {
              "type": "Polygon",
              "coordinates": [[[lat, lon], ...]]
            }
          }
        }
      ],
      "entrances": [
        {
          "node_id": "node_6",
          "floor_id": "rhodes_ground",
          "accessible": true,
          "wheelchair_accessible": true
        }
      ],
      "elevator_nodes": [
        {
          "node_id": "node_elevator_rhodes_1",
          "floors": ["rhodes_ground", "rhodes_1", "rhodes_2", "rhodes_3"],
          "accessible": true
        }
      ],
      "stairs": [
        {
          "node_id": "node_stairs_rhodes_1",
          "floors": ["rhodes_ground", "rhodes_1", "rhodes_2", "rhodes_3"],
          "accessible": true
        }
      ]
    }
  ],
  "connector_nodes": [
    {
      "node_id": "node_outdoor_bridge_1",
      "from_building": "rhodes_hall",
      "to_building": "baldwin_hall",
      "description": "Outdoor bridge between Rhodes and Baldwin"
    }
  ]
}
```

### nodes.json Format

```json
{
  "nodes": [
    {
      "node_id": "node_1",
      "latitude": 39.13377777777778,
      "longitude": -84.5165,
      "location": "outside",
      "floor": "outside",
      "entrance": false,
      "elevator": false
    }
  ]
}
```

### edges.json Format

```json
{
  "paths": [
    {
      "node": "node_7",
      "connections": {
        "node_24": true,
        "node_8": true
      }
    }
  ]
}
```

## Usage

### Opening the Application

Open `multi_floor_navigation.html` in a web browser.

### Finding a Route

1. **Select Starting Location**:
   - Choose a building from "Starting Location" dropdown
   - Select a floor using the floor selector buttons

2. **Select Destination**:
   - Choose a building from "Destination" dropdown
   - Select a floor using the floor selector buttons

3. **Set Accessibility Options** (optional):
   - Check "Wheelchair accessible only" to filter routes
   - Check "Avoid stairs" to prioritize elevator usage

4. **Find Route**:
   - Click "Find Route" button
   - The system will calculate the shortest path
   - Route will be displayed on map with turn-by-turn directions

5. **Clear Route**:
   - Click "Clear" to remove the route from map

### Swapping Locations

- Click "⇅ Swap Locations" to quickly swap start and destination

## Routing Algorithm

### Dijkstra with Floor Awareness

The system uses Dijkstra's algorithm with a modified cost function:

- **Base Cost**: Haversine distance between nodes
- **Floor Change Penalty**: 5 meters per floor level (applies friction to floor changes)
- **State**: (node_id, floor_id) tuple - same node on different floors are separate states

### Route Finding Process

1. **Intra-Building Routing** (same building):
   - Find shortest path between start and end nodes
   - Account for floor transitions via elevators/stairs
   - Apply floor change penalties to discourage unnecessary floor changes

2. **Inter-Building Routing** (different buildings):
   - Route within start building to entrance
   - Route outdoors between building entrances
   - Route within end building from entrance
   - Combine all path segments
   - Try all entrance combinations and select shortest

### Floor Transition Costs

- **Elevator**: Included in base distance calculation
- **Stairs**: Included in base distance calculation
- **Floor Change Penalty**: 5 meters per floor difference to discourage multi-floor routes

## API Reference

### window.MultiFloorRouter

Global object exposing routing functions.

#### findCompletePath(startBuildingId, startFloorId, startNodeId, endBuildingId, endFloorId, endNodeId)

Finds complete route between two locations.

**Parameters:**
- `startBuildingId` (string): Building ID for start location
- `startFloorId` (string): Floor ID for start location
- `startNodeId` (string): Node ID for start location
- `endBuildingId` (string): Building ID for destination
- `endFloorId` (string): Floor ID for destination
- `endNodeId` (string): Node ID for destination

**Returns:** Array of [nodeId, floorId] tuples representing the path

**Example:**
```javascript
const path = window.MultiFloorRouter.findCompletePath(
  'rhodes_hall', 'rhodes_ground', 'node_6',
  'baldwin_hall', 'baldwin_1', 'node_15'
);
```

#### formatPathForDisplay(path)

Converts path array to human-readable format.

**Parameters:**
- `path` (array): Path array from findCompletePath

**Returns:** Array of segment objects:
```javascript
{
  node_id: string,
  floor_id: string,
  floor_name: string,
  building_name: string,
  latitude: number,
  longitude: number
}
```

#### getEntranceForFloor(buildingId, floorId)

Gets entrance node for a specific floor or nearest available.

**Parameters:**
- `buildingId` (string): Building ID
- `floorId` (string): Floor ID

**Returns:** Entrance object with node_id and floor_id

#### calculatePathDistance(path)

Calculates total path distance in meters.

**Parameters:**
- `path` (array): Path array from findCompletePath

**Returns:** Distance in meters (number)

## Customization

### Adding New Buildings

1. Add building to `building_floors.json`:
   ```json
   {
     "building_id": "new_building",
     "name": "New Building Name",
     "coordinates": [[lat, lon], ...],
     "floors": [
       {
         "floor_id": "new_b_ground",
         "floor_name": "Ground Floor",
         "floor_number": 0,
         "geojson": { ... }
       }
     ],
     "entrances": [ ... ],
     "elevator_nodes": [ ... ],
     "stairs": [ ... ]
   }
   ```

2. Add nodes to `nodes.json` for the building

3. Add edges to `edges.json` connecting the nodes

### Adjusting Floor Change Penalties

In `multi_floor_routing.js`, modify the `getFloorChangePenalty()` function:

```javascript
function getFloorChangePenalty(fromFloor, toFloor) {
  if (fromFloor === toFloor) return 0;
  
  const floorDifference = Math.abs(parseInt(fromFloor.split('_')[1] || '0') - 
                                    parseInt(toFloor.split('_')[1] || '0'));
  return floorDifference * 5; // Change multiplier here
}
```

### Changing Walking Speed Estimate

In `multi_floor_interface.js`, modify the `displayRoute()` function:

```javascript
const estimatedTime = Math.ceil(distance / 1.4 / 60); // 1.4 m/s = 5 km/h
// Change 1.4 to your preferred walking speed in m/s
```

## Performance Considerations

- **Dijkstra with Floor States**: O((V+E) log V) where V = nodes × floors, E = edges
- **Large campuses**: Consider spatial partitioning or A* algorithm
- **Real-time routing**: Cache intermediate results
- **Mobile optimization**: Consider simplified path representation

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (iOS 12+)
- Requires ES6+ JavaScript support

## Dependencies

- **Leaflet.js** (1.7.1+): Map rendering
- **OpenStreetMap**: Tile provider (can be changed)
- Vanilla JavaScript (no jQuery required)

## File Structure

```
UC-Navvy/
├── multi_floor_navigation.html      # Main UI page
├── multi_floor_interface.js         # UI controller
├── multi_floor_routing.js           # Routing engine
├── building_floors.json             # Building/floor config
├── nodes.json                       # Navigation nodes
├── edges.json                       # Navigation edges
├── styles.css                       # Styling
└── README.md                        # This file
```

## Troubleshooting

### "Nodes or edges not loaded yet"
- Wait a few seconds for data files to load
- Check browser console for network errors

### Route not found
- Verify entrance nodes exist for selected buildings
- Check that edges connect the buildings
- Ensure floor IDs match between different data files

### Performance issues
- For large campuses, consider implementing A* algorithm
- Use spatial indexing for node lookups
- Reduce number of displayed floor plans

## Future Enhancements

1. **A* Algorithm**: Faster pathfinding with heuristics
2. **Multi-Modal Routes**: Consider stairs vs elevators vs escalators
3. **Real-Time Updates**: Dynamic obstacle avoidance
4. **Turn-By-Turn Navigation**: Voice guidance integration
5. **Offline Maps**: Local tile caching
6. **Mobile App**: Native iOS/Android version
7. **Room-Level Routing**: Navigate to specific rooms
8. **Accessibility Heat Maps**: Identify most accessible routes

## License

[Add your license here]

## Contact

[Add support contact information]

---

**Last Updated:** February 26, 2026
**Version:** 1.0.0
