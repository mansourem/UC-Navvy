/**
 * router.js
 * Route planning engine for UC NavVy.
 *
 * Handles:
 *  - ADA accessibility validation
 *  - Turn-by-turn step generation
 *  - Leaflet route layer drawing (intra- and inter-building)
 *  - Ghost overlay for destination floor comparison
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
import { renderFloorplan, clearAllFloorplans, removeFloorplanLayer } from './floorplan.js';

// ─── STATE ────────────────────────────────────────────────────────────────────

/** @type {L.LayerGroup|null} */
let _routeLayerGroup = null;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RouteRequest
 * @property {string} startBuilding
 * @property {number} startFloor
 * @property {string} endBuilding
 * @property {number} endFloor
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
    if (!sb.accessibleEntrance) {
      return { valid: false, reason: `${sb.name} does not have an ADA accessible entrance.` };
    }
    if (!sb.accessibleFloors.includes(startFloor)) {
      return { valid: false, reason: `Floor ${startFloor} of ${sb.name} is not ADA accessible.` };
    }
    if (!eb.accessibleEntrance && startBuilding !== endBuilding) {
      return { valid: false, reason: `${eb.name} does not have an ADA accessible entrance.` };
    }
    if (!eb.accessibleFloors.includes(endFloor)) {
      return { valid: false, reason: `Floor ${endFloor} of ${eb.name} is not ADA accessible.` };
    }
  }

  if (startBuilding === endBuilding && startFloor === endFloor) {
    return { valid: false, reason: 'Start and destination are the same location.' };
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
  clearAllFloorplans();

  const { startBuilding, startFloor, endBuilding, endFloor, adaOnly } = req;
  const isSameBuilding = startBuilding === endBuilding;

  // Render start floorplan
  await renderFloorplan(startBuilding, startFloor, 'start', !isSameBuilding);

  let layers = [];

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
  const bldg = BUILDINGS[building];
  const [lng, lat] = bldg.coords;
  const map = getMap();
  const layers = [];

  // Ghost overlay of the destination floor
  if (startFloor !== endFloor) {
    const ghostLayer = await renderFloorplan(building, endFloor, 'ghost', false);
    if (ghostLayer) layers.push(ghostLayer);
  }

  // Start/end markers at building centroid (no outdoor path needed)
  const startMarker = L.circleMarker([lat, lng], STYLES.marker.start)
    .bindPopup(`<strong>Start</strong><br>${bldg.name} — Floor ${startFloor}`);

  const endMarker = L.circleMarker([lat, lng], STYLES.marker.end)
    .bindPopup(`<strong>Destination</strong><br>${bldg.name} — Floor ${endFloor}`);

  // Vertical transport indicator line between markers (symbolic)
  const vLine = L.polyline([[lat, lng], [lat, lng]], {
    ...( adaOnly && bldg.hasElevator ? STYLES.route.ada : STYLES.route.standard ),
    opacity: 0.5,
  });

  _routeLayerGroup = L.layerGroup([startMarker, endMarker, vLine]).addTo(map);
  layers.push(_routeLayerGroup);

  // Fit to floorplan
  try {
    const bounds = map._layers[Object.keys(map._layers)[0]];
    fitBounds(L.latLngBounds([[lat - 0.001, lng - 0.001], [lat + 0.001, lng + 0.001]]), APP.FIT_PADDING);
  } catch (_) {}

  return layers;
}

// ─── INTER-BUILDING ───────────────────────────────────────────────────────────

async function _renderInterBuilding(startBuilding, startFloor, endBuilding, endFloor, adaOnly) {
  const sb = BUILDINGS[startBuilding];
  const eb = BUILDINGS[endBuilding];
  const map = getMap();
  const layers = [];

  const startLL = L.latLng(sb.coords[1], sb.coords[0]);
  const endLL   = L.latLng(eb.coords[1], eb.coords[0]);

  const routeStyle = adaOnly ? STYLES.route.ada : STYLES.route.standard;

  // Walking path between buildings
  const routeLine = L.polyline([startLL, endLL], routeStyle);

  // Animated dashes via a second layer
  const routeGlow = L.polyline([startLL, endLL], {
    ...routeStyle,
    weight: routeStyle.weight + 4,
    opacity: 0.15,
  });

  // Markers
  const startMarker = L.circleMarker(startLL, STYLES.marker.start)
    .bindPopup(`<strong>Start</strong><br>${sb.name} — Floor ${startFloor}`);

  const endMarker = L.circleMarker(endLL, STYLES.marker.end)
    .bindPopup(`<strong>Destination</strong><br>${eb.name} — Floor ${endFloor}`);

  _routeLayerGroup = L.layerGroup([routeGlow, routeLine, startMarker, endMarker]).addTo(map);
  layers.push(_routeLayerGroup);

  fitBounds(L.latLngBounds([startLL, endLL]), APP.FIT_PADDING);

  return layers;
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
  const vertical      = adaOnly ? 'elevator' : 'stairwell';
  const vertIcon      = adaOnly ? '🛗' : '🪜';
  const entranceType  = adaOnly ? 'accessible entrance' : 'main entrance';

  const steps = [];

  // ── Step 1: Origin
  steps.push({
    icon: '📍',
    type: 'info',
    text: `Begin at ${sb.name}, Floor ${startFloor}`,
  });

  if (startBuilding === endBuilding) {
    // ── Same building ──
    if (startFloor !== endFloor) {
      const dir = endFloor > startFloor ? 'up' : 'down';
      const floors = Math.abs(endFloor - startFloor);
      steps.push({
        icon: vertIcon,
        type: 'vertical',
        text: `Take the ${vertical} ${dir} ${floors} floor${floors > 1 ? 's' : ''} to Floor ${endFloor}`,
      });
      if (adaOnly && sb.elevatorLocation) {
        steps.push({
          icon: 'ℹ️',
          type: 'info',
          text: `Elevator location: ${sb.elevatorLocation}`,
        });
      }
    }
  } else {
    // ── Different buildings ──

    // Descend to entrance floor if needed
    if (startFloor !== sb.entranceFloor) {
      const dir = sb.entranceFloor < startFloor ? 'down' : 'up';
      steps.push({
        icon: vertIcon,
        type: 'vertical',
        text: `Take the ${vertical} ${dir} to the entrance level (Floor ${sb.entranceFloor})`,
      });
    }

    // Exit
    steps.push({
      icon: '🚪',
      type: 'info',
      text: `Exit ${sb.name} via the ${adaOnly ? sb.accessibleEntranceNote || entranceType : entranceType}`,
    });

    // Walk
    const distNote = _estimateWalkTime(sb.coords, eb.coords);
    steps.push({
      icon: '🚶',
      type: 'walk',
      text: `Walk to ${eb.name} (~${distNote})`,
    });

    // ADA warning for destination
    if (adaOnly && !eb.accessibleEntrance) {
      steps.push({
        icon: '⚠️',
        type: 'warning',
        text: `Note: ${eb.name} has limited accessible entry — ${eb.accessibleEntranceNote}`,
      });
    }

    // Enter destination
    steps.push({
      icon: '🚪',
      type: 'info',
      text: `Enter ${eb.name} via the ${adaOnly ? eb.accessibleEntranceNote || entranceType : entranceType} (Floor ${eb.entranceFloor})`,
    });

    // Ascend to destination floor
    if (endFloor !== eb.entranceFloor) {
      const dir = endFloor > eb.entranceFloor ? 'up' : 'down';
      steps.push({
        icon: vertIcon,
        type: 'vertical',
        text: `Take the ${vertical} ${dir} to Floor ${endFloor}`,
      });
      if (adaOnly && eb.elevatorLocation) {
        steps.push({
          icon: 'ℹ️',
          type: 'info',
          text: `Elevator location: ${eb.elevatorLocation}`,
        });
      }
    }
  }

  // ── Final step
  steps.push({
    icon: '🏁',
    type: 'arrive',
    text: `Arrive at ${eb.name}, Floor ${endFloor}`,
  });

  return steps;
}

/** Rough walk time estimate based on coordinate distance */
function _estimateWalkTime([lng1, lat1], [lng2, lat2]) {
  const R = 6371000; // Earth radius in metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  const metres = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const minutes = Math.max(1, Math.round(metres / 80)); // ~80 m/min walking pace
  return `${minutes} min walk`;
}

function emit(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}
