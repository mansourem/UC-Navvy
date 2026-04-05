/**
 * graph.ts — TypeScript port of js/graph.js.
 * Navigation graph loader, cache, and Dijkstra pathfinder.
 * No DOM or map library dependencies.
 */

import { API } from './config';

export interface GraphNode {
  id:        number;
  lat:       number;
  lng:       number;
  floor:     number | null;
  entrance:  boolean;
  ada:       boolean;
  type:      string;
  label?:    string;
}

export interface GraphEdge {
  id:        number;
  from:      number;
  to:        number;
  weight:    number;
  type:      string;
  ada:       boolean;
  directed?: boolean;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PathResult {
  nodes: number[];
  edges: GraphEdge[];
}

// ─── CACHE ────────────────────────────────────────────────────────────────────

let _cached: Graph | null = null;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export async function loadGraph(): Promise<Graph> {
  if (_cached) return _cached;

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
  _normalise(graph);
  _cached = graph;
  return graph;
}

/**
 * Dijkstra shortest-path.
 * Edges are bidirectional unless edge.directed === true.
 * When adaOnly is true, skips nodes/edges where ada === false.
 */
export function findPath(
  graph:   Graph,
  startId: number,
  endId:   number,
  adaOnly: boolean,
): PathResult | null {
  const { nodes, edges } = graph;

  const eligible = new Set<number>(
    nodes
      .filter(n => !adaOnly || n.ada !== false)
      .map(n => n.id),
  );

  if (!eligible.has(startId) || !eligible.has(endId)) return null;

  const adj = new Map<number, Array<{ id: number; w: number; edge: GraphEdge }>>();
  eligible.forEach(id => adj.set(id, []));

  for (const e of edges) {
    if (!eligible.has(e.from) || !eligible.has(e.to)) continue;
    if (adaOnly && e.ada === false) continue;
    const w = e.weight ?? 1;
    adj.get(e.from)!.push({ id: e.to, w, edge: e });
    if (!e.directed) adj.get(e.to)!.push({ id: e.from, w, edge: e });
  }

  const dist = new Map<number, number>();
  const prev = new Map<number, { fromId: number; edge: GraphEdge }>();
  eligible.forEach(id => dist.set(id, Infinity));
  dist.set(startId, 0);

  const unvisited = new Set<number>(eligible);

  while (unvisited.size > 0) {
    let u: number | null = null;
    for (const id of unvisited) {
      if (u === null || dist.get(id)! < dist.get(u)!) u = id;
    }
    if (u === null || dist.get(u) === Infinity || u === endId) break;
    unvisited.delete(u);

    for (const { id: v, w, edge } of adj.get(u)!) {
      const alt = dist.get(u)! + w;
      if (alt < dist.get(v)!) {
        dist.set(v, alt);
        prev.set(v, { fromId: u, edge });
      }
    }
  }

  if (dist.get(endId) === Infinity) return null;

  const pathNodes: number[] = [];
  const pathEdges: GraphEdge[] = [];
  for (let cur: number | undefined = endId; cur !== undefined; cur = prev.get(cur)?.fromId) {
    pathNodes.unshift(cur);
    const entry = prev.get(cur);
    if (entry) pathEdges.unshift(entry.edge);
  }

  return { nodes: pathNodes, edges: pathEdges };
}

export function nodeMap(graph: Graph): Map<number, GraphNode> {
  return new Map(graph.nodes.map(n => [n.id, n]));
}

// ─── PRIVATE ─────────────────────────────────────────────────────────────────

function _normalise(graph: Graph): void {
  // Coerce all IDs to numbers — the DB/API may return them as strings
  for (const n of graph.nodes) {
    n.id  = Number(n.id);
    n.lat = Number(n.lat);
    n.lng = Number(n.lng);
  }
  for (const e of graph.edges) {
    e.id   = Number(e.id);
    e.from = Number(e.from);
    e.to   = Number(e.to);
  }

  const map = new Map<number, GraphNode>(graph.nodes.map(n => [n.id, n]));
  for (const e of graph.edges) {
    if (e.weight == null) {
      const a = map.get(e.from);
      const b = map.get(e.to);
      e.weight = a && b ? _haversine(a.lat, a.lng, b.lat, b.lng) : 1;
    }
  }
}

function _haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
