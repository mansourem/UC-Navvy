/**
 * config.js
 * Central configuration for UC Navvy.
 * All building metadata, API endpoints, and map defaults live here.
 */

'use strict';

// ─── API ─────────────────────────────────────────────────────────────────────

export const API = {
  BASE_URL:       'https://uc-navvy-api.onrender.com/api/floorplan',
  GRAPH_BASE_URL: 'https://uc-navvy-api.onrender.com/api/graph',

  /**
   * Build the URL for a specific building + floor's GeoJSON.
   * @param {string} buildingKey  - e.g. 'baldwin'
   * @param {number} floor        - e.g. 4
   * @returns {string}
   */
  floorplanUrl(buildingKey, floor) {
    return `${this.BASE_URL}/${buildingKey}/${floor}`;
  },

  /**
   * Build the URL for a building's navigation graph.
   * Use 'campus' as the key for the outdoor campus graph.
   * @param {string} key  - e.g. 'baldwin' or 'campus'
   * @returns {string}
   */
  graphUrl(key) {
    return `${this.GRAPH_BASE_URL}/${key}`;
  },
};

// ─── MAP DEFAULTS ─────────────────────────────────────────────────────────────

export const MAP_CONFIG = {
  center: [39.1316, -84.5176],  // UC campus centroid [lat, lng]
  zoom: 16,
  minZoom: 14,
  maxZoom: 22,
  tileUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  tileAttribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
  tileSubdomains: 'abcd',
};

// ─── STYLE TOKENS ────────────────────────────────────────────────────────────

export const STYLES = {
  floorplan: {
    default:     { color: 'rgba(180,180,180,0.75)', weight: 1.2, opacity: 0.75, fillOpacity: 0.06, fillColor: 'rgba(180,180,180,0.3)' },
    start:       { color: '#00C851', weight: 1.5,   opacity: 0.9,  fillOpacity: 0.10, fillColor: '#00C851' },
    end:         { color: '#E00122', weight: 1.5,   opacity: 0.9,  fillOpacity: 0.10, fillColor: '#E00122' },
    ghost:       { color: 'rgba(100,100,100,0.3)', weight: 0.8, opacity: 0.3, fillOpacity: 0.03, fillColor: 'rgba(100,100,100,0.1)', dashArray: '4,4' },
  },
  route: {
    standard: { color: '#4A9EFF', weight: 3.5, opacity: 0.9 },
    ada:      { color: '#FFB300', weight: 3.5, opacity: 0.9, dashArray: '10,6' },
  },
  marker: {
    start: { fillColor: '#00C851', color: '#00ff66', radius: 10, weight: 2, fillOpacity: 0.95 },
    end:   { fillColor: '#E00122', color: '#ff3344', radius: 10, weight: 2, fillOpacity: 0.95 },
  },
};

// ─── BUILDING REGISTRY ────────────────────────────────────────────────────────
// TODO: Add all building definitons
/**
 * @typedef {Object} Building
 * @property {string}   name                 - Full display name
 * @property {[number,number]} center        - [lng, lat]
 * @property {number[]} floors               - Available floor numbers
 * @property {number[]|null} elevatorNodes
 * @property {number[]}   entranceNodes        - Floor where main entrance is
 * @property {number[]}   accessibleEntranceNodes
 * @property {string}   apiKey               - Key used in API URL
 */

/** @type {Object.<string, Building>} */
export const BUILDINGS = {
  baldwin: {
    name: 'Baldwin Hall',
    center: [-84.516688, 39.132891],
    floors: [4, 5, 6, 7, 8, 9],
    elevatorNodes: [],
    entranceNodes: [4],
    accessibleEntranceNodes: [4],
    apiKey: 'baldwin',
  },
  braunstein: {
    name: 'Braunstein Hall',
    center: [-84.5180, 39.1315],
    floors: [1, 2, 3, 4],
    elevatorNodes: [1, 2, 3, 4],
    entranceNodes: [1],
    accessibleEntranceNodes: [1, 2, 3, 4],
    apiKey: 'braunstein',
  },
  swift: {
    name: 'Swift Hall',
    center: [-84.5160, 39.1340],
    floors: [1, 2, 3],
    elevatorNodes: null,
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'swift',
  },
  mccmicken: {
    name: 'McMicken Hall',
    center: [-84.5195, 39.1320],
    floors: [1, 2, 3, 4, 5],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'mccmicken',
  },
  tangeman: {
    name: 'Tangeman University Center',
    center: [-84.5170, 39.1308],
    floors: [1, 2, 3],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'tangeman',
  },
};

// ─── APP CONSTANTS ────────────────────────────────────────────────────────────

export const APP = {
  /** How long (ms) to show toast notifications */
  TOAST_DURATION: 4500,
  /** Sidebar collapsed breakpoint (px) */
  SIDEBAR_BREAKPOINT: 768,
  /** Map fit-bounds padding in px */
  FIT_PADDING: [60, 60],
};
