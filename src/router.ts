/**
 * router.ts — TypeScript port of js/router.js.
 * Pure route-planning logic — no DOM, no map library.
 * Returns a RouteResult containing GeoJSON for MapLibre and RouteSteps for the UI.
 */

import { BUILDINGS } from './data/config';
import { loadGraph, findPath, nodeMap, GraphEdge, GraphNode } from './graph';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface RouteRequest {
  startBuilding: string;
  endBuilding:   string;
  adaOnly:       boolean;
}

export interface RouteStep {
  icon: string;
  text: string;
  type: 'info' | 'walk' | 'arrive' | 'warning';
}

type LngLat = [number, number]; // [lng, lat] — GeoJSON / MapLibre order

export interface RouteResult {
  /** GeoJSON FeatureCollection of LineString edges for the route polyline */
  routeGeoJSON: GeoJSON.FeatureCollection;
  /** GeoJSON FeatureCollection with 'start' and 'end' Point features */
  endpointsGeoJSON: GeoJSON.FeatureCollection;
  steps:       RouteStep[];
  /** [[swLng, swLat], [neLng, neLat]] passed to map.fitBounds() */
  bounds:      [LngLat, LngLat] | null;
  isAda:       boolean;
  isFallback:  boolean;
}

// ─── VALIDATION ───────────────────────────────────────────────────────────────

export function validateRoute(req: RouteRequest): { valid: boolean; reason?: string } {
  const sb = BUILDINGS[req.startBuilding];
  const eb = BUILDINGS[req.endBuilding];
  if (!sb) return { valid: false, reason: `Unknown building: ${req.startBuilding}` };
  if (!eb) return { valid: false, reason: `Unknown building: ${req.endBuilding}` };
  if (req.startBuilding === req.endBuilding)
    return { valid: false, reason: 'Start and destination are the same building.' };
  return { valid: true };
}

// ─── PLAN ROUTE ───────────────────────────────────────────────────────────────

export async function planRoute(req: RouteRequest): Promise<RouteResult> {
  const check = validateRoute(req);
  if (!check.valid) throw new Error(check.reason);

  try {
    const graph = await loadGraph();
    const nMap  = nodeMap(graph);
    const sb    = BUILDINGS[req.startBuilding];
    const eb    = BUILDINGS[req.endBuilding];

    
    // center is [lng, lat]; _nearestNode expects (lat, lng)
    const startNode = _nearestNode(graph.nodes, sb.center[1], sb.center[0]);
    const endNode   = _nearestNode(graph.nodes, eb.center[1], eb.center[0]);

    if (!startNode || !endNode || startNode.id === endNode.id) {
      return _fallback(req);
    }

    let result = findPath(graph, startNode.id, endNode.id, req.adaOnly);
    const adaFallback = !result && req.adaOnly;
    if (!result) result = findPath(graph, startNode.id, endNode.id, false);
    if (!result || result.nodes.length < 2) return _fallback(req);

    const allCoords: LngLat[] = [];
    const lineFeatures: GeoJSON.Feature[] = [];

    for (const edge of result.edges) {
      const a = nMap.get(edge.from);
      const b = nMap.get(edge.to);
      if (!a || !b) continue;
      const from: LngLat = [a.lng, a.lat];
      const to:   LngLat = [b.lng, b.lat];
      lineFeatures.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [from, to] },
        properties: { ada: edge.ada },
      });
      allCoords.push(from, to);
    }

    const firstNode = nMap.get(result.nodes[0])!;
    const lastNode  = nMap.get(result.nodes[result.nodes.length - 1])!;
    const startCoord: LngLat = [firstNode.lng, firstNode.lat];
    const endCoord:   LngLat = [lastNode.lng,  lastNode.lat];

    return {
      routeGeoJSON:     { type: 'FeatureCollection', features: lineFeatures },
      endpointsGeoJSON: _endpointsGeoJSON(startCoord, endCoord),
      steps:            _buildSteps(req, result.edges, nMap, adaFallback),
      bounds:           _calcBounds([...allCoords, startCoord, endCoord]),
      isAda:            req.adaOnly,
      isFallback:       false,
    };
  } catch (err) {
    console.error('[planRoute] error, falling back to straight line:', err);
    return _fallback(req);
  }
}

// ─── FALLBACK ────────────────────────────────────────────────────────────────

function _fallback(req: RouteRequest): RouteResult {
  const sb = BUILDINGS[req.startBuilding];
  const eb = BUILDINGS[req.endBuilding];
  return {
    routeGeoJSON: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [sb.center, eb.center] },
        properties: { ada: false },
      }],
    },
    endpointsGeoJSON: _endpointsGeoJSON(sb.center, eb.center),
    steps:            _buildSteps(req, null, null, false),
    bounds:           _calcBounds([sb.center, eb.center]),
    isAda:            req.adaOnly,
    isFallback:       true,
  };
}

function _endpointsGeoJSON(start: LngLat, end: LngLat): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', id: 'start', geometry: { type: 'Point', coordinates: start }, properties: { markerType: 'start' } },
      { type: 'Feature', id: 'end',   geometry: { type: 'Point', coordinates: end   }, properties: { markerType: 'end'   } },
    ],
  };
}

function _calcBounds(coords: LngLat[]): [LngLat, LngLat] | null {
  if (coords.length < 2) return null;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

// ─── STEP GENERATION ─────────────────────────────────────────────────────────

function _buildSteps(
  req:         RouteRequest,
  pathEdges:   GraphEdge[] | null,
  nMap:        Map<number, GraphNode> | null,
  adaFallback: boolean,
): RouteStep[] {
  const sb  = BUILDINGS[req.startBuilding];
  const eb  = BUILDINGS[req.endBuilding];
  const ent = req.adaOnly ? 'accessible entrance' : 'main entrance';
  const steps: RouteStep[] = [];

  steps.push({ icon: '📍', type: 'info', text: `Begin at ${sb.name}` });
  steps.push({ icon: '🚪', type: 'info', text: `Exit ${sb.name} via the ${ent}` });

  if (adaFallback)
    steps.push({ icon: '⚠️', type: 'warning', text: 'No ADA-only path found — showing best available route.' });

  if (pathEdges && pathEdges.length > 5 && nMap) {
    for (let i = 0; i < _groupByBearing(pathEdges, nMap).length; i++) {
      const segs    = _groupByBearing(pathEdges, nMap);
      const seg     = segs[i];
      const prevSeg = segs[i - 1];
      if (seg.distance <= 5) continue;
      if (i === 0) {
        steps.push({ icon: '🧭', type: 'walk', text: `Head ${seg.direction} for ${seg.distanceText}` });
      } else {
        const turn = _turnDirection(prevSeg.bearing, seg.bearing);
        if (turn) {
          steps.push({ icon: turn === 'right' ? '↪️' : '↩️', type: 'walk', text: `Turn ${turn}, then head ${seg.direction} for ${seg.distanceText}` });
        } else {
          steps.push({ icon: '⬆️', type: 'walk', text: `Continue ${seg.direction} for ${seg.distanceText}` });
        }
      }
    }
  } else {
    steps.push({ icon: '🚶', type: 'walk', text: `Walk to ${eb.name} (~${_estimateWalkTime(sb.center, eb.center)})` });
  }

  if (req.adaOnly && !eb.accessibleEntranceNodes.length)
    steps.push({ icon: '⚠️', type: 'warning', text: `Note: ${eb.name} has no mapped ADA accessible entrance.` });

  steps.push({ icon: '🚪', type: 'info',   text: `Enter ${eb.name} via the ${ent}` });
  steps.push({ icon: '🏁', type: 'arrive', text: `Arrive at ${eb.name}` });

  return steps;
}

// ─── DIRECTION HELPERS ────────────────────────────────────────────────────────

function _nearestNode(nodes: GraphNode[], lat: number, lng: number): GraphNode | null {
  let best: GraphNode | null = null;
  let bestDist = Infinity;
  for (const n of nodes) {
    const d = _haversine(lat, lng, n.lat, n.lng);
    if (d < bestDist) { bestDist = d; best = n; }
  }
  return best;
}

function _haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function _bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const deg = (x: number) => (x * 180) / Math.PI;
  const dLng = rad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLng);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

function _cardinalDirection(b: number): string {
  return ['north','northeast','east','southeast','south','southwest','west','northwest'][Math.round(b / 45) % 8];
}

function _turnDirection(from: number, to: number): 'left' | 'right' | null {
  const diff = ((to - from) + 360) % 360;
  if (diff < 45 || diff > 315) return null;
  return diff <= 180 ? 'right' : 'left';
}

function _estimateWalkTime([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): string {
  const metres  = _haversine(lat1, lng1, lat2, lng2);
  const minutes = Math.max(1, Math.round(metres / 80));
  return `${minutes} min walk`;
}

interface Segment { bearing: number; direction: string; distance: number; distanceText: string }

function _groupByBearing(edges: GraphEdge[], nMap: Map<number, GraphNode>): Segment[] {
  const THRESHOLD = 30;
  const segs: Segment[] = [];
  let cur: Omit<Segment, 'distanceText'> | null = null;

  for (const edge of edges) {
    const a = nMap.get(edge.from);
    const b = nMap.get(edge.to);
    if (!a || !b) continue;
    const brg  = _bearing(a.lat, a.lng, b.lat, b.lng);
    const dist = edge.weight ?? 0;
    if (!cur) {
      cur = { bearing: brg, direction: _cardinalDirection(brg), distance: dist };
    } else {
      const diff = Math.abs(((brg - cur.bearing) + 540) % 360 - 180);
      if (diff <= THRESHOLD) {
        cur.distance += dist;
      } else {
        segs.push({ ...cur, distanceText: dist < 50 ? `${Math.round(cur.distance)} m` : `${Math.round(cur.distance / 10) * 10} m` });
        cur = { bearing: brg, direction: _cardinalDirection(brg), distance: dist };
      }
    }
  }
  if (cur) segs.push({ ...cur, distanceText: cur.distance < 50 ? `${Math.round(cur.distance)} m` : `${Math.round(cur.distance / 10) * 10} m` });
  return segs;
}
