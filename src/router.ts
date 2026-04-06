/**
 * router.ts — TypeScript port of js/router.js.
 * Pure route-planning logic — no DOM, no map library.
 * Returns a RouteResult containing GeoJSON for MapLibre and RouteSteps for the UI.
 *
 * High-level flow:
 *   1. validateRoute        — reject bad / identical building pairs early
 *   2. _getStitchedGraph    — load base graph, create synthetic entrance↔outdoor
 *                             edges, and cache the unified graph for reuse
 *   3. planRoute            — resolve anchors, run Dijkstra on the unified graph,
 *                             build GeoJSON + indoor segments + steps
 *   4. _resolveAnchor       — priority-ordered selection of the path start/end node
 *   5. _detectRouteMode     — classify path as indoor_only / mixed / outdoor_only
 *   6. _buildSteps          — assemble the ordered list of human-readable steps
 *   7. _indoorExitSteps     — prepend/append indoor navigation for each building
 *   8. _floorTransitionSteps— extract per-floor moves from the raw path data
 *   9. _extractIndoorSegments — group indoor path edges by building and floor
 *                              for the floor-plan overlay panel
 *  10. Direction helpers     — geometry utilities (bearing, haversine, grouping)
 */

import { BUILDINGS, Building } from './data/config';
import {
  loadGraph, findPath, nodeMap, stitchEntrances,
  GraphEdge, GraphNode, Graph,
} from './graph';

// ─── TYPES ────────────────────────────────────────────────────────────────────
// These interfaces define the public contract between the router and the UI.

export interface RouteRequest {
  startBuilding:  string;
  endBuilding:    string;
  adaOnly:        boolean;
  /** Optional: specific indoor node ID for the start location (e.g. a room). */
  startNodeId?:   number;
  /** Optional: specific indoor node ID for the end location (e.g. a room). */
  endNodeId?:     number;
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

/** Classifies a path so _buildSteps can skip irrelevant step groups. */
type RouteMode = 'indoor_only' | 'outdoor_only' | 'mixed';

// ─── VALIDATION ───────────────────────────────────────────────────────────────
// Runs before any graph work. Catches bad input immediately so planRoute never
// receives an invalid request.

export function validateRoute(req: RouteRequest): { valid: boolean; reason?: string } {
  const sb = BUILDINGS[req.startBuilding];
  const eb = BUILDINGS[req.endBuilding];
  // Reject unknown building keys
  if (!sb) return { valid: false, reason: `Unknown building: ${req.startBuilding}` };
  if (!eb) return { valid: false, reason: `Unknown building: ${req.endBuilding}` };

  if (req.startBuilding === req.endBuilding) {
    // Indoor-only routing within one building requires two distinct node IDs.
    if (!req.startNodeId || !req.endNodeId)
      return { valid: false, reason: 'Start and destination are the same building.' };
    if (req.startNodeId === req.endNodeId)
      return { valid: false, reason: 'Start and destination nodes are identical.' };
  }
  return { valid: true };
}

// ─── STITCHED GRAPH CACHE ─────────────────────────────────────────────────────
// The stitched graph (base + synthetic entrance_link edges) is built once and
// reused. It includes the full base graph plus edges that bridge each entrance
// node to its nearest outdoor node, making indoor and outdoor subgraphs one
// connected network for Dijkstra.
//
// If the base graph cache is cleared (graph._cached = null), set
// _stitchedGraph = null here as well to force a rebuild.

let _stitchedGraph: Graph | null = null;

async function _getStitchedGraph(): Promise<{ graph: Graph; nMap: Map<number, GraphNode> }> {
  if (_stitchedGraph) {
    return { graph: _stitchedGraph, nMap: nodeMap(_stitchedGraph) };
  }

  const base  = await loadGraph();
  const nMap  = nodeMap(base);

  // Collect all entrance node IDs from the building config as a supplement to
  // the API's entrance=true flag — some nodes may not have the flag set yet.
  const extraIds: number[] = Object.values(BUILDINGS).flatMap(b => b.entranceNodes);

  // Produce synthetic edges and merge them into a new graph object.
  // The base graph object itself is not mutated so its cache stays clean.
  const syntheticEdges = stitchEntrances(base, nMap, extraIds);
  _stitchedGraph = {
    nodes: base.nodes,
    edges: [...base.edges, ...syntheticEdges],
  };
  console.log(`[Router] Stitched graph built: ${_stitchedGraph.edges.length} total edges (${syntheticEdges.length} synthetic)`);

  return { graph: _stitchedGraph, nMap: nodeMap(_stitchedGraph) };
}

// ─── PLAN ROUTE ───────────────────────────────────────────────────────────────
// Core orchestration function. Loads the stitched graph, resolves anchor nodes,
// runs Dijkstra over the unified indoor+outdoor network, converts the result to
// GeoJSON, and calls _buildSteps to produce the human-readable instruction list.

export async function planRoute(req: RouteRequest): Promise<RouteResult> {
  const check = validateRoute(req);
  if (!check.valid) throw new Error(check.reason);

  try {
    // ── 1. Load graph and resolve building configs ───────────────────────────
    const { graph, nMap } = await _getStitchedGraph();
    const sb = BUILDINGS[req.startBuilding];
    const eb = BUILDINGS[req.endBuilding];

    // ── 2. Resolve path anchor nodes ─────────────────────────────────────────
    // Uses the priority chain: provided nodeId → entrance node → outdoor fallback.
    const startNode = _resolveAnchor(sb, graph, nMap, req.adaOnly, req.startNodeId);
    const endNode   = _resolveAnchor(eb, graph, nMap, req.adaOnly, req.endNodeId);

    if (!startNode || !endNode || startNode.id === endNode.id) {
      return _fallback(req);
    }

    // ── 3. Run Dijkstra on the unified graph ──────────────────────────────────
    // Because entrance nodes are now stitched to outdoor nodes, Dijkstra can
    // find paths that traverse indoor → entrance_link → outdoor → entrance_link
    // → indoor in a single pass. Retry without ADA constraint if needed.
    let result = findPath(graph, startNode.id, endNode.id, req.adaOnly);
    const adaFallback = !result && req.adaOnly;
    if (!result) result = findPath(graph, startNode.id, endNode.id, false);
    if (!result || result.nodes.length < 2) return _fallback(req);
    console.log('[Router] Path found with', result.nodes.length, 'nodes and', result.edges.length, 'edges');

    // ── 4. Classify the path to drive step generation ─────────────────────────
    const routeMode = _detectRouteMode(result.nodes, nMap);

    // ── 5. Convert path edges to GeoJSON LineString features ─────────────────
    // Synthetic entrance_link edges are skipped — they represent logical graph
    // connections, not walkable paths with geographic geometry to draw.
    const allCoords: LngLat[] = [];
    const lineFeatures: GeoJSON.Feature[] = [];

    for (const edge of result.edges) {
      if (edge.type === 'entrance_link') continue;
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
    console.log('[Router] Route coordinates:', allCoords);

    // ── 6. Resolve map endpoints from first/last path nodes ───────────────────
    const firstNode = nMap.get(result.nodes[0])!;
    const lastNode  = nMap.get(result.nodes[result.nodes.length - 1])!;
    const startCoord: LngLat = [firstNode.lng, firstNode.lat];
    const endCoord:   LngLat = [lastNode.lng,  lastNode.lat];
    console.log('[Router] Start coord:', startCoord, 'End coord:', endCoord);

    // ── 7. Assemble and return the full RouteResult ───────────────────────────
    return {
      routeGeoJSON:     { type: 'FeatureCollection', features: lineFeatures },
      endpointsGeoJSON: _endpointsGeoJSON(startCoord, endCoord),
      steps:            _buildSteps(req, result.edges, result.nodes, nMap, adaFallback, routeMode),
      bounds:           _calcBounds([...allCoords, startCoord, endCoord]),
      isAda:            req.adaOnly,
      isFallback:       false,
      indoorSegments:   _extractIndoorSegments(result.nodes, result.edges, nMap),
    };
  } catch (err) {
    console.error('[planRoute] error, falling back to straight line:', err);
    return _fallback(req);
  }
}

// ─── ANCHOR RESOLUTION ───────────────────────────────────────────────────────
// Determines the Dijkstra start/end node for a building using this priority:
//   1. Explicitly provided node ID (specific room or floor level)
//   2. ADA-accessible entrance node (when adaOnly is true)
//   3. Nearest entrance node to building center (from config or entrance=true flag)
//   4. Nearest outdoor node to building center (last-resort fallback)
//
// Restricting the fallback to outdoor/entrance nodes avoids the previous bug
// where _nearestNode over ALL nodes accidentally picked disconnected indoor nodes
// that Dijkstra could not reach from the outdoor graph.

function _resolveAnchor(
  building:        Building,
  graph:           Graph,
  nMap:            Map<number, GraphNode>,
  adaOnly:         boolean,
  providedNodeId?: number,
): GraphNode | null {
  // Priority 1: caller supplied a specific node (e.g. a room on a certain floor).
  if (providedNodeId !== undefined) {
    return nMap.get(providedNodeId) ?? null;
  }

  // Priority 2: ADA-preferred entrance when accessibility is requested.
  if (adaOnly) {
    for (const id of building.accessibleEntranceNodes) {
      const n = nMap.get(id);
      if (n) return n;
    }
  }

  // Priority 3a: entrance node from building config (explicit mapping).
  // Pick the one geographically nearest to the building center so routing
  // uses the most convenient entrance, not always the first in the list.
  if (building.entranceNodes.length > 0) {
    let best: GraphNode | null = null;
    let bestDist = Infinity;
    for (const id of building.entranceNodes) {
      const n = nMap.get(id);
      if (!n) continue;
      const d = _haversine(building.center[1], building.center[0], n.lat, n.lng);
      if (d < bestDist) { bestDist = d; best = n; }
    }
    if (best) return best;
  }

  // Priority 3b: any node in the graph flagged entrance=true near building center.
  const flaggedEntrances = graph.nodes.filter(n => n.entrance === true);
  if (flaggedEntrances.length > 0) {
    let best: GraphNode | null = null;
    let bestDist = Infinity;
    for (const n of flaggedEntrances) {
      const d = _haversine(building.center[1], building.center[0], n.lat, n.lng);
      if (d < bestDist) { bestDist = d; best = n; }
    }
    if (best) return best;
  }

  // Priority 4: nearest outdoor node — guarantees the anchor is on the connected
  // outdoor network even when no entrance node is mapped for this building.
  const outdoorNodes = graph.nodes.filter(n => n.floor === null);
  return _nearestNode(outdoorNodes, building.center[1], building.center[0]);
}

// ─── ROUTE MODE DETECTION ────────────────────────────────────────────────────
// Inspects the path node list to determine whether the route is entirely indoor,
// entirely outdoor, or crosses between the two. _buildSteps branches on this to
// suppress irrelevant step groups (e.g. no "Exit building" step for indoor-only).

function _detectRouteMode(pathNodeIds: number[], nMap: Map<number, GraphNode>): RouteMode {
  let hasIndoor  = false;
  let hasOutdoor = false;
  for (const id of pathNodeIds) {
    const n = nMap.get(id);
    if (!n) continue;
    if (n.floor !== null) hasIndoor  = true;
    else                  hasOutdoor = true;
    if (hasIndoor && hasOutdoor) return 'mixed';
  }
  if (hasIndoor)  return 'indoor_only';
  if (hasOutdoor) return 'outdoor_only';
  return 'mixed'; // unreachable in practice; safe default
}

// ─── FALLBACK ────────────────────────────────────────────────────────────────
// Used when no graph path exists or an error occurs. Returns a straight-line
// GeoJSON segment between building centers with generic walking instructions.

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
    steps:            _buildSteps(req, null, null, null, false, 'mixed'),
    bounds:           _calcBounds([sb.center, eb.center]),
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
// sidebar. It branches on routeMode to omit irrelevant sections:
//   indoor_only — no entrance/exit door steps, no outdoor walking steps
//   outdoor_only — no indoor floor transition steps
//   mixed        — full sequence: exit building → outdoor walk → enter building

function _buildSteps(
  req:         RouteRequest,
  pathEdges:   GraphEdge[] | null,
  pathNodeIds: number[] | null,
  nMap:        Map<number, GraphNode> | null,
  adaFallback: boolean,
  routeMode:   RouteMode,
): RouteStep[] {
  const sb  = BUILDINGS[req.startBuilding];
  const eb  = BUILDINGS[req.endBuilding];
  const ada = req.adaOnly;
  const steps: RouteStep[] = [];

  // ── Start building ────────────────────────────────────────────────────────
  // Anchor step: tells the user where they are starting from.
  steps.push({ icon: '📍', type: 'info', text: `Begin at ${sb.name}` });

  if (routeMode !== 'outdoor_only') {
    // Indoor floor navigation from origin room to building exit.
    // For indoor_only routes the mode='exit' steps handle floor transitions but
    // _indoorExitSteps suppresses the door step (we never go outside).
    const startExitSteps = _indoorExitSteps(
      sb, pathEdges, pathNodeIds, nMap, ada,
      'exit', routeMode === 'indoor_only',
    );
    steps.push(...startExitSteps);
  }

  // ADA warning only shown when the user requested ADA routing but none existed.
  if (adaFallback)
    steps.push({ icon: '⚠️', type: 'warning', text: 'No ADA-only path found — showing best available route.' });

  // ── Outdoor walking ───────────────────────────────────────────────────────
  // Skipped entirely for indoor-only routes (same building, different floors).
  if (routeMode !== 'indoor_only') {
    // Filter to outdoor-only edges for bearing computation.
    // entrance_link edges are naturally excluded because one of their endpoints
    // has floor !== null, so they fail the floor === null check on both sides.
    const outdoorEdges = pathEdges && nMap
      ? pathEdges.filter(e => {
          const a = nMap.get(e.from);
          const b = nMap.get(e.to);
          return a?.floor === null && b?.floor === null;
        })
      : null;

    if (outdoorEdges && outdoorEdges.length > 5 && nMap) {
      // Enough outdoor edges exist to give turn-by-turn directions: group
      // consecutive edges with similar bearings into named direction segments.
      const segs = _groupByBearing(outdoorEdges, nMap);
      for (let i = 0; i < segs.length; i++) {
        const seg     = segs[i];
        const prevSeg = segs[i - 1];
        // Skip negligible micro-segments (e.g. path-graph rounding artifacts).
        if (seg.distance <= 5) continue;
        if (i === 0) {
          // First segment: no prior bearing to turn from.
          steps.push({ icon: '🧭', type: 'walk', text: `Head ${seg.direction} for ${seg.distanceText}` });
        } else {
          // Subsequent segments: compute whether the heading change is a turn.
          const turn = _turnDirection(prevSeg.bearing, seg.bearing);
          if (turn) {
            steps.push({ icon: turn === 'right' ? '↪️' : '↩️', type: 'walk',
              text: `Turn ${turn}, then head ${seg.direction} for ${seg.distanceText}` });
          } else {
            steps.push({ icon: '⬆️', type: 'walk', text: `Continue ${seg.direction} for ${seg.distanceText}` });
          }
        }
      }
    } else {
      // Too few outdoor edges for detailed directions — use a simple walk step
      // with an estimated time based on straight-line distance.
      steps.push({ icon: '🚶', type: 'walk',
        text: `Walk to ${eb.name} (~${_estimateWalkTime(sb.center, eb.center)})` });
    }
  }

  // ── End building ──────────────────────────────────────────────────────────
  if (routeMode !== 'outdoor_only') {
    // Warn when ADA was requested but the destination has no mapped accessible entrance.
    if (ada && !eb.accessibleEntranceNodes.length)
      steps.push({ icon: '⚠️', type: 'warning',
        text: `Note: ${eb.name} has no mapped ADA accessible entrance.` });

    // Indoor floor navigation from building entrance to destination room.
    const endEntrySteps = _indoorExitSteps(
      eb, pathEdges, pathNodeIds, nMap, ada,
      'enter', routeMode === 'indoor_only',
    );
    steps.push(...endEntrySteps);
  }

  // Final arrival step.
  steps.push({ icon: '🏁', type: 'arrive', text: `Arrive at ${eb.name}` });

  return steps;
}

// ─── INDOOR STEP HELPERS ──────────────────────────────────────────────────────

/**
 * Generate indoor steps for entering or exiting a building.
 * mode='exit'  → navigate from room to exit (start building)
 * mode='enter' → navigate from entrance inward (end building)
 *
 * When suppressDoorStep=true (indoor-only route), the "Exit/Enter via entrance"
 * step is omitted because the user never goes outside.
 *
 * Uses path node data when available; falls back to building config
 * (elevatorNodes, floors) when the indoor subgraph is disconnected from
 * the outdoor path.
 */
function _indoorExitSteps(
  building:        Building,
  pathEdges:       GraphEdge[] | null,
  pathNodeIds:     number[] | null,
  nMap:            Map<number, GraphNode> | null,
  ada:             boolean,
  mode:            'exit' | 'enter',
  suppressDoorStep: boolean = false,
): RouteStep[] {
  const steps: RouteStep[] = [];
  const hasElevator  = building.elevatorNodes !== null && building.elevatorNodes.length > 0;
  const multiFloor   = building.floors.length > 1;
  const entranceWord = ada ? 'accessible entrance' : 'entrance';

  // Attempt to derive per-floor steps directly from the Dijkstra path.
  // Returns [] when the building's indoor subgraph isn't connected to the path.
  const floorSteps = _floorTransitionSteps(pathEdges, pathNodeIds, nMap, mode);

  if (mode === 'exit') {
    // For exit: show floor transitions first, then the door step.
    if (floorSteps.length > 0) {
      // Detailed floor-by-floor steps derived from path data.
      steps.push(...floorSteps);
    } else if (multiFloor) {
      // Fallback: generic instruction when path data isn't available.
      if (hasElevator && ada) {
        steps.push({ icon: '🛗', type: 'walk', text: `Take the elevator to the ground floor in ${building.name}` });
      } else {
        steps.push({ icon: '🚶', type: 'walk', text: `Navigate to the ground floor in ${building.name}` });
      }
    }
    // Door step — omitted for indoor-only routes where the user stays inside.
    if (!suppressDoorStep)
      steps.push({ icon: '🚪', type: 'info', text: `Exit ${building.name} via the ${entranceWord}` });
  } else {
    // For enter: show the door step first, then floor transitions.
    if (!suppressDoorStep)
      steps.push({ icon: '🚪', type: 'info', text: `Enter ${building.name} via the ${entranceWord}` });

    if (floorSteps.length > 0) {
      // Detailed floor-by-floor steps derived from path data.
      steps.push(...floorSteps);
    } else if (multiFloor) {
      // Fallback: generic instruction when path data isn't available.
      if (hasElevator && ada) {
        steps.push({ icon: '🛗', type: 'walk', text: `Take the elevator to your destination floor in ${building.name}` });
      } else {
        steps.push({ icon: '🚶', type: 'walk', text: `Navigate to your destination floor in ${building.name}` });
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
 * The loop stops as soon as either endpoint of the current edge is outdoor
 * (floor === null). This fires on the entrance_link edge boundary, ensuring we
 * never generate a step for the synthetic indoor↔outdoor connection.
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
    // This also fires on entrance_link edges (one indoor, one outdoor endpoint).
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

// ─── INDOOR SEGMENT EXTRACTION ────────────────────────────────────────────────
// Walks the full path and groups consecutive indoor edges by building and floor.
// The result populates RouteResult.indoorSegments, consumed by the floor-plan
// overlay panel (IndoorRoutePanel / FloorPlanMap) to draw per-floor route lines.

function _extractIndoorSegments(
  pathNodeIds: number[],
  pathEdges:   GraphEdge[],
  nMap:        Map<number, GraphNode>,
): IndoorSegment[] {
  const segments: IndoorSegment[] = [];
  // Track the current indoor segment being assembled.
  let currentKey:  string | null = null;
  let currentFloors = new Set<number>();
  let currentEdgesByFloor: Record<number, GeoJSON.Feature[]> = {};

  // Flush the in-progress segment into the results array.
  function flushSegment() {
    if (!currentKey) return;
    const building = BUILDINGS[currentKey];
    if (!building) return;
    const routesByFloor: Record<number, GeoJSON.FeatureCollection> = {};
    for (const [floor, features] of Object.entries(currentEdgesByFloor)) {
      routesByFloor[Number(floor)] = { type: 'FeatureCollection', features };
    }
    segments.push({
      buildingKey:   currentKey,
      buildingName:  building.name,
      floors:        [...currentFloors].sort((a, b) => a - b),
      routesByFloor,
    });
    currentKey         = null;
    currentFloors      = new Set();
    currentEdgesByFloor = {};
  }

  // Identify which building a node belongs to by finding the BUILDINGS entry
  // whose center is geographically closest to the node. This is a best-effort
  // approximation used when the node is not listed in any entranceNodes array.
  function buildingKeyForNode(node: GraphNode): string | null {
    // Fast path: check if this node is listed in any building's entranceNodes.
    for (const [key, b] of Object.entries(BUILDINGS)) {
      if (b.entranceNodes.includes(node.id)) return key;
    }
    // Spatial fallback: nearest building center.
    let bestKey: string | null = null;
    let bestDist = Infinity;
    for (const [key, b] of Object.entries(BUILDINGS)) {
      const d = _haversine(node.lat, node.lng, b.center[1], b.center[0]);
      if (d < bestDist) { bestDist = d; bestKey = key; }
    }
    return bestKey;
  }

  for (let i = 0; i < pathEdges.length; i++) {
    const edge = pathEdges[i];
    const a    = nMap.get(pathNodeIds[i]);
    const b    = nMap.get(pathNodeIds[i + 1]);
    if (!a || !b) continue;

    // entrance_link and outdoor edges are not part of any indoor segment.
    if (edge.type === 'entrance_link' || a.floor === null || b.floor === null) {
      flushSegment();
      continue;
    }

    // Both endpoints are indoor — determine which building we're in.
    const key = buildingKeyForNode(a) ?? buildingKeyForNode(b);
    if (!key) { flushSegment(); continue; }

    // Start a new segment when the building changes.
    if (key !== currentKey) {
      flushSegment();
      currentKey = key;
    }

    // Record which floors are visited and accumulate GeoJSON features per floor.
    const floor = a.floor;
    currentFloors.add(floor);
    if (b.floor !== floor) currentFloors.add(b.floor); // stair/elevator edge spans two floors

    if (!currentEdgesByFloor[floor]) currentEdgesByFloor[floor] = [];
    currentEdgesByFloor[floor].push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [[a.lng, a.lat], [b.lng, b.lat]],
      },
      properties: { ada: edge.ada, edgeType: edge.type },
    });
  }

  // Flush any trailing indoor segment at the end of the path.
  flushSegment();

  return segments;
}

// ─── DIRECTION HELPERS ────────────────────────────────────────────────────────
// Pure geometry utilities used by the outdoor turn-by-turn step builder.

// Returns the graph node geographically closest to (lat, lng) from a given list.
function _nearestNode(nodes: GraphNode[], lat: number, lng: number): GraphNode | null {
  let best: GraphNode | null = null;
  let bestDist = Infinity;
  for (const n of nodes) {
    const d = _haversine(lat, lng, n.lat, n.lng);
    if (d < bestDist) { bestDist = d; best = n; }
  }
  console.log(`[Router] Nearest node to (${lat}, ${lng}) is ${best?.id} at (${best?.lat}, ${best?.lng}), distance ${bestDist.toFixed(2)} m`);
  return best;
}

// Great-circle distance in metres between two lat/lng points.
function _haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
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
        segs.push({ ...cur, distanceText: cur.distance < 50 ? `${Math.round(cur.distance)} m` : `${Math.round(cur.distance / 10) * 10} m` });
        cur = { bearing: brg, direction: _cardinalDirection(brg), distance: dist };
      }
    }
  }
  // Flush the final in-progress segment.
  if (cur) segs.push({ ...cur, distanceText: cur.distance < 50 ? `${Math.round(cur.distance)} m` : `${Math.round(cur.distance / 10) * 10} m` });
  return segs;
}
