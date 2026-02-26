// ============================================================
// Multi-Floor, Multi-Building Campus Navigation System
// ============================================================

let nodesData = null;
let edgesData = null;
let buildingFloorsData = null;

// Load all necessary data
Promise.all([
  fetch('nodes.json').then(r => r.json()),
  fetch('edges.json').then(r => r.json()),
  fetch('building_floors.json').then(r => r.json())
]).then(([nodes, edges, floors]) => {
  nodesData = nodes;
  edgesData = edges;
  buildingFloorsData = floors;
  console.log('All routing data loaded successfully');
});

// ============================================================
// DISTANCE CALCULATION
// ============================================================

function cosineDistanceBetweenPoints(node1, node2) {
  const R = 6371e3; // Earth's radius in meters
  const p1 = node1.latitude * Math.PI / 180;
  const p2 = node2.latitude * Math.PI / 180;
  const deltaP = p2 - p1;
  const deltaLon = node2.longitude - node1.longitude;
  const deltaLambda = (deltaLon * Math.PI) / 180;
  const a = Math.sin(deltaP / 2) * Math.sin(deltaP / 2) +
    Math.cos(p1) * Math.cos(p2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const d = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * R;
  return d;
}

// Penalty for changing floors (in meters, equivalent to distance)
function getFloorChangePenalty(fromFloor, toFloor) {
  if (fromFloor === toFloor) return 0;
  
  // Penalty for using stairs (simulate 1 floor = ~5 meters horizontal distance)
  const floorDifference = Math.abs(parseInt(fromFloor.split('_')[1] || '0') - 
                                    parseInt(toFloor.split('_')[1] || '0'));
  return floorDifference * 5;
}

// ============================================================
// GET BUILDING AND FLOOR INFO
// ============================================================

function getBuildingById(buildingId) {
  return buildingFloorsData.buildings.find(b => b.building_id === buildingId);
}

function getFloorById(floorId) {
  for (let building of buildingFloorsData.buildings) {
    const floor = building.floors.find(f => f.floor_id === floorId);
    if (floor) return floor;
  }
  return null;
}

function getBuildingByFloorId(floorId) {
  for (let building of buildingFloorsData.buildings) {
    if (building.floors.find(f => f.floor_id === floorId)) {
      return building;
    }
  }
  return null;
}

function getNodeBuilding(nodeId) {
  for (let building of buildingFloorsData.buildings) {
    const isEntrance = building.entrances.find(e => e.node_id === nodeId);
    if (isEntrance) return building.building_id;
    
    const isElevator = building.elevator_nodes.find(e => e.node_id === nodeId);
    if (isElevator) return building.building_id;
    
    const isStairs = building.stairs.find(s => s.node_id === nodeId);
    if (isStairs) return building.building_id;
  }
  return null;
}

function getNodeFloors(nodeId) {
  for (let building of buildingFloorsData.buildings) {
    const entrance = building.entrances.find(e => e.node_id === nodeId);
    if (entrance) return [entrance.floor_id];
    
    const elevator = building.elevator_nodes.find(e => e.node_id === nodeId);
    if (elevator) return elevator.floors;
    
    const stairs = building.stairs.find(s => s.node_id === nodeId);
    if (stairs) return stairs.floors;
  }
  return [];
}

// ============================================================
// DIJKSTRA'S ALGORITHM WITH FLOOR AWARENESS
// ============================================================

function dijkstraWithFloors(startId, startFloor, endId, endFloor, nodes, edges) {
  // Build adjacency list
  const adj = {};
  edges.paths.forEach(path => {
    adj[path.node] = Object.keys(path.connections);
  });

  // Priority queue: [cost, nodeId, floorId, path]
  const queue = [[0, startId, startFloor, [[startId, startFloor]]]];
  const visited = new Set();
  const stateKey = (nodeId, floorId) => `${nodeId}@${floorId}`;

  while (queue.length > 0) {
    // Get node with lowest cost
    queue.sort((a, b) => a[0] - b[0]);
    const [cost, nodeId, floorId, path] = queue.shift();

    if (nodeId === endId && floorId === endFloor) {
      return path;
    }

    const key = stateKey(nodeId, floorId);
    if (visited.has(key)) continue;
    visited.add(key);

    (adj[nodeId] || []).forEach(neighbor => {
      const neighborFloors = getNodeFloors(neighbor);
      
      // If neighbor is a floor transition point (elevator/stairs)
      if (neighborFloors.length > 1) {
        // Can go to any floor this node connects to
        neighborFloors.forEach(targetFloor => {
          const neighborKey = stateKey(neighbor, targetFloor);
          if (!visited.has(neighborKey)) {
            const node1 = nodes.nodes.find(n => n.node_id === nodeId);
            const node2 = nodes.nodes.find(n => n.node_id === neighbor);
            const distance = cosineDistanceBetweenPoints(node1, node2);
            const floorPenalty = getFloorChangePenalty(floorId, targetFloor);
            const totalCost = cost + distance + floorPenalty;
            queue.push([totalCost, neighbor, targetFloor, [...path, [neighbor, targetFloor]]]);
          }
        });
      } else if (neighborFloors.length === 1) {
        // Regular node on same floor
        const targetFloor = neighborFloors[0];
        if (floorId === targetFloor) {
          const neighborKey = stateKey(neighbor, targetFloor);
          if (!visited.has(neighborKey)) {
            const node1 = nodes.nodes.find(n => n.node_id === nodeId);
            const node2 = nodes.nodes.find(n => n.node_id === neighbor);
            const distance = cosineDistanceBetweenPoints(node1, node2);
            queue.push([cost + distance, neighbor, targetFloor, [...path, [neighbor, targetFloor]]]);
          }
        }
      }
    });
  }
  return null; // No path found
}

// ============================================================
// INTRA-BUILDING ROUTING (within same building, multiple floors)
// ============================================================

function findPathWithinBuilding(startNodeId, startFloor, endNodeId, endFloor) {
  if (!nodesData || !edgesData) return null;
  
  const path = dijkstraWithFloors(startNodeId, startFloor, endNodeId, endFloor, nodesData, edgesData);
  return path;
}

// ============================================================
// INTER-BUILDING ROUTING (between buildings)
// ============================================================

function findPathBetweenBuildings(startBuildingId, startFloor, endBuildingId, endFloor) {
  if (!nodesData || !edgesData || !buildingFloorsData) return null;

  const startBuilding = getBuildingById(startBuildingId);
  const endBuilding = getBuildingById(endBuildingId);

  if (!startBuilding || !endBuilding) return null;

  let bestPath = null;
  let bestDistance = Infinity;

  // Try all combinations of entrances
  for (let startEntrance of startBuilding.entrances) {
    for (let endEntrance of endBuilding.entrances) {
      // First, navigate within start building to an entrance
      let pathWithinStart = null;
      if (startFloor === startEntrance.floor_id) {
        pathWithinStart = findPathWithinBuilding(startNodeId, startFloor, startEntrance.node_id, startEntrance.floor_id);
      } else {
        // Need to navigate to ground floor entrance
        pathWithinStart = findPathWithinBuilding(startNodeId, startFloor, startEntrance.node_id, startEntrance.floor_id);
      }

      if (!pathWithinStart) continue;

      // Navigate outdoors between buildings (use outdoor nodes)
      const pathOutdoors = dijkstraWithFloors(
        startEntrance.node_id, 'outside',
        endEntrance.node_id, 'outside',
        nodesData, edgesData
      );

      if (!pathOutdoors) continue;

      // Navigate within end building from entrance
      const pathWithinEnd = findPathWithinBuilding(
        endEntrance.node_id, endEntrance.floor_id,
        endNodeId, endFloor
      );

      if (!pathWithinEnd) continue;

      // Calculate total distance
      const totalPath = [...pathWithinStart, ...pathOutdoors.slice(1), ...pathWithinEnd.slice(1)];
      const totalDistance = calculatePathDistance(totalPath);

      if (totalDistance < bestDistance) {
        bestDistance = totalDistance;
        bestPath = totalPath;
      }
    }
  }

  return bestPath;
}

// ============================================================
// COMBINED ROUTING (handles same building and different buildings)
// ============================================================

window.findCompletePath = function(startBuildingId, startFloorId, startNodeId, 
                                   endBuildingId, endFloorId, endNodeId) {
  if (!nodesData || !edgesData || !buildingFloorsData) {
    console.error('Navigation data not loaded');
    return null;
  }

  let path = null;

  if (startBuildingId === endBuildingId) {
    // Intra-building routing
    path = findPathWithinBuilding(startNodeId, startFloorId, endNodeId, endFloorId);
  } else {
    // Inter-building routing
    path = findPathBetweenBuildings(startBuildingId, startFloorId, endBuildingId, endFloorId);
  }

  return path;
};

// ============================================================
// PATH CALCULATION AND FORMATTING
// ============================================================

function calculatePathDistance(path) {
  if (!path || path.length === 0) return 0;

  let totalDistance = 0;
  for (let i = 1; i < path.length; i++) {
    const [nodeId1, floorId1] = path[i - 1];
    const [nodeId2, floorId2] = path[i];

    const node1 = nodesData.nodes.find(n => n.node_id === nodeId1);
    const node2 = nodesData.nodes.find(n => n.node_id === nodeId2);

    if (node1 && node2) {
      const distance = cosineDistanceBetweenPoints(node1, node2);
      const floorPenalty = getFloorChangePenalty(floorId1, floorId2);
      totalDistance += distance + floorPenalty;
    }
  }
  return totalDistance;
}

window.formatPathForDisplay = function(path) {
  if (!path) return [];

  const segments = [];
  for (let i = 0; i < path.length; i++) {
    const [nodeId, floorId] = path[i];
    const floor = getFloorById(floorId);
    const building = getBuildingByFloorId(floorId);

    segments.push({
      node_id: nodeId,
      floor_id: floorId,
      floor_name: floor ? floor.floor_name : 'Unknown',
      building_name: building ? building.name : 'Unknown',
      latitude: nodesData.nodes.find(n => n.node_id === nodeId)?.latitude,
      longitude: nodesData.nodes.find(n => n.node_id === nodeId)?.longitude
    });
  }
  return segments;
};

// ============================================================
// HELPER: Find entrance to building on specific floor or closest
// ============================================================

window.getEntranceForFloor = function(buildingId, floorId) {
  const building = getBuildingById(buildingId);
  if (!building) return null;

  // Try to find entrance on the same floor
  let entrance = building.entrances.find(e => e.floor_id === floorId);
  if (entrance) return entrance;

  // If not found, return ground floor entrance
  entrance = building.entrances.find(e => e.floor_id.includes('ground'));
  return entrance || building.entrances[0];
};

// ============================================================
// Export for use in other modules
// ============================================================

window.MultiFloorRouter = {
  findCompletePath: window.findCompletePath,
  formatPathForDisplay: window.formatPathForDisplay,
  getEntranceForFloor: window.getEntranceForFloor,
  calculatePathDistance,
  getBuildingById,
  getFloorById
};
