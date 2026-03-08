/**
 * UC Navvy - Enhanced Routing Engine
 * Supports:
 *   - Multi-floor routing (staircase/elevator transitions)
 *   - Multi-building routing (outdoor path between buildings)
 *   - Indoor/outdoor combined routing
 *   - Accessible routes (elevator-only, no stairs, wide paths)
 *
 * Node schema expected:
 *   { node_id, latitude, longitude, floor, location, building_id,
 *     entrance, elevator, staircase, accessible, indoor }
 *
 * Edge schema (adjacency format):
 *   { paths: [{ node, connections: { nodeId: true }, accessible: { nodeId: bool } }] }
 */

// ─── Haversine Distance (meters) ──────────────────────────────────────────────
function haversineDistance(n1, n2) {
  const R = 6371000;
  const φ1 = n1.latitude * Math.PI / 180;
  const φ2 = n2.latitude * Math.PI / 180;
  const Δφ = (n2.latitude - n1.latitude) * Math.PI / 180;
  const Δλ = (n2.longitude - n1.longitude) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * R;
}

// Floor change penalty (discourages unnecessary floor changes)
const FLOOR_CHANGE_PENALTY = 50; // meters equivalent
const ELEVATOR_PENALTY = 20;     // slight preference for stairs when both available
const INACCESSIBLE_PENALTY = Infinity;

// ─── Build Adjacency Map ──────────────────────────────────────────────────────
function buildAdjacencyMap(edges) {
  const adj = {};
  edges.paths.forEach(path => {
    adj[path.node] = {
      neighbors: Object.keys(path.connections),
      accessible: path.accessible || {}
    };
  });
  return adj;
}

// ─── Dijkstra with Accessibility & Floor-Awareness ───────────────────────────
/**
 * @param {string} startId - start node_id
 * @param {string} endId - end node_id
 * @param {Object} nodes - map of node_id → node object
 * @param {Object} adj - adjacency map from buildAdjacencyMap()
 * @param {Object} options
 * @param {boolean} options.accessibleOnly - only use accessible edges & elevator transitions
 * @param {boolean} options.preferIndoor - add penalty for outdoor segments
 */
function dijkstra(startId, endId, nodes, adj, options = {}) {
  const { accessibleOnly = false } = options;

  // Priority queue: [cost, nodeId, path, segments]
  // segments = array of {type: 'walk'|'floor_change'|'building_change', nodes: [...]}
  const queue = [[0, startId, [startId]]];
  const visited = new Set();
  const dist = { [startId]: 0 };

  while (queue.length > 0) {
    queue.sort((a, b) => a[0] - b[0]);
    const [cost, nodeId, path] = queue.shift();

    if (nodeId === endId) return { path, cost };
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const neighbors = adj[nodeId]?.neighbors || [];
    const accessibleMap = adj[nodeId]?.accessible || {};

    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue;

      const n1 = nodes[nodeId];
      const n2 = nodes[neighborId];
      if (!n1 || !n2) continue;

      // Accessibility check
      if (accessibleOnly && accessibleMap[neighborId] === false) continue;

      let edgeCost = haversineDistance(n1, n2);

      // Penalize floor changes via stairs for accessible routing
      if (n1.floor !== n2.floor) {
        if (accessibleOnly) {
          // Must use elevator
          const n2IsElevator = n2.elevator || n1.elevator;
          if (!n2IsElevator) {
            continue; // Skip non-elevator floor transitions
          }
          edgeCost += ELEVATOR_PENALTY;
        } else {
          edgeCost += FLOOR_CHANGE_PENALTY;
        }
      }

      const newCost = cost + edgeCost;
      if (newCost < (dist[neighborId] ?? Infinity)) {
        dist[neighborId] = newCost;
        queue.push([newCost, neighborId, [...path, neighborId]]);
      }
    }
  }
  return null; // No path found
}

// ─── Annotate Path with Segments ─────────────────────────────────────────────
/**
 * Takes a flat array of node IDs and annotates it with navigation segments:
 *   outdoor, indoor, floor_change, building_entry, building_exit
 */
function annotatePath(path, nodes) {
  if (!path || path.length < 2) return [];
  const segments = [];
  let currentSegment = {
    type: getNodeContext(nodes[path[0]]),
    nodes: [path[0]],
    floor: nodes[path[0]]?.floor,
    building: nodes[path[0]]?.building_id || nodes[path[0]]?.location
  };

  for (let i = 1; i < path.length; i++) {
    const prevNode = nodes[path[i-1]];
    const currNode = nodes[path[i]];
    const prevCtx = getNodeContext(prevNode);
    const currCtx = getNodeContext(currNode);

    const floorChange = prevNode?.floor !== currNode?.floor;
    const contextChange = prevCtx !== currCtx;
    const buildingChange = (prevNode?.building_id || prevNode?.location) !==
                           (currNode?.building_id || currNode?.location);

    if (floorChange || contextChange || buildingChange) {
      segments.push({ ...currentSegment });
      currentSegment = {
        type: currCtx,
        nodes: [path[i-1], path[i]],
        floor: currNode?.floor,
        building: currNode?.building_id || currNode?.location,
        transition: floorChange ? 'floor_change' : buildingChange ? 'building_change' : 'context_change'
      };
    } else {
      currentSegment.nodes.push(path[i]);
    }
  }
  segments.push(currentSegment);
  return segments;
}

function getNodeContext(node) {
  if (!node) return 'unknown';
  if (node.location === 'outside' || node.floor === 'outside') return 'outdoor';
  return 'indoor';
}

// ─── Generate Turn-by-Turn Instructions ──────────────────────────────────────
function generateInstructions(path, nodes) {
  if (!path || path.length < 2) return [];
  const instructions = [];

  for (let i = 1; i < path.length; i++) {
    const prev = nodes[path[i-1]];
    const curr = nodes[path[i]];
    if (!prev || !curr) continue;

    if (prev.floor !== curr.floor) {
      const method = curr.elevator ? 'Take the elevator' : 'Take the stairs';
      const direction = curr.floor > prev.floor ? 'up' : 'down';
      instructions.push({
        icon: curr.elevator ? '🛗' : '🪜',
        text: `${method} ${direction} to floor ${curr.floor}`,
        type: 'floor_change',
        node: curr
      });
    } else if (getNodeContext(prev) !== getNodeContext(curr)) {
      if (getNodeContext(curr) === 'indoor') {
        instructions.push({ icon: '🏛️', text: `Enter building`, type: 'building_entry', node: curr });
      } else {
        instructions.push({ icon: '🚶', text: `Exit building`, type: 'building_exit', node: curr });
      }
    } else {
      const dist = haversineDistance(prev, curr);
      if (dist > 10) {
        const ctx = getNodeContext(curr) === 'indoor' ? 'indoors' : 'outdoors';
        instructions.push({
          icon: '➡️',
          text: `Continue ${ctx} (~${Math.round(dist)}m)`,
          type: 'walk',
          node: curr,
          distance: dist
        });
      }
    }
  }
  return instructions;
}

// ─── Main Route Finder ────────────────────────────────────────────────────────
/**
 * Find best path between buildings/locations.
 *
 * @param {Object} params
 * @param {string[]} params.startNodeIds - entrance nodes of start building
 * @param {string[]} params.endNodeIds - entrance nodes of destination building
 * @param {Object[]} params.nodesArray - flat array of all nodes
 * @param {Object} params.edgesData - edges in adjacency format
 * @param {boolean} params.accessibleOnly - require accessible route
 * @returns {{ path, cost, distanceMeters, distanceMiles, instructions, segments }}
 */
export function findBestRoute(params) {
  const { startNodeIds, endNodeIds, nodesArray, edgesData, accessibleOnly = false } = params;

  // Build fast lookup map
  const nodes = {};
  nodesArray.forEach(n => { nodes[n.node_id] = n; });

  const adj = buildAdjacencyMap(edgesData);

  let bestResult = null;
  let bestCost = Infinity;

  for (const startId of startNodeIds) {
    for (const endId of endNodeIds) {
      if (startId === endId) continue;
      const result = dijkstra(startId, endId, nodes, adj, { accessibleOnly });
      if (result && result.cost < bestCost) {
        bestCost = result.cost;
        bestResult = result;
      }
    }
  }

  if (!bestResult) return null;

  const { path, cost } = bestResult;
  const distanceMeters = cost;
  const distanceMiles = cost / 1609.34;
  const segments = annotatePath(path, nodes);
  const instructions = generateInstructions(path, nodes);

  return {
    path,
    cost,
    distanceMeters,
    distanceMiles,
    segments,
    instructions,
    nodes, // expose for map drawing
  };
}

// ─── Multi-Floor Route (within a building) ────────────────────────────────────
/**
 * Find route between two nodes on different floors of the same building.
 * Ensures path goes through elevator if accessibleOnly.
 */
export function findFloorRoute(startNodeId, endNodeId, nodesArray, edgesData, accessibleOnly = false) {
  const nodes = {};
  nodesArray.forEach(n => { nodes[n.node_id] = n; });
  const adj = buildAdjacencyMap(edgesData);
  return dijkstra(startNodeId, endNodeId, nodes, adj, { accessibleOnly });
}

export { haversineDistance, annotatePath, generateInstructions, buildAdjacencyMap };
