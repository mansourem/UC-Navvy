/**
 * config.js
 * Central configuration for UC NavVy.
 * All building metadata, API endpoints, and map defaults live here.
 */

'use strict';

// ─── API ─────────────────────────────────────────────────────────────────────

export const API = {
  BASE_URL: 'https://uc-navvy-api.onrender.com/api/floorplan',

  /**
   * Build the URL for a specific building + floor's GeoJSON.
   * @param {string} buildingKey  - e.g. 'baldwin'
   * @param {number} floor        - e.g. 4
   * @returns {string}
   */
  floorplanUrl(buildingKey, floor) {
    return `${this.BASE_URL}/${buildingKey}/${floor}`;
  },
};

// ─── MAP DEFAULTS ─────────────────────────────────────────────────────────────

export const MAP_CONFIG = {
  center: [39.1316, -84.5176],  // UC campus centroid [lat, lng]
  zoom: 16,
  minZoom: 14,
  maxZoom: 22,
  tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
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

/**
 * @typedef {Object} Building
 * @property {string}   name                 - Full display name
 * @property {string}   shortName            - Abbreviated name
 * @property {[number,number]} coords        - [lng, lat]
 * @property {number[]} floors               - Available floor numbers
 * @property {number[]} accessibleFloors     - ADA-compliant floors
 * @property {boolean}  hasElevator
 * @property {string|null} elevatorLocation
 * @property {number}   entranceFloor        - Floor where main entrance is
 * @property {boolean}  accessibleEntrance
 * @property {string}   accessibleEntranceNote
 * @property {string}   apiKey               - Key used in API URL
 * @property {string}   description
 * @property {string}   address
 */

/** @type {Object.<string, Building>} */
export const BUILDINGS = {
  baldwin: {
    name: 'Baldwin Hall',
    shortName: 'Baldwin',
    coords: [-84.516688, 39.132891],
    floors: [4, 5, 6, 7, 8, 9],
    accessibleFloors: [4, 5, 6, 7, 8, 9],
    hasElevator: true,
    elevatorLocation: 'Main lobby, east corridor',
    entranceFloor: 4,
    accessibleEntrance: true,
    accessibleEntranceNote: 'Ramp on south side of building',
    apiKey: 'baldwin',
    description: 'College of Design, Architecture, Art, and Planning',
    address: '2624 Clifton Ave, Cincinnati, OH 45221',
  },
  braunstein: {
    name: 'Braunstein Hall',
    shortName: 'Braunstein',
    coords: [-84.5180, 39.1315],
    floors: [1, 2, 3, 4],
    accessibleFloors: [1, 2, 3, 4],
    hasElevator: true,
    elevatorLocation: 'Central atrium',
    entranceFloor: 1,
    accessibleEntrance: true,
    accessibleEntranceNote: 'Level entrance on north face',
    apiKey: 'braunstein',
    description: 'Residential hall with academic support spaces',
    address: 'University of Cincinnati, Cincinnati, OH 45221',
  },
  swift: {
    name: 'Swift Hall',
    shortName: 'Swift',
    coords: [-84.5160, 39.1340],
    floors: [1, 2, 3],
    accessibleFloors: [1, 2],
    hasElevator: false,
    elevatorLocation: null,
    entranceFloor: 1,
    accessibleEntrance: false,
    accessibleEntranceNote: 'Steps at main entrance — no accessible entry currently available',
    apiKey: 'swift',
    description: 'Historic hall — limited accessibility',
    address: 'University of Cincinnati, Cincinnati, OH 45221',
  },
  mccmicken: {
    name: 'McMicken Hall',
    shortName: 'McMicken',
    coords: [-84.5195, 39.1320],
    floors: [1, 2, 3, 4, 5],
    accessibleFloors: [1, 2, 3, 4, 5],
    hasElevator: true,
    elevatorLocation: 'West wing, near room 100',
    entranceFloor: 1,
    accessibleEntrance: true,
    accessibleEntranceNote: 'Accessible entrance on east side with automatic doors',
    apiKey: 'mccmicken',
    description: 'Arts & Sciences — landmark rotunda',
    address: '2700 Campus Way, Cincinnati, OH 45221',
  },
  tangeman: {
    name: 'Tangeman University Center',
    shortName: 'TUC',
    coords: [-84.5170, 39.1308],
    floors: [1, 2, 3],
    accessibleFloors: [1, 2, 3],
    hasElevator: true,
    elevatorLocation: 'Multiple elevators throughout',
    entranceFloor: 1,
    accessibleEntrance: true,
    accessibleEntranceNote: 'All entrances accessible with automatic doors',
    apiKey: 'tangeman',
    description: 'Main student union — dining, offices, events',
    address: '2766 UC\'s University Sq, Cincinnati, OH 45219',
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
