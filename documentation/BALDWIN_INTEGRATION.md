# Baldwin Hall Multi-Floor Integration

## Overview

**Date:** February 26, 2026

Baldwin Hall has been successfully integrated into the UC-Navvy multi-floor navigation system with **6 detailed floor plans** extracted from architectural GeoJSON files.

## Floor Configuration

| Floor ID | Level Name | Floor Number | Elevation (m) | GeoJSON Source |
|----------|-----------|--------------|---------------|----------------|
| `baldwin_4` | Level 4 | 4 | 0.0 | Layer_04.geojson |
| `baldwin_5` | Level 5 | 5 | 3.5 | Layer_05.geojson |
| `baldwin_6` | Level 6 | 6 | 7.0 | Layer_06.geojson |
| `baldwin_7` | Level 7 | 7 | 10.5 | Layer_07.geojson |
| `baldwin_8` | Level 8 | 8 | 14.0 | Layer_08.geojson |
| `baldwin_9` | Level 9 | 9 | 17.5 | Layer_09.geojson |

## Building Coordinates

**Overall Building Footprint:**
```
Northwest: 39.133275, -84.516991
Northeast: 39.133275, -84.516378
Southeast: 39.132518, -84.516378
Southwest: 39.132518, -84.516991
```

**Center Point:** ~39.1329, -84.5168

## Floor Plan Details

### Source Data
- **Format:** GeoJSON FeatureCollections with complex geometries
- **Coordinate System:** WGS84 (EPSG:4326)
- **Resolution:** 15 decimal places precision
- **Contents:** Detailed architectural elements (walls, doors, rooms, stairs, elevators)
- **Location:** `/home/elaine/senior_design/UC-Navvy/baldwin/` folder

### Detailed Geometries
Each floor plan includes extensive architectural detail:
- Wall outlines (Polygon and LineString features)
- Door and window placements
- Stairwell configurations
- Elevator locations
- Room boundaries
- Circulation paths

### Simplified Navigation Geometry
For routing efficiency, each floor also includes a simplified rectangular bounding polygon that represents the overall floor footprint.

## Navigation Features

### Entrance
- **Node ID:** `node_bd_entrance_main`
- **Floor:** Level 4 (baldwin_4)
- **Coordinates:** 39.1329, -84.5167
- **Accessible:** Yes ✓
- **Wheelchair Accessible:** Yes ✓

### Elevators
- **Node ID:** `node_elevator_bd_1`
- **Serves:** All 6 floors (Levels 4-9)
- **Accessible:** Yes ✓
- **Coordinates:** 39.1327, -84.5170

### Stairs
- **Node ID:** `node_stairs_bd_1`
- **Serves:** All 6 floors (Levels 4-9)
- **Accessible:** Yes ✓
- **Coordinates:** 39.1327, -84.5165

## System Integration

### Files Modified
1. **building_floors.json**
   - Added complete Baldwin Hall configuration
   - Embedded simplified floor plan geometries
   - Configured 6 floors with proper floor IDs

2. **nodes.json**
   - Added 4 Baldwin navigation nodes:
     - Main entrance
     - Elevator 1
     - Stairs 1
     - Interior waypoint L4

3. **edges.json**
   - Added connections between Baldwin nodes
   - Enables pathfinding within building

### Files Created
1. **baldwin_hall_config.json**
   - Intermediate configuration file
   - Contains full Baldwin building definition
   - Used as reference during integration

## Usage Examples

### Navigate Within Baldwin
**Start:** Baldwin Hall, Level 4
**End:** Baldwin Hall, Level 7

The system will:
1. Find optimal path from entrance to elevator
2. Account for vertical travel (3 floors)
3. Apply floor change penalties
4. Display turn-by-turn directions

### Navigate From Another Building to Baldwin
**Start:** Rhodes Hall, Level 2
**End:** Baldwin Hall, Level 6

The system will:
1. Route within Rhodes Hall to ground floor exit
2. Calculate outdoor path to Baldwin entrance
3. Route inside Baldwin to destination floor
4. Handle building transitions automatically

## Accessing Detailed Floor Plans

### View Architectural Details
The detailed GeoJSON files contain rich architectural information:

```python
import json

# Load Baldwin Level 4 details
with open('baldwin/Layer_04.geojson', 'r') as f:
    floor_4 = json.load(f)

# Iterate through architectural features
for feature in floor_4['features']:
    f_type = feature['geometry']['type']
    layer = feature['properties']['Layer']
    print(f"Feature: {layer} - {f_type}")
```

### Feature Properties
Each feature contains metadata:
- `fid`: Feature ID
- `Layer`: Layer identifier (04-09)
- `EntityHandle`: CAD entity ID
- `SubClasses`: CAD object type (walls, doors, etc.)
- `Linetype`: Line styling information

## Next Steps & Recommendations

### 1. Add More Entry Points
Currently Baldwin has 1 entrance on Level 4. Consider adding:
- Additional entrances on other floors
- Loading dock access points
- Emergency exits

### 2. Detailed Interior Nodes
Add nodes for:
- Each major room or suite
- Atrium nodes for cross-floor visibility
- Accessible restroom locations
- Emergency assembly areas

### 3. Connect Campus Pathways
Link Baldwin with:
- Rhodes Hall/other adjacent buildings
- Outdoor campus paths
- Parking areas
- Public transit stops

### 4. Room-Level Routing
Extract room information from GeoJSON:
- Create node for each significant room
- Link to room directory database
- Enable "navigate to room 407" functionality

### 5. Accessibility Enhancements
- Mark non-accessible stairs clearly
- Identify service elevators vs. public
- Locate accessible parking nearby
- Map accessible entrances per floor

## Technical Notes

### Coordinate Precision
The GeoJSON files use 15 decimal places for coordinate precision, which provides accuracy to ~1.1mm - far more than needed for building-scale navigation. The simplified floor boundary polygons reduce this to 6 decimal places (~0.11m) for better performance.

### Floor Height Estimation
Elevations are calculated as:
```
elevation = (floor_number - 4) * 3.5 meters
```
Adjust the multiplier (3.5m) if your actual floor heights differ.

### Performance Considerations
- Detailed features (1000s of LineStrings/Polygons) are stored in GeoJSON
- Simplified boundaries (4-5 point rectangles) are used for routing
- This balance provides detail reference while maintaining speed

## File Reference

### For Developers

**Access Baldwin configuration in code:**
```javascript
// From multi_floor_routing.js or multi_floor_interface.js
const baldwin = window.MultiFloorRouter.getBuildingById('baldwin_hall');
const level4 = window.MultiFloorRouter.getFloorById('baldwin_4');
```

**Find route to Baldwin:**
```javascript
const path = window.MultiFloorRouter.findCompletePath(
  'rhodes_hall', 'rhodes_ground', 'node_6',
  'baldwin_hall', 'baldwin_6', 'node_bd_entrance_main'
);
```

### For GIS/CAD Specialists

**Original source files location:**
```
/home/elaine/senior_design/UC-Navvy/baldwin/
├── Layer_04.geojson  (Level 4)
├── Layer_05.geojson  (Level 5)
├── Layer_06.geojson  (Level 6)
├── Layer_07.geojson  (Level 7)
├── Layer_08.geojson  (Level 8)
└── Layer_09.geojson  (Level 9)
```

## Troubleshooting

### Route Won't Find Baldwin
**Solution:** Verify that:
1. Baldwin entrance node exists: `node_bd_entrance_main`
2. Baldwin nodes are in `nodes.json`
3. Baldwin edges are in `edges.json`
4. Building ID matches: `baldwin_hall`

### Baldwin Floor Plans Not Displaying
**Solution:**
1. Check browser console for GeoJSON parsing errors
2. Validate GeoJSON syntax at https://geojsonlint.com
3. Verify coordinates are in [latitude, longitude] format

### Routing Takes Wrong Path
**Solution:**
1. Check edge connections between buildings
2. Verify all entrance nodes are properly linked
3. Check floor ID consistency across data files

## Support & Questions

For issues with Baldwin Hall integration:

1. Check that all floor IDs start with `baldwin_`
2. Verify node IDs match references in building_floors.json
3. Review edges.json for connection issues
4. Consult the detailed GeoJSON files in `baldwin/` folder

---

**Baldwin Hall Floors:** 6 levels (4-9) ✓  
**Floor Plans:** GeoJSON with detailed architecture ✓  
**Nodes:** 4 navigation points configured ✓  
**Edges:** Floor connections established ✓  
**System Ready:** Yes ✓

**Status:** Integration Complete ✅
