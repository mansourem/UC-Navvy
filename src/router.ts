/**
 * router.ts — TypeScript port of js/router.js.
 * Pure route-planning logic — no DOM, no map library.
 * Returns a RouteResult containing GeoJSON for MapLibre and RouteSteps for the UI.
 *
 * High-level flow:
 *   1. validateRoute     — reject bad / identical building pairs early
 *   2. planRoute         — load graph, run Dijkstra, build GeoJSON + steps
 *   3. _buildSteps       — assemble the ordered list of human-readable steps
 *   4. _indoorExitSteps  — prepend/append indoor navigation for each building
 *   5. _floorTransitionSteps — extract per-floor moves from the raw path data
 *   6. Direction helpers  — geometry utilities (bearing, haversine, grouping)
 */

import { BUILDINGS, Building } from './data/config';
import { loadGraph, findPath, nodeMap, computeDistances, GraphEdge, GraphNode } from './graph';

// ─── TYPES ────────────────────────────────────────────────────────────────────
// These interfaces define the public contract between the router and the UI.

export interface RouteRequest {
  startBuilding: string;
  endBuilding:   string;
  adaOnly:       boolean;
  /** Explicit floor in the start building; omit to assume the entrance floor. */
  startFloor?:   number;
  /** Explicit floor in the end building; omit to assume the entrance floor. */
  endFloor?:     number;
}

export interface RouteStep {
  icon: string;
  text: string;
  type: 'info' | 'walk' | 'arrive' | 'warning';
}

type LngLat = [number, number]; // [lng, lat] — GeoJSON / MapLibre order

/** One building's portion of an indoor route, grouped by floor. */
export interface IndoorSegment {
  buildingKey:   string;
  buildingName:  string;
  /** Floors traversed in ascending order */
  floors:        number[];
  /** Per-floor GeoJSON route overlay (LineString features) */
  routesByFloor: Record<number, GeoJSON.FeatureCollection>;
}

export interface RouteResult {
  /** GeoJSON FeatureCollection of LineString edges for the route polyline */
  routeGeoJSON: GeoJSON.FeatureCollection;
  /** GeoJSON FeatureCollection with 'start' and 'end' Point features */
  endpointsGeoJSON: GeoJSON.FeatureCollection;
  steps:          RouteStep[];
  /** [[swLng, swLat], [neLng, neLat]] passed to map.fitBounds() */
  bounds:         [LngLat, LngLat] | null;
  isAda:          boolean;
  isFallback:     boolean;
  /** Indoor route segments — one per building entered/exited */
  indoorSegments: IndoorSegment[];
}

// ─── VALIDATION ───────────────────────────────────────────────────────────────
// Runs before any graph work. Catches bad input immediately so planRoute never
// receives an invalid request.

export function validateRoute(req: RouteRequest): { valid: boolean; reason?: string } {
  const sb = BUILDINGS[req.startBuilding];
  const eb = BUILDINGS[req.endBuilding];
  // Reject unknown building keys
  if (!sb) return { valid: false, reason: `Unknown building: ${req.startBuilding}` };
  if (!eb) return { valid: false, reason: `Unknown building: ${req.endBuilding}` };
  // Routing to the same building is a no-op
  if (req.startBuilding === req.endBuilding)
    return { valid: false, reason: 'Start and destination are the same building.' };
  return { valid: true };
}

// ─── PLAN ROUTE ───────────────────────────────────────────────────────────────
// Core orchestration function. Loads the navigation graph, finds a Dijkstra
// path between the two building centers, converts it to GeoJSON for the map,
// and calls _buildSteps to produce the human-readable instruction list.

export async function planRoute(req: RouteRequest): Promise<RouteResult> {
  const check = validateRoute(req);
  if (!check.valid) throw new Error(check.reason);

  try {
    // ── 1. Load graph and resolve building configs ───────────────────────────
    const graph = await loadGraph();
    const nMap  = nodeMap(graph);
    const sb    = BUILDINGS[req.startBuilding];
    const eb    = BUILDINGS[req.endBuilding];

    // ── 2. Find anchor nodes using two-pass graph-distance entrance selection ───
    // Only search outdoor nodes (floor === null) — indoor nodes form disconnected
    // subgraphs per building and would prevent Dijkstra from finding any path.
    // When adaOnly, restrict the anchor pool to ADA-accessible outdoor nodes so
    // that the Dijkstra start/end are guaranteed eligible in the ADA graph.
    const outdoorNodes   = graph.nodes.filter(n => n.floor === null);
    const anchorPool     = req.adaOnly ? outdoorNodes.filter(n => n.ada) : outdoorNodes;

    // Pass 1: run Dijkstra from a geographic seed near the start building to
    // score all end-building entrances by actual graph distance. ADA-preferred
    // entrances (accessibleEntranceNodes) are always tried first; only when none
    // are mapped does _bestEntranceByDist fall back to regular entranceNodes.
    const startGeoAnchor = _nearestNode(anchorPool, sb, req.adaOnly);
    const distFromStart  = startGeoAnchor
      ? computeDistances(graph, startGeoAnchor.id, req.adaOnly, true)
      : new Map<number, number>();
    const bestEnd    = _bestEntranceByDist(eb, nMap, anchorPool, distFromStart, req.adaOnly);
    const endNode    = bestEnd?.anchor   ?? _nearestNode(anchorPool, eb, req.adaOnly);
    const endEntrance = bestEnd?.entrance ?? (startGeoAnchor
      ? _findClosestEntrance(eb, nMap, startGeoAnchor, req.adaOnly) : null);

    // Pass 2: run Dijkstra from the chosen end anchor to score start-building
    // entrances by actual graph distance back toward the start side.
    const distFromEnd = endNode
      ? computeDistances(graph, endNode.id, req.adaOnly, true)
      : new Map<number, number>();
    const bestStart    = _bestEntranceByDist(sb, nMap, anchorPool, distFromEnd, req.adaOnly);
    const startNode    = bestStart?.anchor   ?? startGeoAnchor;
    const startEntrance = bestStart?.entrance ?? (endNode
      ? _findClosestEntrance(sb, nMap, endNode, req.adaOnly) : null);

    // ── 2b. Resolve floor-specific origin/destination nodes ──────────────────
    // When the user has explicitly selected a floor, find the indoor node on that
    // floor closest to the building center. These become the visual route endpoints
    // and the start/end of an indoor Dijkstra sub-path to the entrance.
    const floorStartNode = req.startFloor !== undefined
      ? _findFloorNode(sb, req.startFloor, nMap, graph.nodes) : null;
    const floorEndNode   = req.endFloor !== undefined
      ? _findFloorNode(eb, req.endFloor,   nMap, graph.nodes) : null;

    // Map pin coordinates — floor node when a floor is selected, otherwise the
    // entrance node, falling back to the outdoor anchor.
    let startPinCoord: LngLat | undefined = floorStartNode
      ? [floorStartNode.lng, floorStartNode.lat]
      : startEntrance ? [startEntrance.lng, startEntrance.lat]
      : startNode     ? [startNode.lng,     startNode.lat]     : undefined;
    let endPinCoord: LngLat | undefined = floorEndNode
      ? [floorEndNode.lng, floorEndNode.lat]
      : endEntrance ? [endEntrance.lng, endEntrance.lat]
      : endNode     ? [endNode.lng,     endNode.lat]     : undefined;
    // Floors of each building's entrance — used to determine whether floor transitions are needed.
    const startEntrFloor = startEntrance?.floor ?? null;
    const endEntrFloor   = endEntrance?.floor   ?? null;

    if (!startNode || !endNode || startNode.id === endNode.id) {
      return _fallback(req, startPinCoord, endPinCoord, startEntrFloor, endEntrFloor);
    }

    // ── 3. Run Dijkstra; retry without ADA constraint if no path found ────────
    // outdoorOnly=true prevents the outdoor path from shortcutting through
    // building interiors — indoor sub-paths are handled separately below.
    let result = findPath(graph, startNode.id, endNode.id, req.adaOnly, true);
    const adaFallback = !result && req.adaOnly;
    if (!result) result = findPath(graph, startNode.id, endNode.id, false, true);
    if (!result || result.nodes.length < 2)
      return _fallback(req, startPinCoord, endPinCoord, startEntrFloor, endEntrFloor);
    console.log('[Router] Path found with', result.nodes.length, 'nodes and', result.edges.length, 'edges');

    // ── 4. Convert path edges to GeoJSON LineString features ─────────────────
    // Each edge becomes a separate feature so its ADA property can be styled
    // independently on the map (e.g. yellow vs blue).
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

    // ── 4b. Extend route line from entrance nodes to outdoor anchors ──────────
    // The Dijkstra path starts/ends at outdoor anchor nodes. Prepend/append short
    // segments to close the visual gap between the entrance pin and the path line.
    if (startEntrance && startNode) {
      const entr: LngLat = [startEntrance.lng, startEntrance.lat];
      const anch: LngLat = [startNode.lng, startNode.lat];
      lineFeatures.unshift({ type: 'Feature',
        geometry: { type: 'LineString', coordinates: [entr, anch] },
        properties: { ada: req.adaOnly } });
      allCoords.push(entr);
    }
    if (endEntrance && endNode) {
      const anch: LngLat = [endNode.lng, endNode.lat];
      const entr: LngLat = [endEntrance.lng, endEntrance.lat];
      lineFeatures.push({ type: 'Feature',
        geometry: { type: 'LineString', coordinates: [anch, entr] },
        properties: { ada: req.adaOnly } });
      allCoords.push(entr);
    }

    // ── 4c. Prepend/append indoor floor segments when a floor is selected ────────
    // Run Dijkstra within the indoor subgraph from the selected floor node to the
    // entrance, then splice those edges onto the ends of the route line so the
    // full path reads: floor node → entrance → outdoor path → entrance → floor node.
    if (floorStartNode && startEntrance) {
      const indoorResult = findPath(graph, floorStartNode.id, startEntrance.id, req.adaOnly)
        ?? findPath(graph, floorStartNode.id, startEntrance.id, false);
      if (indoorResult) {
        const indoorFeatures: GeoJSON.Feature[] = [];
        for (const edge of indoorResult.edges) {
          const a = nMap.get(edge.from);
          const b = nMap.get(edge.to);
          if (!a || !b) continue;
          const from: LngLat = [a.lng, a.lat];
          const to:   LngLat = [b.lng, b.lat];
          indoorFeatures.push({ type: 'Feature',
            geometry: { type: 'LineString', coordinates: [from, to] },
            properties: { ada: edge.ada } });
          allCoords.push(from, to);
        }
        lineFeatures.unshift(...indoorFeatures);
      }
    }
    if (floorEndNode && endEntrance) {
      const indoorResult = findPath(graph, endEntrance.id, floorEndNode.id, req.adaOnly)
        ?? findPath(graph, endEntrance.id, floorEndNode.id, false);
      if (indoorResult) {
        for (const edge of indoorResult.edges) {
          const a = nMap.get(edge.from);
          const b = nMap.get(edge.to);
          if (!a || !b) continue;
          const from: LngLat = [a.lng, a.lat];
          const to:   LngLat = [b.lng, b.lat];
          lineFeatures.push({ type: 'Feature',
            geometry: { type: 'LineString', coordinates: [from, to] },
            properties: { ada: edge.ada } });
          allCoords.push(from, to);
        }
      }
    }

    // ── 5. Resolve map endpoint pins — entrance nodes when mapped ─────────────
    const startCoord: LngLat = startPinCoord ?? [startNode.lng, startNode.lat];
    const endCoord:   LngLat = endPinCoord   ?? [endNode.lng,   endNode.lat];

    // ── 6. Assemble and return the full RouteResult ───────────────────────────
    return {
      routeGeoJSON:     { type: 'FeatureCollection', features: lineFeatures },
      endpointsGeoJSON: _endpointsGeoJSON(startCoord, endCoord),
      steps:            _buildSteps(req, result.edges, result.nodes, nMap, adaFallback, startEntrFloor, endEntrFloor),
      bounds:           _calcBounds([...allCoords, startCoord, endCoord]),
      isAda:            req.adaOnly,
      isFallback:       false,
      indoorSegments:   [],
    };
  } catch (err) {
    console.error('[planRoute] error, falling back to straight line:', err);
    return _fallback(req);
  }
}

// ─── FALLBACK ────────────────────────────────────────────────────────────────
// Used when no graph path exists or an error occurs. Returns a straight-line
// GeoJSON segment between building centers with generic walking instructions.

function _fallback(
  req:            RouteRequest,
  startCoord?:    LngLat,
  endCoord?:      LngLat,
  startEntrFloor?: number | null,
  endEntrFloor?:   number | null,
): RouteResult {
  const sb    = BUILDINGS[req.startBuilding];
  const eb    = BUILDINGS[req.endBuilding];
  const start = startCoord ?? sb.center;
  const end   = endCoord   ?? eb.center;
  return {
    routeGeoJSON: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [start, end] },
        properties: { ada: false },
      }],
    },
    endpointsGeoJSON: _endpointsGeoJSON(start, end),
    steps:            _buildSteps(req, null, null, null, false, startEntrFloor, endEntrFloor),
    bounds:           _calcBounds([start, end]),
    isAda:            req.adaOnly,
    isFallback:       true,
    indoorSegments:   [],
  };
}

// Builds a two-feature FeatureCollection marking the route start and end pins.
function _endpointsGeoJSON(start: LngLat, end: LngLat): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', id: 'start', geometry: { type: 'Point', coordinates: start }, properties: { markerType: 'start' } },
      { type: 'Feature', id: 'end',   geometry: { type: 'Point', coordinates: end   }, properties: { markerType: 'end'   } },
    ],
  };
}

// Derives the SW/NE bounding box from a set of coordinates for map.fitBounds().
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
// _buildSteps assembles the complete ordered list of RouteSteps shown in the
// sidebar. It delegates indoor navigation to _indoorExitSteps and outdoor
// navigation to bearing-based segment grouping.

function _buildSteps(
  req:             RouteRequest,
  pathEdges:       GraphEdge[] | null,
  pathNodeIds:     number[] | null,
  nMap:            Map<number, GraphNode> | null,
  adaFallback:     boolean,
  startEntrFloor?: number | null,
  endEntrFloor?:   number | null,
): RouteStep[] {
  const sb  = BUILDINGS[req.startBuilding];
  const eb  = BUILDINGS[req.endBuilding];
  const ada = req.adaOnly;
  const steps: RouteStep[] = [];

  // ── Start building ────────────────────────────────────────────────────────
  // Anchor step: tells the user where they are starting from.
  steps.push({ icon: '📍', type: 'info', text: `Begin at ${sb.name}` });

  // Indoor floor navigation from origin room to building exit.
  const startExitSteps = _indoorExitSteps(sb, pathEdges, pathNodeIds, nMap, ada, 'exit', req.startFloor, startEntrFloor);
  steps.push(...startExitSteps);

  // ADA warning only shown when the user requested ADA routing but none existed.
  if (adaFallback)
    steps.push({ icon: '⚠️', type: 'warning', text: 'No ADA-only path found — showing best available route.' });

  // ── Split path into ordered segments ─────────────────────────────────────
  // Scan pathEdges in sequence, grouping into outdoor runs and intermediate
  // building crossings. Start/end building indoor edges are excluded here —
  // they're handled above/below by _indoorExitSteps.
  type OutdoorSeg  = { kind: 'outdoor';  edges: GraphEdge[] };
  type BuildingSeg = { kind: 'building'; key: string; edges: GraphEdge[]; nodeIds: number[] };
  const pathSegments: Array<OutdoorSeg | BuildingSeg> = [];

  if (pathEdges && pathNodeIds && nMap) {
    let cur: OutdoorSeg | BuildingSeg | null = null;

    const flushSeg = () => {
      if (!cur) return;
      // Drop start/end building segments — handled by _indoorExitSteps
      if (cur.kind === 'building' &&
          (cur.key === req.startBuilding || cur.key === req.endBuilding)) {
        cur = null; return;
      }
      pathSegments.push(cur);
      cur = null;
    };

    for (let i = 0; i < pathEdges.length; i++) {
      const a = nMap.get(pathNodeIds[i]);
      const b = nMap.get(pathNodeIds[i + 1]);
      if (!a || !b) continue;

      if (a.floor === null && b.floor === null) {
        // Outdoor edge
        if (cur?.kind !== 'outdoor') { flushSeg(); cur = { kind: 'outdoor', edges: [] }; }
        (cur as OutdoorSeg).edges.push(pathEdges[i]);
      } else {
        // At least one indoor endpoint — identify which building
        const indoorNode = a.floor !== null ? a : b;
        const bKey = _detectBuildingForNode(indoorNode, req.startBuilding, req.endBuilding);
        if (!bKey) {
          // Unidentified indoor edge — include in current outdoor group to preserve continuity
          if (cur?.kind !== 'outdoor') { flushSeg(); cur = { kind: 'outdoor', edges: [] }; }
          (cur as OutdoorSeg).edges.push(pathEdges[i]);
          continue;
        }
        if (cur?.kind !== 'building' || (cur as BuildingSeg).key !== bKey) {
          flushSeg();
          cur = { kind: 'building', key: bKey, edges: [], nodeIds: [] };
        }
        const bSeg = cur as BuildingSeg;
        if (!bSeg.nodeIds.length) bSeg.nodeIds.push(pathNodeIds[i]);
        bSeg.edges.push(pathEdges[i]);
        bSeg.nodeIds.push(pathNodeIds[i + 1]);
      }
    }
    flushSeg();
  }

  // ── Generate walking + intermediate building steps ────────────────────────
  // If no segments were built (no path or all edges unclassified), fall back
  // to a single estimated walk step.
  if (!pathSegments.length) {
    steps.push({ icon: '🚶', type: 'walk',
      text: `Walk to ${eb.name} (~${_estimateWalkTime(sb.center, eb.center)})` });
  } else {
    const _isStairEdge = (e: GraphEdge) => {
      if (!nMap) return false;
      const a = nMap.get(e.from);
      const b = nMap.get(e.to);
      return e.type?.toLowerCase().includes('stair') ||
             (a?.type === 'stair' && b?.type === 'stair');
    };

    let firstStep = true;
    let lastWasStair = false;

    for (const seg of pathSegments) {
      if (seg.kind === 'outdoor') {
        if (seg.edges.length > 5 && nMap) {
          // Group consecutive stair vs walking edges and emit directional steps.
          type OutdoorGroup = { isStair: boolean; edges: GraphEdge[] };
          const groups: OutdoorGroup[] = [];
          for (const e of seg.edges) {
            const stair = _isStairEdge(e);
            if (!groups.length || groups[groups.length - 1].isStair !== stair)
              groups.push({ isStair: stair, edges: [] });
            groups[groups.length - 1].edges.push(e);
          }
          for (const group of groups) {
            if (group.isStair) {
              if (!lastWasStair) {
                steps.push({ icon: '🪜', type: 'walk', text: 'Use the stairs' });
                firstStep = false;
              }
              lastWasStair = true;
            } else {
              lastWasStair = false;
              const dirSegs = _groupByBearing(group.edges, nMap!);
              for (let i = 0; i < dirSegs.length; i++) {
                const ds = dirSegs[i];
                if (ds.distance <= 5) continue;
                if (firstStep || i === 0) {
                  steps.push({ icon: '🧭', type: 'walk', text: `Head ${ds.direction} for ${ds.distanceText}` });
                } else {
                  const turn = _turnDirection(dirSegs[i - 1].bearing, ds.bearing);
                  if (turn) {
                    steps.push({ icon: turn === 'right' ? '↪️' : '↩️', type: 'walk',
                      text: `Turn ${turn}, then head ${ds.direction} for ${ds.distanceText}` });
                  } else {
                    steps.push({ icon: '⬆️', type: 'walk', text: `Continue ${ds.direction} for ${ds.distanceText}` });
                  }
                }
                firstStep = false;
              }
            }
          }
        } else {
          // Too few edges for directional detail — estimate from edge weights.
          const dist = seg.edges.reduce((s, e) => s + (e.weight ?? 0), 0);
          const mins = Math.max(1, Math.round(dist / 80));
          steps.push({ icon: '🚶', type: 'walk', text: `Walk (~${mins} min)` });
          firstStep = false;
          lastWasStair = false;
        }
      } else {
        // ── Intermediate building crossing ─────────────────────────────────
        const ib = BUILDINGS[seg.key];
        if (!ib) continue;
        const entrWord = ada ? 'accessible entrance' : 'entrance';
        steps.push({ icon: '🚪', type: 'info', text: `Enter ${ib.name} via the ${entrWord}` });
        if (nMap) steps.push(..._indoorThroughSteps(seg.edges, seg.nodeIds, nMap));
        steps.push({ icon: '🚪', type: 'info', text: `Exit ${ib.name} via the ${entrWord}` });
        firstStep = true;   // reset direction context after crossing a building
        lastWasStair = false;
      }
    }
  }

  // ── End building ──────────────────────────────────────────────────────────
  // Warn only when ADA was requested and the building has no entrance data at all.
  if (ada && !eb.accessibleEntranceNodes.length && !eb.entranceNodes.length)
    steps.push({ icon: '⚠️', type: 'warning',
      text: `Note: ${eb.name} has no mapped ADA accessible entrance.` });

  // Indoor floor navigation from building entrance to destination room.
  const endEntrySteps = _indoorExitSteps(eb, pathEdges, pathNodeIds, nMap, ada, 'enter', req.endFloor, endEntrFloor);
  steps.push(...endEntrySteps);

  // Final arrival step.
  steps.push({ icon: '🏁', type: 'arrive', text: `Arrive at ${eb.name}` });

  return steps;
}

// ─── INDOOR STEP HELPERS ──────────────────────────────────────────────────────

/**
 * Generates ordered indoor steps for a building the path passes through.
 * Handles both floor transitions (elevator / stairs / ramp) and same-floor
 * walking directions in path order. Boundary edges where one endpoint is
 * outdoor (floor === null) are skipped.
 */
function _indoorThroughSteps(
  edges:   GraphEdge[],
  nodeIds: number[],
  nMap:    Map<number, GraphNode>,
): RouteStep[] {
  type WalkGroup  = { kind: 'walk';  edges: GraphEdge[] };
  type FloorGroup = { kind: 'floor'; edge: GraphEdge; from: number; to: number };
  const groups: Array<WalkGroup | FloorGroup> = [];

  for (let i = 0; i < edges.length; i++) {
    const a = nMap.get(nodeIds[i]);
    const b = nMap.get(nodeIds[i + 1]);
    if (!a || !b || a.floor === null || b.floor === null) continue;

    const edgeType  = edges[i].type?.toLowerCase() ?? '';
    const isTransit = a.floor !== b.floor
      || edgeType.includes('elevator')
      || edgeType.includes('stair')
      || edgeType.includes('ramp');

    if (isTransit) {
      groups.push({ kind: 'floor', edge: edges[i], from: a.floor, to: b.floor });
    } else {
      const last = groups[groups.length - 1];
      if (last?.kind === 'walk') last.edges.push(edges[i]);
      else groups.push({ kind: 'walk', edges: [edges[i]] });
    }
  }

  const steps: RouteStep[] = [];
  for (const g of groups) {
    if (g.kind === 'floor') {
      const dir   = g.to > g.from ? 'up' : 'down';
      const etype = g.edge.type?.toLowerCase() ?? '';
      if (etype.includes('elevator'))
        steps.push({ icon: '🛗', type: 'walk', text: `Take the elevator ${dir} to floor ${g.to}` });
      else if (etype.includes('ramp'))
        steps.push({ icon: '♿', type: 'walk', text: `Take the ramp ${dir} to floor ${g.to}` });
      else
        steps.push({ icon: '🪜', type: 'walk', text: `Take the stairs ${dir} to floor ${g.to}` });
    } else {
      const dirSegs = _groupByBearing(g.edges, nMap);
      for (const ds of dirSegs) {
        if (ds.distance <= 2) continue;
        steps.push({ icon: '🚶', type: 'walk', text: `Walk ${ds.direction} for ${ds.distanceText}` });
      }
    }
  }
  return steps;
}

/**
 * Generate indoor steps for entering or exiting a building.
 * mode='exit'  → navigate from room to exit (start building)
 * mode='enter' → navigate from entrance inward (end building)
 *
 * Uses path node data when available; falls back to building config
 * (elevatorNodes, floors) when the indoor subgraph is disconnected from
 * the outdoor path.
 */
function _indoorExitSteps(
  building:      Building,
  pathEdges:     GraphEdge[] | null,
  pathNodeIds:   number[] | null,
  nMap:          Map<number, GraphNode> | null,
  ada:           boolean,
  mode:          'exit' | 'enter',
  selectedFloor?: number,
  entranceFloor?: number | null,
): RouteStep[] {
  const steps: RouteStep[] = [];
  const hasElevator  = building.elevatorNodes !== null && building.elevatorNodes.length > 0;
  const entranceWord = ada ? 'accessible entrance' : 'entrance';

  // Attempt to derive per-floor steps directly from the Dijkstra path.
  // Returns [] when the building's indoor subgraph isn't connected to the path.
  const floorSteps = _floorTransitionSteps(pathEdges, pathNodeIds, nMap, mode);

  // A floor transition is only needed when the user explicitly selected a floor
  // that differs from the entrance floor. No selection → assume entrance floor.
  const needsTransition = selectedFloor !== undefined
    && entranceFloor != null
    && selectedFloor !== entranceFloor;

  if (mode === 'exit') {
    if (floorSteps.length > 0) {
      steps.push(...floorSteps);
    } else if (needsTransition) {
      if (hasElevator && ada) {
        steps.push({ icon: '🛗', type: 'walk', text: `Take the elevator to floor ${entranceFloor} in ${building.name}` });
      } else {
        steps.push({ icon: '🪜', type: 'walk', text: `Take the stairs to floor ${entranceFloor} in ${building.name}` });
      }
    }
    steps.push({ icon: '🚪', type: 'info', text: `Exit ${building.name} via the ${entranceWord}` });
  } else {
    steps.push({ icon: '🚪', type: 'info', text: `Enter ${building.name} via the ${entranceWord}` });
    if (floorSteps.length > 0) {
      steps.push(...floorSteps);
    } else if (needsTransition) {
      if (hasElevator && ada) {
        steps.push({ icon: '🛗', type: 'walk', text: `Take the elevator to floor ${selectedFloor} in ${building.name}` });
      } else {
        steps.push({ icon: '🪜', type: 'walk', text: `Take the stairs to floor ${selectedFloor} in ${building.name}` });
      }
    }
  }

  return steps;
}

/**
 * Scan the path for indoor floor-transition edges (elevator / stairs / ramp).
 *
 * Strategy:
 *   exit  → scan front-to-back  (start of path = origin room, stop at outdoor)
 *   enter → scan back-to-front  (end of path = destination room, stop at outdoor)
 *           then reverse so steps read entrance → destination.
 *
 * Returns [] when the path has no indoor nodes (disconnected subgraph case).
 */
function _floorTransitionSteps(
  pathEdges:   GraphEdge[] | null,
  pathNodeIds: number[] | null,
  nMap:        Map<number, GraphNode> | null,
  mode:        'exit' | 'enter',
): RouteStep[] {
  if (!pathEdges || !pathNodeIds || !nMap) return [];

  const steps: RouteStep[] = [];
  const len = pathEdges.length;

  // Build the iteration order depending on which end of the path we care about.
  // exit : left-to-right  — reads the start building's indoor segment first
  // enter: right-to-left  — reads the end building's indoor segment first
  const range = mode === 'exit'
    ? Array.from({ length: len }, (_, i) => i)            // front → back
    : Array.from({ length: len }, (_, i) => len - 1 - i); // back → front

  for (const i of range) {
    // Resolve the two endpoint nodes for edge i.
    const a = nMap.get(pathNodeIds[i]);
    const b = nMap.get(pathNodeIds[i + 1]);
    if (!a || !b) continue;

    // Stop once we hit the outdoor/indoor boundary — either node being outdoor
    // (floor === null) means we have left the building's indoor graph.
    if (a.floor === null || b.floor === null) break;

    const floorA = a.floor ?? 0;
    const floorB = b.floor ?? 0;
    // Same-floor edges (hallways, corridors) don't need a step.
    if (floorA === floorB) continue;

    // Determine vertical direction for this transition.
    const direction = floorB > floorA ? 'up' : 'down';
    // Edge type drives the icon and verb (elevator / stairs / generic).
    const edgeType  = pathEdges[i].type?.toLowerCase() ?? '';

    if (edgeType.includes('elevator')) {
      steps.push({ icon: '🛗', type: 'walk',
        text: `Take the elevator ${direction} to floor ${floorB}` });
    } else if (edgeType.includes('stair')) {
      steps.push({ icon: '🪜', type: 'walk',
        text: `Take the stairs ${direction} to floor ${floorB}` });
    } else {
      steps.push({ icon: floorB > floorA ? '⬆️' : '⬇️', type: 'walk',
        text: `Go ${direction} to floor ${floorB}` });
    }
  }

  // For 'enter' mode the loop scanned destination→entrance, so steps are
  // in reverse display order; flip them so they read entrance→destination.
  if (mode === 'enter') steps.reverse();

  return steps;
}

// ─── DIRECTION HELPERS ────────────────────────────────────────────────────────
// Pure geometry utilities used by the outdoor turn-by-turn step builder.

// Returns the graph node geographically closest to (lat, lng).
function _nearestNode(nodes: GraphNode[], building: Building, ada: boolean): GraphNode | null {
  let best: GraphNode | null = null;
  let bestDist = Infinity;
  for (const n of nodes) {
    const d = _haversine(building.center[1], building.center[0], n.lat, n.lng);
    if (d < bestDist) { bestDist = d; best = n; }
  }
  console.log(`[Router] Nearest node to (${building.center[0]}, ${building.center[1]}) is ${best?.id} at (${best?.lat}, ${best?.lng}), distance ${bestDist.toFixed(2)} m`);
  return best;
}

// Returns the node in `nodes` geographically closest to the given lat/lng.
function _nearestNodeByCoord(nodes: GraphNode[], lat: number, lng: number): GraphNode | null {
  let best: GraphNode | null = null;
  let bestDist = Infinity;
  for (const n of nodes) {
    const d = _haversine(lat, lng, n.lat, n.lng);
    if (d < bestDist) { bestDist = d; best = n; }
  }
  return best;
}

/**
 * Returns the entrance node of `building` (from entranceNodes or
 * accessibleEntranceNodes when ada) that is geographically closest to `towardNode`.
 * Returns null when no entrances are mapped for the building.
 */
function _findClosestEntrance(
  building:    Building,
  nMap:        Map<number, GraphNode>,
  towardNode:  GraphNode,
  ada:         boolean,
): GraphNode | null {
  const ids = ada && building.accessibleEntranceNodes.length
    ? building.accessibleEntranceNodes
    : building.entranceNodes;
  if (!ids.length) return null;
  let best: GraphNode | null = null;
  let bestDist = Infinity;
  for (const id of ids) {
    const n = nMap.get(id);
    if (!n) continue;
    const d = _haversine(towardNode.lat, towardNode.lng, n.lat, n.lng);
    if (d < bestDist) { bestDist = d; best = n; }
  }
  return best;
}

/**
 * Returns the building key whose center is closest to `node`, excluding the
 * start and end buildings. Returns null when no building is within 300 m
 * (prevents misidentifying a node that doesn't belong to any mapped building).
 */
function _detectBuildingForNode(node: GraphNode, ...excludeKeys: string[]): string | null {
  let bestKey: string | null = null;
  let bestDist = Infinity;
  for (const [key, b] of Object.entries(BUILDINGS)) {
    if (excludeKeys.includes(key)) continue;
    const d = _haversine(node.lat, node.lng, b.center[1], b.center[0]);
    if (d < bestDist) { bestDist = d; bestKey = key; }
  }
  return bestDist < 300 ? bestKey : null;
}

/**
 * Returns the indoor node on `floor` that is geographically closest to the
 * building center — used as the origin/destination when the user selects a floor.
 */
function _findFloorNode(
  building: Building,
  floor:    number,
  nMap:     Map<number, GraphNode>,
  allNodes: GraphNode[],
): GraphNode | null {
  void nMap; // unused — kept for symmetry with other helpers
  const candidates = allNodes.filter(n => n.floor === floor);
  if (!candidates.length) return null;
  // building.center is [lng, lat]; _nearestNodeByCoord expects (lat, lng)
  return _nearestNodeByCoord(candidates, building.center[1], building.center[0]);
}

/**
 * Picks the entrance of `building` whose nearest outdoor anchor has the minimum
 * Dijkstra distance recorded in `distances` (a map produced by computeDistances).
 * ADA-preferred entrances (accessibleEntranceNodes) are tried first when ada=true;
 * falls back to entranceNodes when none are mapped or reachable.
 *
 * Returns { entrance, anchor } — the chosen indoor entrance node and the outdoor
 * anchor adjacent to it — or null when no entrances are mapped for the building.
 */
function _bestEntranceByDist(
  building:  Building,
  nMap:      Map<number, GraphNode>,
  anchorPool: GraphNode[],
  distances: Map<number, number>,
  ada:       boolean,
): { entrance: GraphNode; anchor: GraphNode } | null {
  // ADA-first: prefer accessibleEntranceNodes; fall back to all entranceNodes.
  const ids = ada && building.accessibleEntranceNodes.length
    ? building.accessibleEntranceNodes
    : building.entranceNodes;
  if (!ids.length) return null;

  let best: { entrance: GraphNode; anchor: GraphNode } | null = null;
  let bestDist = Infinity;
  for (const id of ids) {
    const entrance = nMap.get(id);
    if (!entrance) continue;
    const anchor = _nearestNodeByCoord(anchorPool, entrance.lat, entrance.lng);
    if (!anchor) continue;
    const d = distances.get(anchor.id) ?? Infinity;
    if (d < bestDist) { bestDist = d; best = { entrance, anchor }; }
  }
  return best;
}

// Great-circle distance in metres between two lat/lng points.
function _haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  console.log(`[Router] Haversine distance between (${lat1}, ${lng1}) and (${lat2}, ${lng2}) is ${(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2)} m`);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Compass bearing (0–360°) from point 1 to point 2.
function _bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const deg = (x: number) => (x * 180) / Math.PI;
  const dLng = rad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLng);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

// Maps a bearing in degrees to a cardinal/intercardinal direction name.
function _cardinalDirection(b: number): string {
  return ['north','northeast','east','southeast','south','southwest','west','northwest'][Math.round(b / 45) % 8];
}

// Returns 'left', 'right', or null (straight) based on bearing change between segments.
function _turnDirection(from: number, to: number): 'left' | 'right' | null {
  const diff = ((to - from) + 360) % 360;
  if (diff < 45 || diff > 315) return null;
  return diff <= 180 ? 'right' : 'left';
}

// Estimates walking time from building center to center at 80 m/min (leisurely pace).
function _estimateWalkTime([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): string {
  const metres  = _haversine(lat1, lng1, lat2, lng2);
  const minutes = Math.max(1, Math.round(metres / 80));
  return `${minutes} min walk`;
}

interface Segment { bearing: number; direction: string; distance: number; distanceText: string }

/**
 * Groups consecutive outdoor edges whose bearings are within THRESHOLD degrees
 * of each other into a single named direction segment.
 * This collapses slight curves and zigzags in the path graph into clean
 * "head north for 200 m" style instructions.
 */
function _groupByBearing(edges: GraphEdge[], nMap: Map<number, GraphNode>): Segment[] {
  const THRESHOLD = 30; // degrees — tighter = more turn steps, looser = fewer
  const segs: Segment[] = [];
  let cur: Omit<Segment, 'distanceText'> | null = null;

  for (const edge of edges) {
    const a = nMap.get(edge.from);
    const b = nMap.get(edge.to);
    if (!a || !b) continue;
    const brg  = _bearing(a.lat, a.lng, b.lat, b.lng);
    const dist = edge.weight ?? 0;
    if (!cur) {
      // First edge — start a new segment.
      cur = { bearing: brg, direction: _cardinalDirection(brg), distance: dist };
    } else {
      // Angular difference between current edge and ongoing segment.
      const diff = Math.abs(((brg - cur.bearing) + 540) % 360 - 180);
      if (diff <= THRESHOLD) {
        // Still heading the same direction — accumulate distance.
        cur.distance += dist;
      } else {
        // Bearing changed enough — close the current segment and start a new one.
        segs.push({ ...cur, distanceText: dist < 50 ? `${Math.round(cur.distance)} m` : `${Math.round(cur.distance / 10) * 10} m` });
        cur = { bearing: brg, direction: _cardinalDirection(brg), distance: dist };
      }
    }
  }
  // Flush the final in-progress segment.
  if (cur) segs.push({ ...cur, distanceText: cur.distance < 50 ? `${Math.round(cur.distance)} m` : `${Math.round(cur.distance / 10) * 10} m` });
  return segs;
}
