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

import { BUILDINGS, STYLES, APP } from './config.js';
import { getMap, fitBounds } from './map.js';
// TODO: re-enable floorplan import once floorplan rendering is wired up
// import { renderFloorplan, clearAllFloorplans } from './floorplan.js';
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
  // if (adaOnly) {
  //   if (!sb.accessibleEntranceNodes.length)
  //     return { valid: false, reason: `${sb.name} does not have an ADA accessible entrance.` };
  //   if (!eb.accessibleEntranceNodes.length)
  //     return { valid: false, reason: `${eb.name} does not have an ADA accessible entrance.` };
  // }

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

  // TODO: re-enable floorplan clearing once floorplan rendering is wired up
  // clearAllFloorplans();

  // TODO: re-enable floorplan rendering once floorplan API is stable
  // await renderFloorplan(req.startBuilding, req.startFloor, 'start', true);

  // TODO: re-enable intra-building routing once indoor graphs are available
  // Currently routes outdoor only regardless of building
  const layers = await _renderOutdoorRoute(req.startBuilding, req.endBuilding, req.adaOnly);

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

// ─── OUTDOOR ROUTING ─────────────────────────────────────────────────────────

/**
 * Route between two buildings using the outdoor campus graph.
 * Finds the nearest outdoor node to each building's center, runs Dijkstra,
 * then draws the path edge by edge (from → to for each step).
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

  const result = findPath(outdoorGraph, startNode.id, endNode.id, adaOnly);

  if (!result || result.nodes.length < 2) {
    return _outdoorFallback(startBuilding, endBuilding, adaOnly);
  }

  return _drawEdges(result.edges, result.nodes, nMap, adaOnly);
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

  return [_routeLayerGroup];
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
 * @returns {RouteStep[]}
 */
function _buildSteps(req) {
  const { startBuilding, endBuilding, adaOnly } = req;
  const sb = BUILDINGS[startBuilding];
  const eb = BUILDINGS[endBuilding];
  const entranceType = adaOnly ? 'accessible entrance' : 'main entrance';

  const steps = [];

  steps.push({ icon: '📍', type: 'info',
    text: `Begin at ${sb.name}` });

  steps.push({ icon: '🚪', type: 'info',
    text: `Exit ${sb.name} via the ${entranceType}` });

  const distNote = _estimateWalkTime(sb.center, eb.center);
  steps.push({ icon: '🚶', type: 'walk',
    text: `Walk to ${eb.name} (~${distNote})` });

  // TODO: re-enable ADA entrance warning once entrance nodes are mapped
  // if (adaOnly && !eb.accessibleEntranceNodes.length) {
  //   steps.push({ icon: '⚠️', type: 'warning',
  //     text: `Note: ${eb.name} has no mapped ADA accessible entrance.` });
  // }

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

function emit(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}
