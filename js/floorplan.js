/**
 * floorplan.js
 * Fetches GeoJSON floorplans from the API, manages a memory cache,
 * and renders/removes Leaflet layers on the map.
 *
 * Emits custom DOM events:
 *   - navvy:floorplan:loading  { building, floor }
 *   - navvy:floorplan:loaded   { building, floor, layer }
 *   - navvy:floorplan:error    { building, floor, error }
 *   - navvy:floorplan:cleared
 */

'use strict';

import { API, STYLES } from './config.js';
import { getMap, fitBounds } from './map.js';

// ─── CACHE ────────────────────────────────────────────────────────────────────

/** @type {Map<string, Object>} key = "building:floor" → GeoJSON FeatureCollection */
const _cache = new Map();

/** @type {L.GeoJSON[]} Currently rendered floorplan layers */
const _activeLayers = [];

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Fetch a floorplan GeoJSON (with caching).
 * @param {string} building
 * @param {number} floor
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
export async function fetchFloorplan(building, floor) {
  const key = `${building}:${floor}`;
  if (_cache.has(key)) return _cache.get(key);

  const url = API.floorplanUrl(building, floor);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`API ${resp.status} — ${url}`);

  const geojson = await resp.json();
  _cache.set(key, geojson);
  return geojson;
}

/**
 * Render a floorplan on the map.
 * @param {string} building
 * @param {number} floor
 * @param {'default'|'start'|'end'|'ghost'} [styleKey='default']
 * @param {boolean} [fitToLayer=true]
 * @returns {Promise<L.GeoJSON|null>}
 */
export async function renderFloorplan(building, floor, styleKey = 'default', fitToLayer = true) {
  emit('navvy:floorplan:loading', { building, floor });

  let geojson;
  try {
    geojson = await fetchFloorplan(building, floor);
  } catch (err) {
    emit('navvy:floorplan:error', { building, floor, error: err });
    return null;
  }

  const map = getMap();
  if (!map) return null;

  const styleBase = STYLES.floorplan[styleKey] || STYLES.floorplan.default;

  const layer = L.geoJSON(geojson, {
    style: _featureStyle(styleBase),
    pointToLayer: () => null,  // Suppress point features
  }).addTo(map);

  _activeLayers.push(layer);

  if (fitToLayer) {
    try {
      fitBounds(layer.getBounds());
    } catch (_) {}
  }

  emit('navvy:floorplan:loaded', { building, floor, layer });
  return layer;
}

/**
 * Remove all currently rendered floorplan layers from the map.
 */
export function clearAllFloorplans() {
  const map = getMap();
  if (!map) return;
  _activeLayers.forEach(layer => {
    try { map.removeLayer(layer); } catch (_) {}
  });
  _activeLayers.length = 0;
  emit('navvy:floorplan:cleared', {});
}

/**
 * Remove a specific layer returned from renderFloorplan().
 * @param {L.GeoJSON} layer
 */
export function removeFloorplanLayer(layer) {
  const map = getMap();
  if (!map || !layer) return;
  try { map.removeLayer(layer); } catch (_) {}
  const idx = _activeLayers.indexOf(layer);
  if (idx !== -1) _activeLayers.splice(idx, 1);
}

/**
 * Pre-warm the cache for a building's floors in the background.
 * @param {string} building
 * @param {number[]} floors
 */
export function prefetchFloorplans(building, floors) {
  floors.forEach(floor => {
    fetchFloorplan(building, floor).catch(() => {
      // Silent — prefetch failures are non-critical
    });
  });
}

/**
 * Return all currently active floorplan layers.
 * @returns {L.GeoJSON[]}
 */
export function getActiveLayers() {
  return [..._activeLayers];
}

/**
 * How many entries are in the floorplan cache.
 * @returns {number}
 */
export function cacheSize() {
  return _cache.size;
}

// ─── PRIVATE HELPERS ─────────────────────────────────────────────────────────

/**
 * Returns a Leaflet style function based on a base style object.
 * Adjusts per feature SubClass for architectural detail.
 */
function _featureStyle(base) {
  return (feature) => {
    const subclass = feature?.properties?.SubClasses || '';
    // Splines and ellipses are typically detail curves — render lighter
    if (subclass.includes('AcDbSpline') || subclass.includes('AcDbEllipse')) {
      return { ...base, weight: Math.max(base.weight - 0.5, 0.5), opacity: base.opacity * 0.7 };
    }
    // Traces are filled areas
    if (subclass.includes('AcDbTrace')) {
      return { ...base, fillOpacity: base.fillOpacity * 2 };
    }
    return base;
  };
}

function emit(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}
