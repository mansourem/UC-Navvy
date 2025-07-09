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
    if (nodeId === endId) return path;

    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    (adj[nodeId] || []).forEach(neighbor => {
      if (!visited.has(neighbor)) {
        // You can use actual distance here if you want
        queue.push([cost + 1, neighbor, [...path, neighbor]]);
      }
    });
  }
  return null; // No path found
}

function haversineDistance(node1, node2) {
  const lat1 = node1.latitude;
  const lon1 = node1.longitude;
  const lat2 = node2.latitude;
  const lon2 = node2.longitude;
  const R = 6371.0088; // Radius of the Earth in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

function toRad(deg) {
  return deg * Math.PI / 180;
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
  let bestLength = Infinity;

  // Try all entrance pairs
  for (let start of startEntrances) {
    for (let end of endEntrances) {
      const path = dijkstra(start, end, nodesData, edgesData);
      if (path && path.length < bestLength) {
        bestLength = path.length;
        bestPath = path;
      }
    }
  }

  if (!bestPath) {
    alert("No path found between selected buildings.");
    return;
  }

  // Draw the path on the map
  if (window.routeLine) map.removeLayer(window.routeLine);
  const latlngs = bestPath.map(id => {
    const node = nodesData.nodes.find(n => n.node_id === id);
    return [node.latitude, node.longitude];
  });
  window.routeLine = L.polyline(latlngs, { color: 'red', weight: 5 }).addTo(map);
};
console.log("Testing haversineDistance function...");

// Test case 1: Distance between two points on the equator
const node1 = { latitude: 0, longitude: 0 };
const node2 = { latitude: 0, longitude: 180 };
const expectedDistance = 20015.114; // kilometers
const actualDistance = haversineDistance(node1, node2);
console.log(`Test case 1: Expected distance: ${expectedDistance} km, Actual distance: ${actualDistance} km`);
console.assert(Math.abs(actualDistance - expectedDistance) < 0.1, "Test case 1 failed");

// Test case 2: Distance between two points at the same latitude
const node3 = { latitude: 45, longitude: 0 };
const node4 = { latitude: 45, longitude: 90 };
const expectedDistance2 =  6671.6956; // kilometers
const actualDistance2 = haversineDistance(node3, node4);
console.log(`Test case 2: Expected distance: ${expectedDistance2} km, Actual distance: ${actualDistance2} km`);
console.assert(Math.abs(actualDistance2 - expectedDistance2) < 0.1, "Test case 2 failed");

// Test case 3: Distance between two points at the same longitude
const node5 = { latitude: 0, longitude: 45 };
const node6 = { latitude: 90, longitude: 45 };
const expectedDistance3 = 10007.543; // kilometers
const actualDistance3 = haversineDistance(node5, node6);
console.log(`Test case 3: Expected distance: ${expectedDistance3} km, Actual distance: ${actualDistance3} km`);
console.assert(Math.abs(actualDistance3 - expectedDistance3) < 0.1, "Test case 3 failed");

console.log("All test cases passed!");
// Usage: Add a button in your HTML to call findAndDrawBestPath()
// <button onclick="findAndDrawBestPath()">Find Route</button>