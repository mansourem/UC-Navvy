/**
 * UC Navvy - Floorplan Manager
 * Handles loading, rendering, and switching between building floorplans.
 * Floorplans are GeoJSON FeatureCollections (LineStrings representing walls/rooms).
 * Layer naming: "Layer_XX" where XX = zero-padded floor number.
 */

import { fetchFloorplan, fetchBuildingFloors } from './api.js';

const FLOORPLAN_STYLE = {
  color: '#2563eb',
  weight: 1.5,
  opacity: 0.7,
};

export class FloorplanManager {
  /**
   * @param {L.Map} map - Leaflet map instance
   */
  constructor(map) {
    this.map = map;
    this.activeLayers = {}; // buildingId → L.GeoJSON layer
    this.activeFloors = {}; // buildingId → floor
    this.buildingFloors = {}; // buildingId → available floor list
    this.floorplanCache = {}; // `${buildingId}_${floor}` → GeoJSON
  }

  /**
   * Load and display a building's floorplan on a specific floor.
   * @param {string} buildingId
   * @param {string|number} floor
   * @param {Object} options
   * @param {boolean} options.highlight - briefly flash the layer
   */
  async showFloor(buildingId, floor, options = {}) {
    const cacheKey = `${buildingId}_${floor}`;

    // Remove existing layer for this building
    this.hideFloor(buildingId);

    if (!floor || floor === 'outside') return;

    // Check cache first
    let geojson = this.floorplanCache[cacheKey];
    if (!geojson) {
      geojson = await fetchFloorplan(buildingId, floor);
      if (!geojson) {
        console.warn(`No floorplan found for ${buildingId} floor ${floor}`);
        return;
      }
      this.floorplanCache[cacheKey] = geojson;
    }

    // Render GeoJSON layer
    const layer = L.geoJSON(geojson, {
      style: FLOORPLAN_STYLE,
      onEachFeature: (feature, layer) => {
        if (feature.properties?.Text) {
          layer.bindTooltip(feature.properties.Text, { permanent: false });
        }
      }
    }).addTo(this.map);

    this.activeLayers[buildingId] = layer;
    this.activeFloors[buildingId] = floor;

    if (options.highlight) {
      layer.setStyle({ color: '#f59e0b', opacity: 1 });
      setTimeout(() => layer.setStyle(FLOORPLAN_STYLE), 800);
    }

    return layer;
  }

  /**
   * Remove floorplan layer for a building.
   */
  hideFloor(buildingId) {
    if (this.activeLayers[buildingId]) {
      this.map.removeLayer(this.activeLayers[buildingId]);
      delete this.activeLayers[buildingId];
      delete this.activeFloors[buildingId];
    }
  }

  /**
   * Hide all active floorplan layers.
   */
  hideAll() {
    Object.keys(this.activeLayers).forEach(id => this.hideFloor(id));
  }

  /**
   * Get available floors for a building (with caching).
   */
  async getAvailableFloors(buildingId) {
    if (!this.buildingFloors[buildingId]) {
      const floors = await fetchBuildingFloors(buildingId);
      this.buildingFloors[buildingId] = floors.length > 0
        ? floors
        : this._guessFloors(buildingId); // fallback
    }
    return this.buildingFloors[buildingId];
  }

  /**
   * Fallback: guess floors from cached GeoJSON or return defaults.
   */
  _guessFloors(buildingId) {
    // Return common floor list as default
    return ['1', '2', '3', '4', '5', '6'];
  }

  /**
   * Given a path of node IDs, show floorplans for all buildings encountered.
   * @param {string[]} path - array of node_ids
   * @param {Object} nodes - map of node_id → node
   */
  async showFloorplansForPath(path, nodes) {
    this.hideAll();
    const shown = new Set();

    for (const nodeId of path) {
      const node = nodes[nodeId];
      if (!node || node.location === 'outside' || node.floor === 'outside') continue;

      const buildingId = node.building_id || node.location;
      const floor = node.floor;
      const key = `${buildingId}_${floor}`;

      if (!shown.has(key) && buildingId) {
        shown.add(key);
        await this.showFloor(buildingId, floor);
      }
    }
  }

  /**
   * Animate through floors along a route, highlighting transitions.
   */
  async animateRouteFloors(path, nodes, delayMs = 1500) {
    const transitions = [];
    let lastKey = null;

    for (const nodeId of path) {
      const node = nodes[nodeId];
      if (!node) continue;
      const buildingId = node.building_id || node.location;
      const floor = node.floor;
      if (!buildingId || floor === 'outside') continue;

      const key = `${buildingId}_${floor}`;
      if (key !== lastKey) {
        transitions.push({ buildingId, floor });
        lastKey = key;
      }
    }

    for (const { buildingId, floor } of transitions) {
      await this.showFloor(buildingId, floor, { highlight: true });
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}
