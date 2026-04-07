/**
 * graph.ts — TypeScript port of js/graph.js.
 * Navigation graph loader, cache, and Dijkstra pathfinder.
 * No DOM or map library dependencies.
 *
 * High-level flow:
 *   1. loadGraph   — fetch nodes + edges from the API, normalise, and cache
 *   2. nodeMap     — build an id → GraphNode lookup for O(1) access
 *   3. findPath    — Dijkstra shortest-path over the adjacency list
 *   4. _normalise  — coerce API strings to numbers, compute missing weights
 *   5. _haversine  — great-circle distance used as the default edge weight
 */

import { API } from './data/config';

// ─── TYPES ────────────────────────────────────────────────────────────────────
// These mirror the database schema. floor === null means the node is outdoors;
// a numeric floor value means it belongs to an indoor subgraph for that level.

export interface GraphNode {
  id:        number;
  lat:       number;
  lng:       number;
  /** null for outdoor nodes; numeric floor level for indoor nodes */
  floor:     number | null;
  entrance:  boolean; // true when the node is a building entrance/exit point
  ada:       boolean; // true when the node is wheelchair-accessible
  type:      string;
  label?:    string;
}

export interface GraphEdge {
  id:        number;
  from:      number; // source node id
  to:        number; // destination node id
  weight:    number; // traversal cost (metres by default)
  type:      string; // e.g. 'walkway', 'elevator', 'stairs'
  ada:       boolean;
  /** When true, edge is one-way (from → to only). Default: bidirectional. */
  directed?: boolean;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Returned by findPath: parallel arrays where edges[i] connects nodes[i] → nodes[i+1]. */
export interface PathResult {
  nodes: number[];
  edges: GraphEdge[];
}

// ─── CACHE ────────────────────────────────────────────────────────────────────
// The graph is fetched once and reused for all subsequent planRoute calls.
// Assign null to force a fresh fetch (e.g. after a data update).

let _cached: Graph | null = null;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Fetches nodes and edges from the API, normalises them, and returns the graph.
 * Subsequent calls return the in-memory cache without hitting the network.
 */
export async function loadGraph(): Promise<Graph> {
  if (_cached) return _cached;

  // Fetch nodes and edges in parallel to minimise load time.
  const [nodesResp, edgesResp] = await Promise.all([
    fetch(API.NODES_URL),
    fetch(API.EDGES_URL),
  ]);
  if (!nodesResp.ok) throw new Error(`Nodes API ${nodesResp.status}`);
  if (!edgesResp.ok) throw new Error(`Edges API ${edgesResp.status}`);

  const graph: Graph = {
    nodes: await nodesResp.json(),
    edges: await edgesResp.json(),
  };

  // Coerce string fields and fill in missing weights before caching.
  _normalise(graph);
  _cached = graph;
  console.log('[Graph] Loaded with', graph.nodes.length, 'nodes and', graph.edges.length, 'edges');
  return graph;
}

/**
 * Dijkstra shortest-path between two node IDs.
 *
 * Edges are bidirectional unless edge.directed === true.
 * When adaOnly is true, nodes and edges where ada === false are excluded
 * from the graph before pathfinding begins.
 *
 * Returns null when no path exists (e.g. disconnected subgraph, ADA constraint).
 */
export function findPath(
  graph:   Graph,
  startId: number,
  endId:   number,
  adaOnly: boolean,
): PathResult | null {
  const { nodes, edges } = graph;

  // ── 1. Build the eligible node set ─────────────────────────────────────────
  // When adaOnly is true, filter out non-accessible nodes so Dijkstra never
  // routes through them. Non-accessible edges are also skipped below.
  const eligible = new Set<number>(
    nodes
      .filter(n => !adaOnly || n.ada !== false)
      .map(n => n.id),
  );

  // Start or end node excluded by ADA filter → no valid path.
  if (!eligible.has(startId) || !eligible.has(endId)) return null;
  console.log(`[Graph] Finding path from ${startId} to ${endId} (adaOnly=${adaOnly}) among ${eligible.size} eligible nodes`);

  // ── 2. Build the adjacency list ─────────────────────────────────────────────
  // For each eligible node, store a list of reachable neighbours with their
  // traversal cost and the originating edge (needed for path reconstruction).
  const adj = new Map<number, Array<{ id: number; w: number; edge: GraphEdge }>>();
  eligible.forEach(id => adj.set(id, []));

  for (const e of edges) {
    // Skip edges whose endpoints were excluded by the ADA filter.
    if (!eligible.has(e.from) || !eligible.has(e.to)) continue;
    if (adaOnly && e.ada === false) continue;
    const w = Number(e.weight ?? 1) || 1;
    // Forward direction: from → to.
    adj.get(e.from)!.push({ id: e.to, w, edge: e });
    // Reverse direction added for undirected edges so they can be traversed
    // in either direction without duplicating data in the database.
    if (!e.directed) adj.get(e.to)!.push({ id: e.from, w, edge: e });
  }
  console.log('[Graph] Built adjacency list');
  console.log('[Graph] Adjaceny list:', adj.entries());

  // ── 3. Initialise Dijkstra data structures ──────────────────────────────────
  // dist[id] = shortest known distance from startId to id.
  // prev[id] = { fromId, edge } used to reconstruct the path once endId is reached.
  const dist = new Map<number, number>();
  const prev = new Map<number, { fromId: number; edge: GraphEdge }>();
  eligible.forEach(id => dist.set(id, Infinity));
  dist.set(startId, 0);
  console.log('[Graph] Initialized Dijkstra data structures');

  // Unvisited set — we extract the minimum-distance node on each iteration.
  // For the graph sizes used here a simple linear scan is acceptable; a
  // priority queue would improve performance for very large graphs.
  const unvisited = new Set<number>(eligible);

  // ── 4. Main Dijkstra loop ───────────────────────────────────────────────────
  while (unvisited.size > 0) {
    // Select the unvisited node with the smallest tentative distance.
    let u: number | null = null;
    for (const id of unvisited) {
      if (u === null || dist.get(id)! < dist.get(u)!) u = id;
    }
    console.log(`[Graph] Visiting node ${u} with dist ${u !== null ? dist.get(u) : 'null'}`);

    // Stop early when: no reachable node remains, or we've settled endId.
    if (u === null || dist.get(u) === Infinity || u === endId) break;
    unvisited.delete(u);

    // Relax each outgoing edge from u.
    for (const { id: v, w, edge } of adj.get(u)!) {
      const alt = dist.get(u)! + w;
      if (alt < dist.get(v)!) {
        // Found a shorter path to v — update and record the predecessor.
        dist.set(v, alt);
        prev.set(v, { fromId: u, edge });
      }
      console.log(`[Graph] Relaxed edge ${u} -> ${v} with weight ${w}, alt=${alt}, dist[${v}]=${dist.get(v)}`); // Debug log
    }
  }
  console.log('[Graph] Dijkstra completed with distance', dist.get(endId));

  // endId still at Infinity means it was never reached — no path exists.
  if (dist.get(endId) === Infinity) return null;

  // ── 5. Reconstruct path by walking prev back from endId to startId ──────────
  // unshift builds the arrays in forward (start → end) order.
  const pathNodes: number[] = [];
  const pathEdges: GraphEdge[] = [];
  for (let cur: number | undefined = endId; cur !== undefined; cur = prev.get(cur)?.fromId) {
    pathNodes.unshift(cur);
    const entry = prev.get(cur);
    if (entry) pathEdges.unshift(entry.edge);
  }
  console.log('[Graph] Path reconstructed with', pathNodes.length, 'nodes and', pathEdges.length, 'edges');
  return { nodes: pathNodes, edges: pathEdges };
}

/**
 * Returns a Map<id, GraphNode> for O(1) node lookups by ID.
 * Call once per graph load and pass the result into functions that need it.
 */
export function nodeMap(graph: Graph): Map<number, GraphNode> {
  return new Map(graph.nodes.map(n => [n.id, n]));
}

/**
 * Runs Dijkstra from startId and returns the shortest distance to every
 * reachable node. Unlike findPath, this does not reconstruct the path and does
 * not stop early at a specific target — useful for scoring many candidate nodes
 * (e.g. all entrance anchors) in a single pass.
 *
 * Returns a Map of nodeId → distance. Unreachable nodes are omitted.
 */
export function computeDistances(
  graph:   Graph,
  startId: number,
  adaOnly: boolean,
): Map<number, number> {
  const { nodes, edges } = graph;

  const eligible = new Set<number>(
    nodes.filter(n => !adaOnly || n.ada !== false).map(n => n.id),
  );
  if (!eligible.has(startId)) return new Map();

  const adj = new Map<number, Array<{ id: number; w: number }>>();
  eligible.forEach(id => adj.set(id, []));
  for (const e of edges) {
    if (!eligible.has(e.from) || !eligible.has(e.to)) continue;
    if (adaOnly && e.ada === false) continue;
    const w = Number(e.weight ?? 1) || 1;
    adj.get(e.from)!.push({ id: e.to, w });
    if (!e.directed) adj.get(e.to)!.push({ id: e.from, w });
  }

  const dist = new Map<number, number>();
  eligible.forEach(id => dist.set(id, Infinity));
  dist.set(startId, 0);
  const unvisited = new Set<number>(eligible);

  while (unvisited.size > 0) {
    let u: number | null = null;
    for (const id of unvisited) {
      if (u === null || dist.get(id)! < dist.get(u)!) u = id;
    }
    if (u === null || dist.get(u) === Infinity) break;
    unvisited.delete(u);
    for (const { id: v, w } of adj.get(u)!) {
      const alt = dist.get(u)! + w;
      if (alt < dist.get(v)!) dist.set(v, alt);
    }
  }

  const result = new Map<number, number>();
  for (const [id, d] of dist) if (d < Infinity) result.set(id, d);
  return result;
}

// ─── PRIVATE ─────────────────────────────────────────────────────────────────

/**
 * Normalises raw API data in place:
 *   - Remaps database column names (from_node / to_node) to GraphEdge fields
 *   - Coerces all numeric fields from strings to numbers
 *   - Computes missing edge weights using haversine distance between endpoints
 */
function _normalise(graph: Graph): void {
  // Node fields can arrive as strings from JSON — coerce to numbers.
  for (const n of graph.nodes) {
    n.id  = Number(n.id);
    n.lat = Number(n.lat);
    n.lng = Number(n.lng);
  }

  for (const e of graph.edges) {
    // The database uses from_node / to_node column names; map them to the
    // GraphEdge interface fields (from / to) used throughout the codebase.
    const raw = e as unknown as Record<string, unknown>;
    if (raw['from_node'] !== undefined) e.from = raw['from_node'] as number;
    if (raw['to_node']   !== undefined) e.to   = raw['to_node']   as number;

    e.id   = Number(e.id);
    e.from = Number(e.from);
    e.to   = Number(e.to);
    // weight may arrive as a string from the API — coerce early so Dijkstra
    // does numeric addition, not string concatenation.
    if (e.weight != null) e.weight = Number(e.weight);
  }

  // Build a temporary id → node map to resolve endpoints for weight computation.
  const map = new Map<number, GraphNode>(graph.nodes.map(n => [n.id, n]));
  for (const e of graph.edges) {
    // Fill in missing or non-numeric weights with the straight-line distance
    // between the two endpoint nodes so Dijkstra has a meaningful cost.
    if (e.weight == null || isNaN(e.weight)) {
      const a = map.get(e.from);
      const b = map.get(e.to);
      e.weight = a && b ? _haversine(a.lat, a.lng, b.lat, b.lng) : 1;
    }
  }
}

/** Great-circle distance in metres between two lat/lng points (Haversine formula). */
function _haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in metres
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
