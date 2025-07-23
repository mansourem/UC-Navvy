// --- Load nodes and edges for pathfinding ---
let nodesData = null;
let edgesData = null;
fetch('nodes.json').then(r => r.json()).then(data => { nodesData = data; });
fetch('edges.json').then(r => r.json()).then(data => { edgesData = data; });

// --- Dijkstra's algorithm for shortest path ---
function dijkstra(startId, endId, nodes, edges) {
  // Build adjacency list
  const adj = {};
  edges.paths.forEach(path => {
    adj[path.node] = Object.keys(path.connections);
  });

  // Priority queue: [cost, nodeId, path]
  const queue = [[0, startId, [startId]]];
  const visited = new Set();

  while (queue.length > 0) {
    // Get node with lowest cost
    queue.sort((a, b) => a[0] - b[0]);
    const [cost, nodeId, path] = queue.shift();
    if (nodeId === endId) {
       bestPath = path;
      bestCost = cost;
      //test to see if optimization for calculating paths works (it does)
      //console.log(`Best path so far: ${bestPath} (cost: ${bestCost})`);
      return path;
    }

    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
 
    //console.log(`Calculating path: ${path}`); // Print the path as it's being calculated

    function getHazardLevel(fromId, toId, edgesData) {
      const path = edgesData.paths.find(p => p.node === fromId);
      console.log('Looking for fromId:', fromId);
      console.log('Looking for toId:', toId);
      console.log('Available paths:', edgesData.paths.map(p => p.node));
      return path?.connections[toId] ?? 1; // default to 1 if missing
      
    }

    (adj[nodeId] || []).forEach(neighbor => {
      if (!visited.has(neighbor)) {
        // Calculate actual distance using cosineDistanceBetweenPoints
        const node1 = nodes.nodes.find(n => n.node_id === nodeId);
        const node2 = nodes.nodes.find(n => n.node_id === neighbor);
        const distance = cosineDistanceBetweenPoints(node1, node2);
        const hazardLevel = getHazardLevel(node1, neighbor, edgesData);
        console.log("node1: ", node1);
        console.log("neighbor: ", neighbor);
        console.log("hazardLevel: ", hazardLevel);
        console.log("edgesData: ", edgesData);
        const weightedDistance = distance + (distance * hazardLevel);
        queue.push([cost + weightedDistance, neighbor, [...path, neighbor]]);
      }
    });
  }
  return null; // No path found
}

/* function haversineDistance(node1, node2) {
  const lat1 = node1.latitude * Math.PI / 180.;
  const lon1 = node1.longitude * Math.PI / 180.;
  const lat2 = node2.latitude * Math.PI / 180.;
  const lon2 = node2.longitude * Math.PI / 180.;

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
const a = Math.sin(dLat / 2.) * Math.sin(dLat / 2.) +
          Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dLon / 2.), 2);
  console.log('a:', a);
  const c = 2 * Math.asin(Math.sqrt(a));
 console.log('c:', c);
const R = 3963.167; // miles
const distance = R * c; // Distance in miles

console.log('distance:', distance);
  return distance;
}
  */
function cosineDistanceBetweenPoints(node1, node2) {
  const R = 6371e3;
  const p1 = node1.latitude * Math.PI/180;
  const p2 = node2.latitude * Math.PI/180;
  const deltaP = p2 - p1;
  const deltaLon = node2.longitude - node1.longitude;
  const deltaLambda = (deltaLon * Math.PI) / 180;
  const a = Math.sin(deltaP/2) * Math.sin(deltaP/2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const d = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * R;
  return d;
}

function toRad(deg) {
  return deg * Math.PI / 180.;
}


// --- Find and draw the best path between two buildings ---
window.findAndDrawBestPath = function() {
  if (!nodesData || !edgesData) {
    alert("Nodes or edges not loaded yet!");
    return;
  }
  if (!window.getSelectedEntrances) {
    alert("getSelectedEntrances() not found!");
    return;
  }
  const { startEntrances, endEntrances } = window.getSelectedEntrances();
  console.log("Start:", startEntrances, "End:", endEntrances);
  if (!startEntrances.length || !endEntrances.length) {
    alert("Select both buildings with entrances.");
    return;
  }

  let bestPath = null;
  let bestDistance = Infinity;
  const outputtedPaths = new Set(); // Set to keep track of outputted paths

  // Try all entrance pairs
  for (let start of startEntrances) {
    for (let end of endEntrances) {
       for (let endEntrance of end) {
         for (let startEntrance of start) {
      const path = dijkstra(start, end, nodesData, edgesData);
      if (path) {
         const pathString = path.join(" -> "); // Convert path to string
            if (!outputtedPaths.has(pathString)) {
              outputtedPaths.add(pathString); // Output path if it hasn't been outputted before
              
        // Calculate the total distance of the path
        const totalDistance = path.reduce((acc, nodeId, index) => {
          if (index === 0) return 0;
          const node1 = nodesData.nodes.find(n => n.node_id === nodeId);
          const node2 = nodesData.nodes.find(n => n.node_id === path[index - 1]);
          const distance = cosineDistanceBetweenPoints(node1, node2)/1609.34; // Convert to miles
          return acc + distance;
        }, 0);
          //console.log(`Total distance for path ${path.join(" -> ")}: ${totalDistance} miles`);

        // Update the best path if the total distance is less than the current best distance
        if (totalDistance < bestDistance) {
          bestDistance = totalDistance;
          bestPath = path;
        } else {
          console.log(`Alternative path: ${path.join(" -> ")} with total distance: ${totalDistance} miles`);
        }
      }
    }
    }
    }
    }
  }

  if (!bestPath) {
    alert("No path found between selected buildings.");
    return;
  }
console.log(`Best path: ${bestPath.join(" -> ")} with total distance: ${bestDistance} miles`);

  // Draw the path on the map
  if (window.routeLine) map.removeLayer(window.routeLine);
  const latlngs = bestPath.map(id => {
    const node = nodesData.nodes.find(n => n.node_id === id);
    return [node.latitude, node.longitude];
  });
  window.routeLine = L.polyline(latlngs, { color: 'red', weight: 5 }).addTo(map);
};


console.log("Testing Cosine Distance function...");
// Test case 1: Distance between two points on the equator
const node1 = { latitude: 0, longitude: 0 };
const node2 = { latitude: 0, longitude: 180 };
const expectedDistance = 12436.8187286248; // miles
const actualDistance = cosineDistanceBetweenPoints(node1, node2) / 1609.34;
console.log(`Test case 1: Expected distance: ${expectedDistance} miles, Actual distance: ${actualDistance} miles`);
console.assert(Math.abs(actualDistance - expectedDistance) < 0.1, "Test case 1 failed");

// Test case 2: Distance between two points at the same latitude
const node3 = { latitude: 45, longitude: 0 };
const node4 = { latitude: 45, longitude: 90 };
const expectedDistance2 = 4145.56788356001; // miles
const actualDistance2 = cosineDistanceBetweenPoints(node3, node4) / 1609.34;
console.log(`Test case 2: Expected distance: ${expectedDistance2} miles, Actual distance: ${actualDistance2} miles`);
console.assert(Math.abs(actualDistance2 - expectedDistance2) < 0.1, "Test case 2 failed");
// Test case 3: Distance between two points at the same longitude
const node5 = { latitude: 0, longitude: 45 };
const node6 = { latitude: 90, longitude: 45 };
const expectedDistance3 = 6218.35182534001; // miles
const actualDistance3 = cosineDistanceBetweenPoints(node5, node6) / 1609.34;
console.log(`Test case 3: Expected distance: ${expectedDistance3} miles, Actual distance: ${actualDistance3} miles`);
console.assert(Math.abs(actualDistance3 - expectedDistance3) < 0.1, "Test case 3 failed");
