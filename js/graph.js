/**
 * graph.js
 * Navigation graph loader, cache, and Dijkstra pathfinder.
 *
 * Graph format (same schema for indoor and outdoor):
 *
 *   GET /api/graph/{building}   — indoor building graph (all floors)
 *   GET /api/graph/campus       — outdoor campus walking graph
 *
 * Node shape:
 *   {
 *     id:       number   — unique integer within this graph
 *     lat:      number
 *     lng:      number
 *     floor:    number | null   — null for outdoor nodes
 *     entrance: boolean  — true = building entrance/exit point
 *     ada:      boolean  — false = not wheelchair accessible
 *     type:     'corridor'|'room'|'elevator'|'stair'|'ramp'|'entrance'|'outdoor'
 *     label:    string   — optional human-readable name
 *   }
 *
 * Edge shape:
 *   {
 *     id:       number   — unique integer within this graph
 *     from:     number   — node id
 *     to:       number   — node id
 *     weight:   number   — metres (auto-calculated from coords if absent)
 *     type:     'corridor'|'elevator'|'stair'|'ramp'|'outdoor'|'entrance'
 *     ada:      boolean  — false = not wheelchair accessible (e.g. stair edges)
 *     directed: boolean  — default false (bidirectional)
 *   }
 *
 * Stitching indoor → outdoor:
 *   Entrance nodes in a building graph and the campus graph share the same numeric `id`.
 *   mergeGraphs() deduplicates by id so they become a single connected graph.
 */

'use strict';

import { API } from './config.js';

// ─── CACHE ────────────────────────────────────────────────────────────────────

/** @type {Map<string, Graph>} key = building key or 'campus' */
const _cache = new Map();

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * @typedef {{ nodes: Node[], edges: Edge[] }} Graph
 * @typedef {{ id:number, lat:number, lng:number, floor:number|null, entrance:boolean, ada:boolean, type:string, label?:string }} Node
 * @typedef {{ id:number, from:number, to:number, weight:number, type:string, ada:boolean, directed?:boolean }} Edge
 */

/**
 * Fetch and cache a navigation graph.
 * @param {string} key  - building key (e.g. 'baldwin') or 'outdoor'
 * @returns {Promise<Graph>}
 */
export async function loadGraph(key) {
  if (_cache.has(key)) return _cache.get(key);

  let graph;

  if (key === 'campusquad') {
    // TODO: Replace this local file load with the live API call once the outdoor
    //       graph endpoint is available:
    //         const url = API.graphUrl('outdoor');  // GET /api/graph/outdoor
    //         const resp = await fetch(url);
    //         graph = await resp.json();
    const resp = await fetch('data/graphs/campusquad.json');
    if (!resp.ok) throw new Error(`Campus quad graph ${resp.status}`);
    // campusquad.json already uses the standard schema (id/lat/lng) — no remap needed
    graph = await resp.json();
  } else {
    const url = API.graphUrl(key);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Graph API ${resp.status} — ${url}`);
    graph = await resp.json();
  }

  _normalise(graph);
  _cache.set(key, graph);
  return graph;
}

/**
 * Merge multiple graphs into one for unified pathfinding.
 * Nodes with duplicate IDs are deduplicated (first occurrence wins) — this is
 * how entrance nodes stitch indoor and outdoor graphs together.
 * @param {...Graph} graphs
 * @returns {Graph}
 */
export function mergeGraphs(...graphs) {
  const seen = new Set();
  const nodes = [];
  const edges = [];
  for (const g of graphs) {
    for (const n of g.nodes) {
      if (!seen.has(n.id)) { nodes.push(n); seen.add(n.id); }
    }
    edges.push(...g.edges);
  }
  return { nodes, edges };
}

/**
 * Dijkstra shortest-path.
 * Edges are bidirectional unless edge.directed === true.
 *
 * @param {Graph}   graph
 * @param {string}  startId
 * @param {string}  endId
 * @param {boolean} adaOnly  - skip nodes/edges where ada === false
 * @returns {{ nodes: string[], edges: Edge[] }|null}
 *   Ordered node IDs from start→end and the actual Edge objects traversed,
 *   or null if unreachable.
 */
export function findPath(graph, startId, endId, adaOnly) {
  const { nodes, edges } = graph;

  const eligible = new Set(
    nodes
      .filter(n => !adaOnly || n.ada !== false)
      .map(n => n.id)
  );

  if (!eligible.has(startId) || !eligible.has(endId)) return null;

  // Build adjacency list — store edge reference alongside each neighbour
  const adj = new Map();
  eligible.forEach(id => adj.set(id, []));

  for (const e of edges) {
    if (!eligible.has(e.from) || !eligible.has(e.to)) continue;
    if (adaOnly && e.ada === false) continue;
    const w = e.weight ?? 1;
    adj.get(e.from).push({ id: e.to, w, edge: e });
    if (!e.directed) adj.get(e.to).push({ id: e.from, w, edge: e });
  }

  // Dijkstra — O(V²) but fine for sub-500 node graphs
  const dist = new Map();
  const prev = new Map();      // prev[v] = { fromId, edge }
  eligible.forEach(id => dist.set(id, Infinity));
  dist.set(startId, 0);

  const unvisited = new Set(eligible);

  while (unvisited.size > 0) {
    // Pick unvisited node with smallest distance
    let u = null;
    for (const id of unvisited) {
      if (u === null || dist.get(id) < dist.get(u)) u = id;
    }
    if (dist.get(u) === Infinity || u === endId) break;
    unvisited.delete(u);

    for (const { id: v, w, edge } of adj.get(u)) {
      const alt = dist.get(u) + w;
      if (alt < dist.get(v)) {
        dist.set(v, alt);
        prev.set(v, { fromId: u, edge });
      }
    }
  }

  if (dist.get(endId) === Infinity) return null;

  // Reconstruct ordered node IDs and the edges traversed
  const pathNodes = [];
  const pathEdges = [];
  for (let cur = endId; cur !== undefined; cur = prev.get(cur)?.fromId) {
    pathNodes.unshift(cur);
    const entry = prev.get(cur);
    if (entry) pathEdges.unshift(entry.edge);
  }

  return { nodes: pathNodes, edges: pathEdges };
}

/**
 * Try all combinations of startNodes × endNodes and return the shortest path found.
 * @param {Graph}   graph
 * @param {Node[]}  startNodes
 * @param {Node[]}  endNodes
 * @param {boolean} adaOnly
 * @returns {string[]|null}
 */
export function findBestPath(graph, startNodes, endNodes, adaOnly) {
  let best = null;

  for (const s of startNodes) {
    for (const e of endNodes) {
      const path = findPath(graph, s.id, e.id, adaOnly);
      if (path && (best === null || path.length < best.length)) {
        best = path;
      }
    }
  }

  return best;
}

/**
 * Get entrance nodes, optionally filtered by floor and ADA.
 * @param {Graph}         graph
 * @param {number|null}   [floor]    - undefined = any floor
 * @param {boolean}       [adaOnly]
 * @returns {Node[]}
 */
export function getEntranceNodes(graph, floor, adaOnly) {
  return graph.nodes.filter(n =>
    n.entrance === true &&
    (floor === undefined || n.floor === floor) &&
    (!adaOnly || n.ada !== false)
  );
}

/**
 * Get all nodes on a given floor.
 * @param {Graph}  graph
 * @param {number} floor
 * @returns {Node[]}
 */
export function getFloorNodes(graph, floor) {
  return graph.nodes.filter(n => n.floor === floor);
}

/**
 * Look up a single node by ID.
 * @param {Graph}  graph
 * @param {string} id
 * @returns {Node|undefined}
 */
export function getNode(graph, id) {
  return graph.nodes.find(n => n.id === id);
}

/**
 * Build a Map<id, Node> for fast lookup.
 * @param {Graph} graph
 * @returns {Map<string, Node>}
 */
export function nodeMap(graph) {
  return new Map(graph.nodes.map(n => [n.id, n]));
}

// ─── PRIVATE ──────────────────────────────────────────────────────────────────

/**
 * Fill in missing edge weights using Haversine distance between node coords.
 * @param {Graph} graph
 */
function _normalise(graph) {
  const map = new Map(graph.nodes.map(n => [n.id, n]));
  for (const e of graph.edges) {
    if (e.weight == null) {
      const a = map.get(e.from);
      const b = map.get(e.to);
      e.weight = (a && b) ? _haversine(a.lat, a.lng, b.lat, b.lng) : 1;
    }
  }
}

// TODO: restore _remapOutdoorGraph if outside.json (node_id/longitude schema) is ever used.
// outside.json uses node_id/longitude/edge_id; campusquad.json uses the standard schema.
// function _remapOutdoorGraph(raw) {
//   return {
//     nodes: raw.nodes.map(n => ({
//       id:       n.node_id,
//       lat:      n.lat,
//       lng:      n.longitude ?? n.log ?? n.lng,  // node 58 has typo "log"
//       floor:    n.floor,
//       entrance: n.entrance,
//       type:     n.type,
//       ada:      n.ada,
//       label:    n.label,
//     })),
//     edges: raw.edges.map(e => ({
//       id:       e.edge_id,
//       from:     e.from,
//       to:       e.to,
//       weight:   e.weight,
//       type:     e.type,
//       ada:      e.ada,
//       directed: e.directed ?? false,
//     })),
//   };
// }

function _haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
