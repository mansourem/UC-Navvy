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

// Usage: Add a button in your HTML to call findAndDrawBestPath()
// <button onclick="findAndDrawBestPath()">Find Route</button>