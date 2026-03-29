/**
 * map.js
 * Handles Leaflet map initialization, tile layers, and base marker utilities.
 * Does NOT manage floorplan or route layers — those live in floorplan.js / router.js.
 */

'use strict';

import { MAP_CONFIG, BUILDINGS, STYLES, FEATURES } from './config.js';

// ─── INTERNAL STATE ───────────────────────────────────────────────────────────

let _map = null;
let _buildingMarkers = [];
/** @type {Map<string, L.Polygon>} */
let _buildingPolygons = new Map();
let _onBuildingClick = null;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Initialize the Leaflet map.
 * @param {string} containerId - ID of the <div> to mount into
 * @param {Function} [onBuildingClick] - Called with (buildingKey) when a marker is clicked
 * @returns {L.Map}
 */
export function initMap(containerId, onBuildingClick) {
  if (_map) return _map;

  _onBuildingClick = onBuildingClick || null;

  _map = L.map(containerId, {
    center: MAP_CONFIG.center,
    zoom: MAP_CONFIG.zoom,
    minZoom: MAP_CONFIG.minZoom,
    maxZoom: MAP_CONFIG.maxZoom,
    zoomControl: false,
  });

  // Tile layer
  L.tileLayer(MAP_CONFIG.tileUrl, {
    attribution: MAP_CONFIG.tileAttribution,
    subdomains: MAP_CONFIG.tileSubdomains,
    maxZoom: MAP_CONFIG.maxZoom,
  }).addTo(_map);

  // Zoom control placement
  L.control.zoom({ position: 'topright' }).addTo(_map);

  // Polygons rendered first so markers sit on top
  if (FEATURES.BUILDING_POLYGONS) _addBuildingPolygons();
  _addBuildingMarkers();

  return _map;
}

/**
 * Get the current Leaflet map instance.
 * @returns {L.Map|null}
 */
export function getMap() {
  return _map;
}

/**
 * Fly the map to a [lat, lng] with a given zoom level.
 * @param {[number,number]} latLng
 * @param {number} [zoom=18]
 */
export function flyTo(latLng, zoom = 18) {
  if (!_map) return;
  _map.flyTo(latLng, zoom, { duration: 0.8 });
}

/**
 * Fit the map to a Leaflet LatLngBounds.
 * @param {L.LatLngBounds} bounds
 * @param {number[]} [padding=[60,60]]
 */
export function fitBounds(bounds, padding = [60, 60]) {
  if (!_map || !bounds || !bounds.isValid()) return;
  _map.fitBounds(bounds, { padding });
}

/**
 * Highlight a selected building polygon and dim the rest.
 * Also updates marker opacity to match.
 * @param {string|null} selectedKey - Highlight this building; dim the rest. null = reset all.
 */
export function highlightBuilding(selectedKey) {
  _buildingMarkers.forEach(({ key, el }) => {
    if (!el) return;
    el.style.opacity = (!selectedKey || key === selectedKey) ? '1' : '0.3';
    el.style.borderColor = key === selectedKey ? '#E00122' : '#333';
  });

  _buildingPolygons.forEach((poly, key) => {
    if (!selectedKey) {
      poly.setStyle(STYLES.buildingPolygon.default);
    } else if (key === selectedKey) {
      poly.setStyle(STYLES.buildingPolygon.highlighted);
    } else {
      poly.setStyle(STYLES.buildingPolygon.dimmed);
    }
  });
}

// ─── PRIVATE HELPERS ─────────────────────────────────────────────────────────
// TODO: edit polygon display so we dont have to copy past the polygons into the building config info
function _addBuildingPolygons() {
  Object.entries(BUILDINGS).forEach(([key, bldg]) => {
    const coords = bldg.polygon ?? _placeholderPolygon(bldg.center);
    const poly = L.polygon(coords, { ...STYLES.buildingPolygon.default, interactive: true })
      .addTo(_map)
      .on('click', () => {
        if (_onBuildingClick) _onBuildingClick(key);
      });
    _buildingPolygons.set(key, poly);
  });
}

function _addBuildingMarkers() {
  Object.entries(BUILDINGS).forEach(([key, bldg]) => {
    const [lng, lat] = bldg.center;

    const el = document.createElement('div');
    el.className = 'building-marker';
    el.setAttribute('data-building', key);
    el.innerHTML = `
      <span class="building-marker__dot"></span>
      <span class="building-marker__label">${bldg.name}</span>
    `;

    const icon = L.divIcon({
      html: el,
      className: '',
      iconAnchor: [0, 16],
    });

    const marker = L.marker([lat, lng], { icon })
      .addTo(_map)
      .on('click', () => {
        if (_onBuildingClick) _onBuildingClick(key);
      });

    // Store reference to DOM element for highlight updates
    _buildingMarkers.push({ key, marker, el });
  });
}

/**
 * Generate a small rectangular placeholder polygon from a building center.
 * Used when a building has no surveyed polygon data.
 * @param {[number, number]} center - [lng, lat]
 * @returns {[number, number][]} [[lat,lng], ...] ring
 */
function _placeholderPolygon([lng, lat]) {
  const hw = 0.00030; // ~26 m in longitude
  const hh = 0.00023; // ~26 m in latitude
  return [
    [lat + hh, lng - hw],
    [lat + hh, lng + hw],
    [lat - hh, lng + hw],
    [lat - hh, lng - hw],
  ];
}
