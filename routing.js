/**
 * UC Navvy - routing.js (legacy compatibility layer)
 * The main routing logic has been moved to routing-engine.js and routing.html.
 * This file is kept for backward compatibility with index.html.
 *
 * New features are implemented in:
 *   - api.js             → Database API calls (Supabase via render backend)
 *   - routing-engine.js  → Dijkstra + multi-floor/multi-building/accessible routing
 *   - floorplan-manager.js → Indoor map display
 *   - routing.html       → Full route planner UI (replaces this file's inline logic)
 */

// --- Load nodes and edges (with API fallback) ---
const API_BASE = 'https://uc-navvy-api.onrender.com';

async function apiOrLocal(apiPath, localPath) {
  try {
    const r = await fetch(`${API_BASE}${apiPath}`);
    if (!r.ok) throw new Error('API unavailable');
    const d = await r.json();
    return Array.isArray(d) ? d : d;
  } catch {
    const r = await fetch(localPath);
    return r.json();
  }
}

let nodesData = null;
let edgesData = null;

// Load from API with local fallback
apiOrLocal('/api/nodes', 'nodes.json').then(data => {
  nodesData = { nodes: Array.isArray(data) ? data : (data.nodes || []) };
});
apiOrLocal('/api/edges', 'edges.json').then(data => {
  edgesData = Array.isArray(data) ? _edgesFromList(data) : data;
});

function _edgesFromList(list) {
  const m = {};
  list.forEach(e => {
    if (!m[e.from_node]) m[e.from_node] = { node: e.from_node, connections: {}, accessible: {} };
    if (!m[e.to_node])   m[e.to_node]   = { node: e.to_node,   connections: {}, accessible: {} };
    m[e.from_node].connections[e.to_node] = true;
    m[e.to_node].connections[e.from_node] = true;
  });
  return { paths: Object.values(m) };
}

// --- Enhanced Dijkstra with multi-floor and accessibility support ---
function dijkstra(startId, endId, nodes, edges, accessibleOnly = false) {
  const adj = {};
  edges.paths.forEach(path => {
    adj[path.node] = {
      neighbors: Object.keys(path.connections),
      accessible: path.accessible || {}
    };
  });

  const queue = [[0, startId, [startId]]];
  const visited = new Set();
  const dist = { [startId]: 0 };

  while (queue.length > 0) {
    queue.sort((a, b) => a[0] - b[0]);
    const [cost, nodeId, path] = queue.shift();

    if (nodeId === endId) return path;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const neighbors = adj[nodeId]?.neighbors || [];
    const accMap    = adj[nodeId]?.accessible || {};

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      if (accessibleOnly && accMap[neighbor] === false) continue;

      const node1 = nodes.nodes.find(n => n.node_id === nodeId);
      const node2 = nodes.nodes.find(n => n.node_id === neighbor);
      if (!node1 || !node2) continue;

      let distance = cosineDistanceBetweenPoints(node1, node2);

      // Floor-change penalty
      if (node1.floor !== node2.floor) {
        if (accessibleOnly) {
          // Skip non-elevator floor transitions in accessible mode
          if (!node2.elevator && !node1.elevator) continue;
          distance += 20;
        } else {
          distance += 50;
        }
      }

      const newCost = cost + distance;
      if (newCost < (dist[neighbor] ?? Infinity)) {
        dist[neighbor] = newCost;
        queue.push([newCost, neighbor, [...path, neighbor]]);
      }
    }
  }
  return null;
}

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
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * R;
}

// --- Find and draw the best path between two buildings ---
window.findAndDrawBestPath = function(accessibleOnly = false) {
  if (!nodesData || !edgesData) {
    alert("Navigation data not loaded yet. Please wait and try again.");
    return;
  }
  if (!window.getSelectedEntrances) {
    alert("getSelectedEntrances() not found!");
    return;
  }

  const { startEntrances, endEntrances } = window.getSelectedEntrances();
  if (!startEntrances.length || !endEntrances.length) {
    alert("Please select both a start and destination building.");
    return;
  }

  let bestPath = null;
  let bestDistance = Infinity;

  for (const start of startEntrances) {
    for (const end of endEntrances) {
      const path = dijkstra(start, end, nodesData, edgesData, accessibleOnly);
      if (path) {
        const totalDistance = path.reduce((acc, nodeId, index) => {
          if (index === 0) return 0;
          const node1 = nodesData.nodes.find(n => n.node_id === nodeId);
          const node2 = nodesData.nodes.find(n => n.node_id === path[index - 1]);
          return acc + cosineDistanceBetweenPoints(node1, node2) / 1609.34;
        }, 0);

        if (totalDistance < bestDistance) {
          bestDistance = totalDistance;
          bestPath = path;
        }
      }
    }
  }

  if (!bestPath) {
    alert(accessibleOnly
      ? "No accessible route found. Try disabling the accessible route option."
      : "No route found between selected buildings.");
    return;
  }

  console.log(`Route: ${bestPath.join(' → ')} | Distance: ${bestDistance.toFixed(3)} miles`);

  if (window.routeLine) map.removeLayer(window.routeLine);
  const latlngs = bestPath.map(id => {
    const node = nodesData.nodes.find(n => n.node_id === id);
    return [node.latitude, node.longitude];
  });

  const color = accessibleOnly ? '#16a34a' : 'red';
  window.routeLine = L.polyline(latlngs, {
    color, weight: 5, lineCap: 'round', lineJoin: 'round'
  }).addTo(map);

  // Fit bounds
  map.fitBounds(window.routeLine.getBounds().pad(0.15));
};
