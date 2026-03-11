/**
 * map.js
 * Handles Leaflet map initialization, tile layers, and base marker utilities.
 * Does NOT manage floorplan or route layers — those live in floorplan.js / router.js.
 */

'use strict';

import { MAP_CONFIG, BUILDINGS } from './config.js';

// ─── INTERNAL STATE ───────────────────────────────────────────────────────────

let _map = null;
let _buildingMarkers = [];
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

  // Zoom control — bottom right
  L.control.zoom({ position: 'bottomright' }).addTo(_map);

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
 * Dim/un-dim building markers based on a selected building key.
 * @param {string|null} selectedKey - Highlight this building; dim the rest
 */
export function highlightBuilding(selectedKey) {
  _buildingMarkers.forEach(({ key, el }) => {
    if (!el) return;
    el.style.opacity = (!selectedKey || key === selectedKey) ? '1' : '0.3';
    el.style.borderColor = key === selectedKey ? '#E00122' : '#333';
  });
}

// ─── PRIVATE HELPERS ─────────────────────────────────────────────────────────

function _addBuildingMarkers() {
  Object.entries(BUILDINGS).forEach(([key, bldg]) => {
    const [lng, lat] = bldg.coords;

    const el = document.createElement('div');
    el.className = 'building-marker';
    el.setAttribute('data-building', key);
    el.innerHTML = `
      <span class="building-marker__dot"></span>
      <span class="building-marker__label">${bldg.shortName}</span>
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
