/**
 * router.js
 * Route planning engine for UC Navvy.
 *
 * Handles:
 *  - ADA accessibility validation
 *  - Outdoor graph-based pathfinding between buildings
 *  - Leaflet route layer drawing, edge by edge along the outdoor graph
 *  - Graceful fallback to straight-line rendering when graph data is unavailable
 *  - Turn-by-turn step generation
 *
 * Emits custom DOM events:
 *  - navvy:route:start   { request }
 *  - navvy:route:ready   { request, steps, layers }
 *  - navvy:route:error   { request, error }
 *  - navvy:route:cleared
 *
 * TODO: Re-enable intra-building routing once indoor graphs are available
 * TODO: Re-enable floorplan rendering once floorplan API is stable
 */

'use strict';

import { BUILDINGS, STYLES, APP, FEATURES } from './config.js';
import { getMap, fitBounds } from './map.js';
import { renderFloorplan, clearAllFloorplans } from './floorplan.js';
import {
  loadGraph,
  findPath,
  nodeMap,
} from './graph.js';

// ─── STATE ────────────────────────────────────────────────────────────────────

/** @type {L.LayerGroup|null} */
let _routeLayerGroup = null;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RouteRequest
 * @property {string}  startBuilding
 * @property {string}  endBuilding
 * @property {boolean} adaOnly
 * TODO: add startFloor / endFloor back once floor selection is wired up
 */

/**
 * @typedef {Object} RouteStep
 * @property {string} icon
 * @property {string} text
 * @property {'info'|'vertical'|'walk'|'arrive'|'warning'} type
 */

/**
 * Validate a route request.
 * @param {RouteRequest} req
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateRoute(req) {
  const { startBuilding, endBuilding } = req;
  const sb = BUILDINGS[startBuilding];
  const eb = BUILDINGS[endBuilding];

  if (!sb) return { valid: false, reason: `Unknown building: ${startBuilding}` };
  if (!eb) return { valid: false, reason: `Unknown building: ${endBuilding}` };

  if (startBuilding === endBuilding)
    return { valid: false, reason: 'Start and destination are the same building.' };

  // TODO: re-enable ADA entrance validation once entrance nodes are mapped
  if (adaOnly) {
    if (!sb.accessibleEntranceNodes.length)
      return { valid: false, reason: `${sb.name} does not have an ADA accessible entrance.` };
    if (!eb.accessibleEntranceNodes.length)
      return { valid: false, reason: `${eb.name} does not have an ADA accessible entrance.` };
  }

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

  if (FEATURES.FLOORPLAN_DISPLAY) {
    clearAllFloorplans();
    await renderFloorplan(req.startBuilding, req.startFloor, 'start', true);
  }

  // TODO: re-enable intra-building routing once indoor graphs are available (requires INDOOR_ROUTING)
  const { layers, pathEdges, nMap } = await _renderOutdoorRoute(req.startBuilding, req.endBuilding, req.adaOnly);

  const steps = _buildSteps(req, pathEdges, nMap);
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
  if (FEATURES.FLOORPLAN_DISPLAY) clearAllFloorplans();
  emit('navvy:route:cleared', {});
}

// ─── OUTDOOR ROUTING ─────────────────────────────────────────────────────────

/**
 * Route between two buildings using the outdoor campus graph.
 * Finds the nearest outdoor node to each building's center, runs Dijkstra,
 * then draws the path edge by edge (from → to for each step).
 * @returns {{ layers: L.Layer[], pathEdges: Edge[]|null, nMap: Map|null }}
 */
async function _renderOutdoorRoute(startBuilding, endBuilding, adaOnly) {
  const sb = BUILDINGS[startBuilding];
  const eb = BUILDINGS[endBuilding];

  let outdoorGraph;
  try {
    outdoorGraph = await loadGraph('campusquad');
  } catch (_) {
    return _outdoorFallback(startBuilding, endBuilding, adaOnly);
  }

  const nMap = nodeMap(outdoorGraph);

  // Find the outdoor node closest to each building's center
  const startNode = _nearestNode(outdoorGraph.nodes, sb.center[1], sb.center[0]);
  const endNode   = _nearestNode(outdoorGraph.nodes, eb.center[1], eb.center[0]);

  if (!startNode || !endNode || startNode.id === endNode.id) {
    return _outdoorFallback(startBuilding, endBuilding, adaOnly);
  }

  // Try ADA-only path first; if none exists, try the unrestricted path so the
  // user always gets a route (a warning step is added in _buildSteps).
  let result = findPath(outdoorGraph, startNode.id, endNode.id, adaOnly);

  if ((!result || result.nodes.length < 2)) {
    result = findPath(outdoorGraph, startNode.id, endNode.id, adaOnly);
    adaFallback = !!result && result.nodes.length >= 2;
  }

  if (!result || result.nodes.length < 2) {
    return _outdoorFallback(startBuilding, endBuilding, adaOnly);
  }

  const layers = _drawEdges(result.edges, result.nodes, nMap, adaOnly);
  return { layers, pathEdges: result.edges, nMap };
}

// ─── DRAWING ─────────────────────────────────────────────────────────────────

/**
 * Draw a route as individual edge segments.
 * Each Edge object carries its own from/to node IDs; coordinates are pulled
 * from nMap so every line exactly matches the graph edge.
 *
 * @param {Edge[]}          edges - ordered edges returned by findPath
 * @param {string[]}        pathNodes - ordered node IDs (used for start/end markers)
 * @param {Map<string,Node>} nMap
 * @param {boolean}         adaOnly
 */
function _drawEdges(edges, pathNodes, nMap, adaOnly) {
  const map = getMap();
  if (!map) return [];

  const style     = adaOnly ? STYLES.route.ada : STYLES.route.standard;
  const glowStyle = { ...style, weight: style.weight + 6, opacity: 0.12 };

  const layers = [];
  const allCoords = [];

  // Draw one polyline per edge using the edge's own from/to node IDs
  for (const edge of edges) {
    const a = nMap.get(edge.from);
    const b = nMap.get(edge.to);
    if (!a || !b) continue;

    const coordA = [a.lat, a.lng];
    const coordB = [b.lat, b.lng];

    layers.push(L.polyline([coordA, coordB], glowStyle));
    layers.push(L.polyline([coordA, coordB], style));

    allCoords.push(coordA, coordB);
  }

  // Start / end markers
  const firstNode = nMap.get(pathNodes[0]);
  const lastNode  = nMap.get(pathNodes[pathNodes.length - 1]);

  if (firstNode) {
    layers.push(
      L.circleMarker([firstNode.lat, firstNode.lng], STYLES.marker.start)
        .bindPopup(`<strong>Start</strong>`)
    );
  }
  if (lastNode) {
    layers.push(
      L.circleMarker([lastNode.lat, lastNode.lng], STYLES.marker.end)
        .bindPopup(`<strong>Destination</strong>`)
    );
  }

  _routeLayerGroup = L.layerGroup(layers).addTo(map);

  if (allCoords.length >= 2) {
    try { fitBounds(L.latLngBounds(allCoords), APP.FIT_PADDING); } catch (_) {}
  }

  return [_routeLayerGroup];
}

// ─── FALLBACK RENDERER ───────────────────────────────────────────────────────
// Used when the outdoor graph is unavailable or no path is found.

function _outdoorFallback(startBuilding, endBuilding, adaOnly) {
  const sb = BUILDINGS[startBuilding];
  const eb = BUILDINGS[endBuilding];
  const map = getMap();

  const startLL = L.latLng(sb.center[1], sb.center[0]);
  const endLL   = L.latLng(eb.center[1], eb.center[0]);
  const style   = adaOnly ? STYLES.route.ada : STYLES.route.standard;

  const glow        = L.polyline([startLL, endLL], { ...style, weight: style.weight + 4, opacity: 0.15 });
  const routeLine   = L.polyline([startLL, endLL], style);
  const startMarker = L.circleMarker(startLL, STYLES.marker.start)
    .bindPopup(`<strong>Start</strong><br>${sb.name}`);
  const endMarker   = L.circleMarker(endLL, STYLES.marker.end)
    .bindPopup(`<strong>Destination</strong><br>${eb.name}`);

  _routeLayerGroup = L.layerGroup([glow, routeLine, startMarker, endMarker]).addTo(map);
  fitBounds(L.latLngBounds([startLL, endLL]), APP.FIT_PADDING);

  return { layers: [_routeLayerGroup], pathEdges: null, nMap: null };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Return the node in `nodes` closest to [lat, lng].
 */
function _nearestNode(nodes, lat, lng) {
  let best = null;
  let bestDist = Infinity;
  for (const n of nodes) {
    const d = _haversine(lat, lng, n.lat, n.lng);
    if (d < bestDist) { bestDist = d; best = n; }
  }
  return best;
}

function _haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── STEP GENERATION ─────────────────────────────────────────────────────────

/**
 * @param {RouteRequest} req
 * @param {Edge[]|null}  pathEdges
 * @param {Map|null}     nMap
 * @returns {RouteStep[]}
 */
function _buildSteps(req, pathEdges, nMap) {
  const { startBuilding, endBuilding, adaOnly } = req;
  const sb = BUILDINGS[startBuilding];
  const eb = BUILDINGS[endBuilding];
  const entranceType = adaOnly ? 'accessible entrance' : 'main entrance';

  const steps = [];

  steps.push({ icon: '📍', type: 'info',
    text: `Begin at ${sb.name}` });

  steps.push({ icon: '🚪', type: 'info',
    text: `Exit ${sb.name} via the ${entranceType}` });

  if (pathEdges && pathEdges.length > 5 && nMap) {
    const segments = _groupByBearing(pathEdges, nMap);

    for (let i = 0; i < segments.length; i++) {
      const seg     = segments[i];
      const prevSeg = segments[i - 1];

      if(seg.distance > 5){
      if (i === 0) {
        steps.push({ icon: '🧭', type: 'walk',
          text: `Head ${seg.direction} for ${seg.distanceText}` });
      } else {
        const turn = _turnDirection(prevSeg.bearing, seg.bearing);
        if (turn) {
          steps.push({ icon: turn === 'right' ? '↪️' : '↩️', type: 'walk',
            text: `Turn ${turn}, then head ${seg.direction} for ${seg.distanceText}` });
        } else {
          steps.push({ icon: '⬆️', type: 'walk',
            text: `Continue ${seg.direction} for ${seg.distanceText}` });
        }
      }
    }}
  } else {
    // Fallback when no graph path is available
    const distNote = _estimateWalkTime(sb.center, eb.center);
    steps.push({ icon: '🚶', type: 'walk',
      text: `Walk to ${eb.name} (~${distNote})` });
  }

  // TODO: re-enable ADA entrance warning once entrance nodes are mapped
  if (adaOnly && !eb.accessibleEntranceNodes.length) {
    steps.push({ icon: '⚠️', type: 'warning',
      text: `Note: ${eb.name} has no mapped ADA accessible entrance.` });
  }

  steps.push({ icon: '🚪', type: 'info',
    text: `Enter ${eb.name} via the ${entranceType}` });

  steps.push({ icon: '🏁', type: 'arrive',
    text: `Arrive at ${eb.name}` });

  return steps;
}

/** Rough walk-time estimate from Haversine distance */
function _estimateWalkTime([lng1, lat1], [lng2, lat2]) {
  const metres  = _haversine(lat1, lng1, lat2, lng2);
  const minutes = Math.max(1, Math.round(metres / 80));
  return `${minutes} min walk`;
}

// ─── DIRECTION HELPERS ────────────────────────────────────────────────────────

/**
 * Compass bearing (0–360°) from point A to point B.
 */
function _bearing(lat1, lng1, lat2, lng2) {
  const toRad = x => x * Math.PI / 180;
  const toDeg = x => x * 180 / Math.PI;
  const dLng  = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
          - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Convert a bearing to a cardinal/intercardinal direction name. */
function _cardinalDirection(bearing) {
  const dirs = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  return dirs[Math.round(bearing / 45) % 8];
}

/**
 * Determine turn direction between two bearings.
 * Returns 'left', 'right', or null (straight).
 */
function _turnDirection(fromBearing, toBearing) {
  const diff = ((toBearing - fromBearing) + 360) % 360;
  if (diff < 45 || diff > 315) return null;
  return diff <= 180 ? 'right' : 'left';
}

/** Format a metre distance for display. */
function _formatDistance(metres) {
  if (metres < 50) return `${Math.round(metres)} m`;
  return `${Math.round(metres / 10) * 10} m`;
}

/**
 * Group consecutive path edges into directional segments.
 * Edges within BEARING_THRESHOLD degrees of the current segment are merged.
 * @param {Edge[]}          edges
 * @param {Map<id, Node>}   nMap
 * @returns {{ bearing: number, direction: string, distance: number, distanceText: string }[]}
 */
function _groupByBearing(edges, nMap) {
  const BEARING_THRESHOLD = 30;
  const segments = [];
  let current = null;

  for (const edge of edges) {
    const a = nMap.get(edge.from);
    const b = nMap.get(edge.to);
    if (!a || !b) continue;

    const brg  = _bearing(a.lat, a.lng, b.lat, b.lng);
    const dist = edge.weight ?? 0;

    if (!current) {
      current = { bearing: brg, direction: _cardinalDirection(brg), distance: dist };
    } else {
      const diff = Math.abs(((brg - current.bearing) + 540) % 360 - 180);
      if (diff <= BEARING_THRESHOLD) {
        current.distance += dist;
      } else {
        segments.push({ ...current, distanceText: _formatDistance(current.distance) });
        current = { bearing: brg, direction: _cardinalDirection(brg), distance: dist };
      }
    }
  }

  if (current) segments.push({ ...current, distanceText: _formatDistance(current.distance) });

  return segments;
}

function emit(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}
