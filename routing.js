/**
 * UC Navvy - routing.js (legacy compatibility layer for index.html)
 * Parses the new edges format: { edges: [{ edge_id, node_id, connections: [int,...] }] }
 * Node IDs are stored as integers in edges.json and as "node_N" strings in nodes.json.
 */

const API_BASE = 'https://uc-navvy-api.onrender.com';

async function apiOrLocal(apiPath, localPath) {
  try {
    const r = await fetch(`${API_BASE}${apiPath}`);
    if (!r.ok) throw new Error('API unavailable');
    return r.json();
  } catch {
    return fetch(localPath).then(r => r.json());
  }
}

let nodesData = null;
let edgesData = null;

apiOrLocal('/api/nodes', 'nodes.json').then(data => {
  nodesData = { nodes: Array.isArray(data) ? data : (data.nodes || []) };
});

apiOrLocal('/api/edges', 'edges.json').then(data => {
  // Handle both new format { edges: [...] } and DB flat list
  edgesData = parseEdges(data);
});

/**
 * Convert new edges format to internal adjacency map used by dijkstra.
 * New format:  { edges: [{ edge_id, node_id: 24, connections: [7, 23, 26] }] }
 * Internal:    { "node_24": ["node_7", "node_23", "node_26"] }
 */
function parseEdges(data) {
  const adj = {};
  const list = data.edges || data.paths || (Array.isArray(data) ? data : []);

  list.forEach(entry => {
    // New format uses integer node_id + connections array
    if (entry.node_id !== undefined && Array.isArray(entry.connections)) {
      const fromKey = `node_${entry.node_id}`;
      adj[fromKey] = entry.connections.map(c => `node_${c}`);
    }
    // Old format fallback: { node: "node_24", connections: { "node_7": true } }
    else if (entry.node) {
      adj[entry.node] = Object.keys(entry.connections || {});
    }
    // DB flat edge list: { from_node, to_node }
    else if (entry.from_node) {
      if (!adj[entry.from_node]) adj[entry.from_node] = [];
      if (!adj[entry.to_node])   adj[entry.to_node]   = [];
      adj[entry.from_node].push(entry.to_node);
      adj[entry.to_node].push(entry.from_node);
    }
  });

  return adj; // plain adjacency map: { "node_N": ["node_M", ...] }
}

// --- Haversine distance (meters) ---
function haversineDistance(n1, n2) {
  const R = 6371000;
  const p1 = n1.latitude  * Math.PI / 180;
  const p2 = n2.latitude  * Math.PI / 180;
  const dLat = (n2.latitude  - n1.latitude)  * Math.PI / 180;
  const dLon = (n2.longitude - n1.longitude) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dLon/2)**2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * R;
}

// --- Dijkstra ---
function dijkstra(startId, endId, nodes, adj, accessibleOnly = false) {
  const queue   = [[0, startId, [startId]]];
  const visited = new Set();
  const dist    = { [startId]: 0 };

  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [cost, nodeId, path] = queue.shift();

    if (nodeId === endId) return path;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    for (const neighbor of (adj[nodeId] || [])) {
      if (visited.has(neighbor)) continue;

      const n1 = nodes.find(n => n.node_id === nodeId);
      const n2 = nodes.find(n => n.node_id === neighbor);
      if (!n1 || !n2) continue;

      let d = haversineDistance(n1, n2);

      if (n1.floor !== n2.floor) {
        if (accessibleOnly) {
          if (!n1.elevator && !n2.elevator) continue;
          d += 20;
        } else {
          d += 50;
        }
      }

      const nc = cost + d;
      if (nc < (dist[neighbor] ?? Infinity)) {
        dist[neighbor] = nc;
        queue.push([nc, neighbor, [...path, neighbor]]);
      }
    }
  }
  return null;
}

/**
 * Pick one node for a building + floor combination.
 *
 * 1. If floor is "outside" / ground → use entrance_nodes only.
 * 2. Otherwise search ALL nodes for ones whose floor matches AND whose
 *    location / building_id matches the building name.
 * 3. If no floor-specific nodes exist yet, fall back to entrance_nodes.
 * 4. Among the candidate pool, return the node closest to targetCenter.
 *
 * @param {string[]} entranceIds   - entrance_nodes from buildings.json
 * @param {string}   floor         - selected floor ("outside", "1", "2", …)
 * @param {string}   buildingName  - building name (matches node.location)
 * @param {Object[]} allNodes      - full nodes array
 * @param {{lat,lng}} targetCenter - center of the OTHER building
 */
// TODO: Set start node for each building/floor
function pickNode(entranceIds, floor, buildingName, allNodes, targetCenter) {
  const nm = {};
  allNodes.forEach(n => { nm[n.node_id] = n; });

  let pool;

  if (!floor || floor === 'outside') {
    // Ground-level → entrance nodes only
    pool = entranceIds.filter(id => nm[id]);
  } else {
    // Search all nodes for this building on this floor
    const buildingId = buildingName.toLowerCase().replace(/\s+/g, '_');
    pool = allNodes
      .filter(n =>
        String(n.floor) === String(floor) &&
        (n.location === buildingName ||
         n.building_id === buildingName ||
         n.building_id === buildingId))
      .map(n => n.node_id);

    // No floor-specific nodes yet — fall back to entrance nodes
    if (!pool.length) pool = entranceIds.filter(id => nm[id]);
  }

  if (!pool.length) return null;
  if (pool.length === 1) return pool[0];

  // Return the candidate closest to the other building's center
  let best = pool[0], bestDist = Infinity;
  for (const id of pool) {
    const n = nm[id];
    if (!n) continue;
    const d = Math.hypot(n.latitude - targetCenter.lat, n.longitude - targetCenter.lng);
    if (d < bestDist) { bestDist = d; best = id; }
  }
  return best;
}

// --- Main entry point ---
window.findAndDrawBestPath = function(accessibleOnly = false) {
  if (!nodesData || !edgesData) {
    alert('Navigation data not loaded yet. Please wait and try again.');
    return;
  }
  if (!window.getSelectedEntrances) {
    alert('getSelectedEntrances() not found!');
    return;
  }

  const { startEntrances, endEntrances, startFloor, endFloor,
          startName, endName, startCenter, endCenter } = window.getSelectedEntrances();

  if (!startEntrances.length || !endEntrances.length) {
    alert('Please select both a start and destination building.');
    return;
  }

  const nodes = nodesData.nodes;

  const startNode = pickNode(startEntrances, startFloor || 'outside', startName || '', nodes,
                             endCenter   || { lat: 0, lng: 0 });
  const endNode   = pickNode(endEntrances,   endFloor   || 'outside', endName   || '', nodes,
                             startCenter || { lat: 0, lng: 0 });

  if (!startNode || !endNode || startNode === endNode) {
    alert('Could not select valid start/end nodes for the chosen floors.');
    return;
  }

  const path = dijkstra(startNode, endNode, nodes, edgesData, accessibleOnly);

  if (!path) {
    alert(accessibleOnly
      ? 'No accessible route found. Try disabling the accessible route option.'
      : 'No route found between selected buildings.');
    return;
  }

  if (window.routeLine) map.removeLayer(window.routeLine);
  const latlngs = path.map(id => {
    const n = nodes.find(n => n.node_id === id);
    return [n.latitude, n.longitude];
  });
  window.routeLine = L.polyline(latlngs, {
    color: accessibleOnly ? '#16a34a' : 'red',
    weight: 5, lineCap: 'round'
  }).addTo(map);
  map.fitBounds(window.routeLine.getBounds().pad(0.15));
};
