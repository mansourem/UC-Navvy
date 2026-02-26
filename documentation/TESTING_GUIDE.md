# Baldwin Routing System - Testing Guide

## Quick Validation Checklist

Before deploying the routing system, verify that all components are working:

### ✓ Data Files Present
- [ ] `building_floors.json` - Contains Rhodes + Baldwin configuration
- [ ] `nodes.json` - Contains all 64 navigation nodes including Baldwin nodes
- [ ] `edges.json` - Contains all edge connections including Baldwin edges
- [ ] `baldwin/Layer_04.geojson` through `baldwin/Layer_09.geojson` - Floor plan files

### ✓ JavaScript Files Present
- [ ] `multi_floor_routing.js` - Core Dijkstra routing engine
- [ ] `multi_floor_interface.js` - UI controller and map handler
- [ ] `multi_floor_navigation.html` - Main interface page

### ✓ Data Integrity Checks

**Run this in browser console to verify data loaded:**
```javascript
// Check buildings loaded
console.log('Buildings:', Object.keys(window.buildingMap).length);
// Should output: Buildings: 2

// Check Baldwin specifically
console.log('Baldwin floors:', window.buildingMap.baldwin_hall.floors.length);
// Should output: Baldwin floors: 6

// Check total nodes
const allNodes = window.allNodes;
console.log('Total nodes:', Object.keys(allNodes).length);
// Should output: Total nodes: 64

// Check Baldwin nodes exist
console.log('Baldwin entrance:', allNodes.node_bd_entrance_main);
console.log('Baldwin elevator:', allNodes.node_elevator_bd_1);
// Both should show node details
```

---

## Test Scenarios

### Test 1: Within-Building, Same Floor
**Purpose:** Verify basic pathfinding within a building on one floor
**Steps:**
1. Select Start: Rhodes Hall, Ground
2. Select End: Rhodes Hall, Ground  
3. Select different endpoint node from map
4. Click "Find Route"

**Expected Result:**
- Route shows path between nodes on same floor
- No floor change penalties applied
- Distance displayed in meters
- Time estimate shown

---

### Test 2: Within-Building, Multi-Floor
**Purpose:** Verify elevator/stair detection and floor transitions
**Steps:**
1. Select Start: Baldwin Hall, Level 4
2. Select End: Baldwin Hall, Level 6
3. Click "Find Route"

**Expected Result:**
- Route goes from entrance → elevator → destination
- Floor change penalty visible (higher distance than horizontal distance alone)
- Includes "Take elevator from Level 4 to Level 6" instruction
- Time estimate > 0

**Debug if failing:**
```javascript
// Check if elevator connects floors
const elevator = window.allNodes.node_elevator_bd_1;
console.log('Elevator floors:', elevator.floor_ids || elevator.floor);

// Check Baldwin edges
const edges = window.allEdges;
console.log('Baldwin edge connections:', edges.node_bd_entrance_main);
```

---

### Test 3: Between Buildings (Once Connected)
**Purpose:** Verify cross-building routing
**Steps:**
1. Select Start: Rhodes Hall, Ground
2. Select End: Baldwin Hall, Level 5
3. Click "Find Route"

**Expected Result:**
- Route shows path exiting Rhodes → outdoor path → Baldwin entrance → elevator → destination
- Multiple building transitions detected
- Distance includes outdoor segment
- Turn-by-turn includes building names

**Note:** This requires outdoor connector nodes to be added (not yet in current system).

---

### Test 4: Accessibility - Wheelchair
**Purpose:** Verify accessible routing avoids stairs
**Steps:**
1. Check "Wheelchair Accessible" checkbox
2. Select Start: Baldwin Hall, Level 4
3. Select End: Baldwin Hall, Level 7
4. Click "Find Route"

**Expected Result:**
- Route uses only elevator (not stairs)
- Both nodes marked as wheelchair accessible
- Confirms system filters path options

---

### Test 5: Accessibility - Avoid Stairs
**Purpose:** Verify stair-avoiding routes find alternatives
**Steps:**
1. Check "Avoid Stairs" checkbox
2. Select Start: Baldwin Hall, Level 4
3. Select End: Baldwin Hall, Level 8
4. Click "Find Route"

**Expected Result:**
- Route uses elevator
- Verifies that stair-only paths are rejected

---

### Test 6: Swap Locations
**Purpose:** Verify reversal of start/end points
**Steps:**
1. Enter any start location
2. Enter any end location
3. Click "⇅" (Swap button)

**Expected Result:**
- Start and end selections swap
- Floor selectors update appropriately
- Previous route clears

---

### Test 7: Multiple Floor Floors (Baldwin All Levels)
**Purpose:** Test routing across all 6 Baldwin floors
**Steps:**
1. Route from Level 4 → Level 9 (5 floor transitions)

**Expected Result:**
- Path found successfully
- Floor penalties applied (5 × 5m = 25m penalty)
- Takes elevator up all 6 levels
- Significantly longer distance than actual horizontal distance

---

## Manual Testing Terminal Commands

### Verify JSON Syntax
```bash
# Test building_floors.json
python3 -m json.tool building_floors.json > /dev/null && echo "✓ building_floors.json valid"

# Test nodes.json  
python3 -m json.tool nodes.json > /dev/null && echo "✓ nodes.json valid"

# Test edges.json
python3 -m json.tool edges.json > /dev/null && echo "✓ edges.json valid"
```

### Count Baldwin Nodes
```bash
grep -c "node_bd_" nodes.json
# Should output: 4 (or more if expanded)
```

### Count Baldwin Edges  
```bash
grep -c "node_bd_entrance_main" edges.json
# Should show connections maintained
```

### Verify Baldwin in building_floors.json
```bash
grep -A 2 '"building_id": "baldwin_hall"' building_floors.json | head -5
# Should show: "building_id": "baldwin_hall", "name": "Baldwin Hall", etc.
```

---

## Browser Console Testing

### Load and Run Routing Test
```javascript
// Test 1: Verify Dijkstra with Baldwin nodes
const result = window.MultiFloorRouter.dijkstraWithFloors(
  'node_bd_entrance_main', 'baldwin_4',
  'node_bd_interior_4', 'baldwin_4'
);
console.log('Same-floor route:', result);

// Test 2: Cross-floor routing  
const crossFloor = window.MultiFloorRouter.dijkstraWithFloors(
  'node_bd_entrance_main', 'baldwin_4',
  'node_elevator_bd_1', 'baldwin_7'
);
console.log('Cross-floor route:', crossFloor);

// Test 3: Get distance calculation
const path = result.path;
const distance = window.MultiFloorRouter.calculatePathDistance(path);
console.log('Path distance:', distance, 'meters');
```

### Inspect Building Configuration
```javascript
// View Baldwin floor configuration
const baldwin = window.buildingMap.baldwin_hall;
console.table(baldwin.floors.map(f => ({
  floor_id: f.floor_id,
  floor_name: f.floor_name,
  elevation: f.elevation_m
})));
```

### Check Node Properties
```javascript
// Inspect Baldwin nodes
['node_bd_entrance_main', 'node_elevator_bd_1', 'node_stairs_bd_1'].forEach(nodeId => {
  const node = window.allNodes[nodeId];
  console.log(`${nodeId}:`, {
    floor: node.floor,
    lat: node.lat,
    lon: node.lon,
    elevator: node.elevator,
    entrance: node.entrance
  });
});
```

---

## Performance Benchmarks

### Expected Performance Metrics

| Scenario | Expected Time | Actual Time | Status |
|----------|---------------|------------|--------|
| Same-floor route (Rhodes ground) | < 1ms | - | |
| Same-building cross-floor (Baldwin L4→L9) | < 2ms | - | |
| Between buildings (Rhodes→Baldwin) | < 5ms | - | |
| UI route display (with map draw) | < 50ms | - | |
| Accessibility filter applied | < 1ms | - | |

### Optimize If Slow
If routing takes > 100ms:
1. Check for infinite loops in edge definitions
2. Verify no duplicate nodes
3. Check that edges don't create cycles unnecessarily
4. Profile using browser DevTools → Performance tab

---

## Visual Testing Checklist

### On Map Display
- [ ] Baldwin building outline visible
- [ ] Baldwin nodes appear at correct locations
- [ ] Route line appears from start to end
- [ ] Markers placed at start (green) and end (red) points
- [ ] Floor selector buttons update based on building selection
- [ ] Zoom level appropriate for Baldwin's scale

### UI Elements
- [ ] Building dropdowns populated with Rhodes + Baldwin
- [ ] Floor buttons generated for Baldwin (6 buttons for 6 levels)
- [ ] Distance displayed in meters (0 - infinity)
- [ ] Time estimate displayed (0 - infinity)
- [ ] Turn-by-turn directions appear in panel
- [ ] Swap (⇅) button works bidirectionally
- [ ] Clear button resets all selections

---

## Troubleshooting Failed Tests

### Route Not Found
```javascript
// Debug missing connections
const start = 'node_bd_entrance_main';
const end = 'node_bd_interior_4';

// Check nodes exist
console.log('Start node:', window.allNodes[start] ? '✓' : '✗');
console.log('End node:', window.allNodes[end] ? '✓' : '✗');

// Check edges
const startEdges = window.allEdges[start];
console.log('Start connections:', Object.keys(startEdges).length);
console.log('Connected to end?:', end in startEdges);
```

### Incorrect Distance Calculation
```javascript
// Verify floor penalty application
const penalty = window.MultiFloorRouter.getFloorChangePenalty('baldwin_4', 'baldwin_7');
console.log('Floor change penalty:', penalty, 'meters');
// Should be: (7-4) * 5 = 15 meters
```

### Map Not Displaying
```javascript
// Check if Leaflet initialized
console.log('Map object:', window.map);
console.log('Layer group:', window.routeLayer);

// Check data loading
fetch('building_floors.json')
  .then(r => r.json())
  .then(data => console.log('Buildings loaded:', data.length));
```

---

## Regression Tests

Run these each time you make changes to `multi_floor_routing.js`:

```javascript
// Test 1: Basic route exists
const test1 = window.MultiFloorRouter.dijkstraWithFloors('node_rhodes_entrance_main', 'rhodes_ground', 'node_rhodes_g_1', 'rhodes_ground');
console.assert(test1.path.length > 0, 'Basic routing failed');

// Test 2: Same node returns short path
const test2 = window.MultiFloorRouter.dijkstraWithFloors('node_bd_entrance_main', 'baldwin_4', 'node_bd_entrance_main', 'baldwin_4');
console.assert(test2.distance === 0, 'Same node distance should be 0');

// Test 3: Floor change detected
const test3 = window.MultiFloorRouter.dijkstraWithFloors('node_bd_entrance_main', 'baldwin_4', 'node_elevator_bd_1', 'baldwin_7');
console.assert(test3.distance > 0, 'Cross-floor route should have distance');

// Test 4: No path across disconnected buildings
// (Currently will fail until outdoor nodes added, but validates logic)
```

---

## Final Sign-Off

When all tests pass:

- [ ] ✓ All data files valid JSON
- [ ] ✓ Baldwin nodes appear in system  
- [ ] ✓ Same-floor routing works
- [ ] ✓ Multi-floor routing with elevator works
- [ ] ✓ Floor penalties correctly applied
- [ ] ✓ UI displays routes on map
- [ ] ✓ Turn-by-turn directions accurate
- [ ] ✓ Accessibility filters functional
- [ ] ✓ Performance acceptable (< 100ms routing)
- [ ] ✓ No console errors

**System Status:** __________ (READY / NEEDS WORK / IN PROGRESS)

**Date Tested:** __________

**Tested By:** __________

