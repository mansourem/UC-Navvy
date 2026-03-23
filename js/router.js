/**
 * router.js
 * Route planning engine for UC Navvy.
 *
 * Handles:
 *  - ADA accessibility validation
 *  - Graph-based pathfinding (intra- and inter-building)
 *  - Leaflet route layer drawing with real hallway polylines
 *  - Graceful fallback to straight-line rendering when graph data is unavailable
 *  - Turn-by-turn step generation
 *
 * Emits custom DOM events:
 *  - navvy:route:start   { request }
 *  - navvy:route:ready   { request, steps, layers }
 *  - navvy:route:error   { request, error }
 *  - navvy:route:cleared
 */

'use strict';

import { BUILDINGS, STYLES, APP } from './config.js';
import { getMap, fitBounds } from './map.js';
import { renderFloorplan, clearAllFloorplans } from './floorplan.js';
import {
  loadGraph, mergeGraphs,
  findBestPath,
  getEntranceNodes, getFloorNodes, nodeMap,
} from './graph.js';

// ─── STATE ────────────────────────────────────────────────────────────────────

/** @type {L.LayerGroup|null} */
let _routeLayerGroup = null;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RouteRequest
 * @property {string}  startBuilding
 * @property {number}  startFloor
 * @property {string}  endBuilding
 * @property {number}  endFloor
 * @property {boolean} adaOnly
 */

/**
 * @typedef {Object} RouteStep
 * @property {string} icon
 * @property {string} text
 * @property {'info'|'vertical'|'walk'|'arrive'|'warning'} type
 */

/**
 * Validate a route request against ADA constraints.
 * @param {RouteRequest} req
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateRoute(req) {
  const { startBuilding, startFloor, endBuilding, endFloor, adaOnly } = req;
  const sb = BUILDINGS[startBuilding];
  const eb = BUILDINGS[endBuilding];

  if (!sb) return { valid: false, reason: `Unknown building: ${startBuilding}` };
  if (!eb) return { valid: false, reason: `Unknown building: ${endBuilding}` };

  if (adaOnly) {
    if (!sb.accessibleEntranceNodes.length)
      return { valid: false, reason: `${sb.name} does not have an ADA accessible entrance.` };
    if (startBuilding !== endBuilding && !eb.accessibleEntranceNodes.length)
      return { valid: false, reason: `${eb.name} does not have an ADA accessible entrance.` };
  }

  if (startBuilding === endBuilding && startFloor === endFloor)
    return { valid: false, reason: 'Start and destination are the same location.' };

  return { valid: true };
}

/**
 * Plan and render a route.
 * @param {RouteRequest} req
 * @returns {Promise<RouteStep[]>}
 */
export async function planRoute(req) {
  emit('navvy:route:start', { request: req });

  const validation = validateRoute(req);
  if (!validation.valid) {
    const err = new Error(validation.reason);
    emit('navvy:route:error', { request: req, error: err });
    throw err;
  }

  clearRoute();
  clearAllFloorplans();

  const { startBuilding, startFloor, endBuilding, endFloor, adaOnly } = req;
  const isSameBuilding = startBuilding === endBuilding;

  // Render floorplan(s) as the background layer
  await renderFloorplan(startBuilding, startFloor, 'start', !isSameBuilding);
  if (isSameBuilding && startFloor !== endFloor) {
    await renderFloorplan(startBuilding, endFloor, 'ghost', false);
  }

  let layers;
  if (isSameBuilding) {
    layers = await _renderIntraBuilding(startBuilding, startFloor, endFloor, adaOnly);
  } else {
    layers = await _renderInterBuilding(startBuilding, startFloor, endBuilding, endFloor, adaOnly);
  }

  const steps = _buildSteps(req);
  emit('navvy:route:ready', { request: req, steps, layers });
  return steps;
}

/**
 * Clear all route layers from the map.
 */
export function clearRoute() {
  const map = getMap();
  if (_routeLayerGroup && map) {
    try { map.removeLayer(_routeLayerGroup); } catch (_) {}
    _routeLayerGroup = null;
  }
  emit('navvy:route:cleared', {});
}

// ─── INTRA-BUILDING ───────────────────────────────────────────────────────────

async function _renderIntraBuilding(building, startFloor, endFloor, adaOnly) {
  // Try graph-based path first
  try {
    const graph = await loadGraph(building);
    const layers = _routeFromGraph(graph, startFloor, endFloor, adaOnly);
    if (layers) return layers;
  } catch (_) {
    // Graph not yet available — fall through to fallback
  }

  return _intraFallback(building, startFloor, endFloor, adaOnly);
}

// ─── INTER-BUILDING ───────────────────────────────────────────────────────────

async function _renderInterBuilding(startBuilding, startFloor, endBuilding, endFloor, adaOnly) {
  // Load both building graphs. If either fails, fall back immediately.
  let startGraph, endGraph;
  try {
    [startGraph, endGraph] = await Promise.all([
      loadGraph(startBuilding),
      loadGraph(endBuilding),
    ]);
  } catch (_) {
    return _interFallback(startBuilding, startFloor, endBuilding, endFloor, adaOnly);
  }

  const startAnchors = _floorAnchors(startGraph, startFloor, adaOnly);
  const endAnchors   = _floorAnchors(endGraph,   endFloor,   adaOnly);

  if (startAnchors.length && endAnchors.length) {
    // ── Step 1: Try indoor-only merge.
    // Buildings connected by a shared interior node (tunnel, skybridge, connected corridor)
    // will have matching node IDs at the connection point. mergeGraphs deduplicates by ID,
    // so those shared nodes automatically stitch the two graphs together — no outdoor
    // segment needed.
    const indoorMerged = mergeGraphs(startGraph, endGraph);
    const indoorPath   = findBestPath(indoorMerged, startAnchors, endAnchors, adaOnly);
    if (indoorPath) {
      return _drawPath(indoorPath, nodeMap(indoorMerged), adaOnly);
    }

    // ── Step 2: No indoor connection — route via the campus outdoor graph.
    try {
      const campusGraph  = await loadGraph('campus');
      const fullMerged   = mergeGraphs(startGraph, endGraph, campusGraph);
      const outdoorPath  = findBestPath(fullMerged, startAnchors, endAnchors, adaOnly);
      if (outdoorPath) {
        return _drawPath(outdoorPath, nodeMap(fullMerged), adaOnly);
      }
    } catch (_) {
      // Campus graph not yet available
    }
  }

  return _interFallback(startBuilding, startFloor, endBuilding, endFloor, adaOnly);
}

// ─── GRAPH RENDERING HELPERS ─────────────────────────────────────────────────

/**
 * Find and draw a path between floors within a single building graph.
 * Returns null if no suitable anchor nodes exist.
 */
function _routeFromGraph(graph, startFloor, endFloor, adaOnly) {
  const startAnchors = _floorAnchors(graph, startFloor, adaOnly);
  const endAnchors   = _floorAnchors(graph, endFloor,   adaOnly);

  if (!startAnchors.length || !endAnchors.length) return null;

  const path = findBestPath(graph, startAnchors, endAnchors, adaOnly);
  if (!path) return null;

  return _drawPath(path, nodeMap(graph), adaOnly);
}

/**
 * Pick anchor nodes for a floor: prefer entrance nodes, fall back to any floor node.
 */
function _floorAnchors(graph, floor, adaOnly) {
  const entrances = getEntranceNodes(graph, floor, adaOnly);
  if (entrances.length) return entrances;
  const floorNodes = getFloorNodes(graph, floor).filter(n => !adaOnly || n.ada !== false);
  return floorNodes;
}

/**
 * Convert a node-ID path into Leaflet polyline layers, split by floor segment.
 * Outdoor segments (floor === null) use the outdoor style.
 * Returns the array of layers, and sets _routeLayerGroup.
 */
function _drawPath(path, nMap, adaOnly) {
  const map = getMap();
  if (!map) return [];

  const routeStyle  = adaOnly ? STYLES.route.ada      : STYLES.route.standard;
  const glowStyle   = { ...routeStyle, weight: routeStyle.weight + 6, opacity: 0.12 };
  const outdoorStyle = {
    ...routeStyle,
    dashArray: adaOnly ? '10,6' : '12,5',
    opacity: routeStyle.opacity * 0.85,
  };

  // Split path into contiguous floor segments
  const segments = _splitByFloor(path, nMap);

  const layers = [];

  for (const seg of segments) {
    if (seg.coords.length < 2) continue;
    const style = seg.floor === null ? outdoorStyle : routeStyle;
    const glow  = L.polyline(seg.coords, glowStyle);
    const line  = L.polyline(seg.coords, style);
    layers.push(glow, line);
  }

  // Start / end markers from first and last node in path
  const firstNode = nMap.get(path[0]);
  const lastNode  = nMap.get(path[path.length - 1]);

  if (firstNode) {
    layers.push(
      L.circleMarker([firstNode.lat, firstNode.lng], STYLES.marker.start)
        .bindPopup(`<strong>Start</strong>${firstNode.label ? '<br>' + firstNode.label : ''}`)
    );
  }
  if (lastNode) {
    layers.push(
      L.circleMarker([lastNode.lat, lastNode.lng], STYLES.marker.end)
        .bindPopup(`<strong>Destination</strong>${lastNode.label ? '<br>' + lastNode.label : ''}`)
    );
  }

  _routeLayerGroup = L.layerGroup(layers).addTo(map);

  // Fit to the full path bounds
  const allCoords = segments.flatMap(s => s.coords);
  if (allCoords.length >= 2) {
    try { fitBounds(L.latLngBounds(allCoords), APP.FIT_PADDING); } catch (_) {}
  }

  return [_routeLayerGroup];
}

/**
 * Split an ordered node-ID path into contiguous same-floor segments.
 * Each segment: { floor: number|null, coords: [lat, lng][] }
 * Nodes crossing floors share a coord point at the boundary so lines connect visually.
 */
function _splitByFloor(path, nMap) {
  if (!path.length) return [];

  const segments = [];
  let current = null;

  for (const id of path) {
    const node = nMap.get(id);
    if (!node) continue;
    const floor = node.floor ?? null;
    const coord = [node.lat, node.lng];

    if (!current || current.floor !== floor) {
      // Share the boundary coord with the previous segment so lines connect
      if (current) current.coords.push(coord);
      current = { floor, coords: [coord] };
      segments.push(current);
    } else {
      current.coords.push(coord);
    }
  }

  return segments;
}

// ─── FALLBACK RENDERERS ───────────────────────────────────────────────────────
// Used when graph data is not yet available for a building.

function _intraFallback(building, startFloor, endFloor, adaOnly) {
  const bldg = BUILDINGS[building];
  const [lng, lat] = bldg.center;
  const map = getMap();

  const vStyle = adaOnly && bldg.elevatorNodes?.length ? STYLES.route.ada : STYLES.route.standard;

  const startMarker = L.circleMarker([lat, lng], STYLES.marker.start)
    .bindPopup(`<strong>Start</strong><br>${bldg.name} — Floor ${startFloor}`);
  const endMarker   = L.circleMarker([lat, lng], STYLES.marker.end)
    .bindPopup(`<strong>Destination</strong><br>${bldg.name} — Floor ${endFloor}`);
  const vLine = L.polyline([[lat, lng], [lat, lng]], { ...vStyle, opacity: 0.5 });

  _routeLayerGroup = L.layerGroup([startMarker, endMarker, vLine]).addTo(map);

  try {
    fitBounds(
      L.latLngBounds([[lat - 0.001, lng - 0.001], [lat + 0.001, lng + 0.001]]),
      APP.FIT_PADDING
    );
  } catch (_) {}

  return [_routeLayerGroup];
}

function _interFallback(startBuilding, startFloor, endBuilding, endFloor, adaOnly) {
  const sb = BUILDINGS[startBuilding];
  const eb = BUILDINGS[endBuilding];
  const map = getMap();

  const startLL = L.latLng(sb.center[1], sb.center[0]);
  const endLL   = L.latLng(eb.center[1], eb.center[0]);
  const style   = adaOnly ? STYLES.route.ada : STYLES.route.standard;

  const glow       = L.polyline([startLL, endLL], { ...style, weight: style.weight + 4, opacity: 0.15 });
  const routeLine  = L.polyline([startLL, endLL], style);
  const startMarker = L.circleMarker(startLL, STYLES.marker.start)
    .bindPopup(`<strong>Start</strong><br>${sb.name} — Floor ${startFloor}`);
  const endMarker   = L.circleMarker(endLL, STYLES.marker.end)
    .bindPopup(`<strong>Destination</strong><br>${eb.name} — Floor ${endFloor}`);

  _routeLayerGroup = L.layerGroup([glow, routeLine, startMarker, endMarker]).addTo(map);
  fitBounds(L.latLngBounds([startLL, endLL]), APP.FIT_PADDING);

  return [_routeLayerGroup];
}

// ─── STEP GENERATION ─────────────────────────────────────────────────────────

/**
 * @param {RouteRequest} req
 * @returns {RouteStep[]}
 */
function _buildSteps(req) {
  const { startBuilding, startFloor, endBuilding, endFloor, adaOnly } = req;
  const sb = BUILDINGS[startBuilding];
  const eb = BUILDINGS[endBuilding];
  const vertical     = adaOnly ? 'elevator' : 'stairwell';
  const vertIcon     = adaOnly ? '🛗' : '🪜';
  const entranceType = adaOnly ? 'accessible entrance' : 'main entrance';

  const steps = [];

  steps.push({ icon: '📍', type: 'info',
    text: `Begin at ${sb.name}, Floor ${startFloor}` });

  if (startBuilding === endBuilding) {
    if (startFloor !== endFloor) {
      const dir    = endFloor > startFloor ? 'up' : 'down';
      const floors = Math.abs(endFloor - startFloor);
      steps.push({ icon: vertIcon, type: 'vertical',
        text: `Take the ${vertical} ${dir} ${floors} floor${floors > 1 ? 's' : ''} to Floor ${endFloor}` });
    }
  } else {
    if (sb.entranceNodes.length) {
      steps.push({ icon: vertIcon, type: 'vertical',
        text: `Take the ${vertical} down to the entrance level` });
    }

    steps.push({ icon: '🚪', type: 'info',
      text: `Exit ${sb.name} via the ${entranceType}` });

    const distNote = _estimateWalkTime(sb.center, eb.center);
    steps.push({ icon: '🚶', type: 'walk',
      text: `Walk to ${eb.name} (~${distNote})` });

    if (adaOnly && !eb.accessibleEntranceNodes.length) {
      steps.push({ icon: '⚠️', type: 'warning',
        text: `Note: ${eb.name} has no mapped ADA accessible entrance.` });
    }

    steps.push({ icon: '🚪', type: 'info',
      text: `Enter ${eb.name} via the ${entranceType}` });

    if (endFloor > 1) {
      steps.push({ icon: vertIcon, type: 'vertical',
        text: `Take the ${vertical} to Floor ${endFloor}` });
    }
  }

  steps.push({ icon: '🏁', type: 'arrive',
    text: `Arrive at ${eb.name}, Floor ${endFloor}` });

  return steps;
}

/** Rough walk-time estimate from Haversine distance */
function _estimateWalkTime([lng1, lat1], [lng2, lat2]) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const metres  = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const minutes = Math.max(1, Math.round(metres / 80));
  return `${minutes} min walk`;
}

function emit(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}
