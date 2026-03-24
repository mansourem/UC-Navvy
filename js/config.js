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
  alms:{
    name: 'Alms Building',
    center: [-84.51947795239127, 39.13394397955207],
    floors: [5, 6, 7, 8],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'alms',
  },
  armory:{
  name: 'Armory Fieldhouse',
  center: [-84.51400670992946, 39.13188560825981],
  floors: [2, 3, 4, 5, 6],
  elevatorNodes: [],
  entranceNodes: [],
  accessibleEntranceNodes: [],
  apiKey: 'armory',
  },
  aronoff:{
  name: 'Aronoff Center for Design & Art',
  center: [-84.51817996210889, 39.13433426000876],
  floors: [2, 3, 4, 5, 6],
  elevatorNodes: [],
  entranceNodes: [],
  accessibleEntranceNodes: [],
  apiKey: 'aronoff',
  },
  artsci:{
  name: 'Arts & Sciences Hall',
  center: [-84.51914563201682, 39.131863468061795],
  floors: [1],     //FIX: NOT IN DB
  elevatorNodes: [],
  entranceNodes: [],
  accessibleEntranceNodes: [],
  apiKey: 'artsci',
  },
  baldwin: {
    name: 'Baldwin Hall',
    center: [-84.51673800615372, 39.13284623685328],
    floors: [4, 5, 6, 7, 8, 9],
    elevatorNodes: [],
    entranceNodes: [4],
    accessibleEntranceNodes: [4],
    apiKey: 'baldwin',
  },
  blegen: {
    name: 'Carl Blegen Library',
    center: [-84.51934098443131, 39.12958090288538],
    floors: [1],     //FIX: NOT IN DB
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'blegen',
  }, 
  baseball: {
    name: 'UC Baseball Field',
    center: [-84.51370743009456, 39.13016559114516],
    floors: [1],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'baseball',
  },
  braunstein: {
    name: 'Braunstein Hall',
    center: [-84.51860949637083, 39.13296254880689],
    floors: [1, 2, 3, 4, 5],
    elevatorNodes: [1, 2, 3, 4],
    entranceNodes: [1],
    accessibleEntranceNodes: [1, 2, 3, 4],
    apiKey: 'braunstein',
  },
  calhoun: {
    name: 'Calhoun Hall',
    center: [-84.5170062084613, 39.12863856749061],
    floors: [1],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'calhoun',
  },

  //CCPA FIX: OFF CAMPUS?
  //
  //

  clftct: {
    name: 'Clifton Court Hall',
    center: [-84.51968485850163, 39.13316427138764],
    floors: [1, 2, 3, 4, 5],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'clftct',
  },
  crosley: {
    name: 'Crosley Tower',
    center: [-84.51671492419757, 39.13455654727545],
    floors: [1],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'crosley',
  },
  daap: {
    name: 'Design, Architecture, Art and Planning Building',
    center: [-84.51877458005757, 39.13427502634562],
    floors: [4, 5, 6, 7, 8],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'daap',
  },
  daniels: {
    name: 'Daniels Hall',
    center: [-84.5117758446023, 39.13140851835192],
    floors: [1],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'daniels',
  },
  dabney: {
    name: 'Dabney Hall',
    center: [-84.51311555671336, 39.131668135819666],
    floors: [1],     //FIX: NOT IN DB
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'dabney',
  }, 
  dieterle: {
    name: 'Dieterle Vocal Arts Center',
    center: [-84.51691097865304, 39.13021498359652],
    floors: [1, 2, 3, 4],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'dieterle',
  }, 
  dyers: {
    name: 'Teachers-Dyer Complex',
    center: [-84.51863197602383, 39.13042132369668],
    floors: [1],     //FIX: NOT IN DB
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'dyers',
  },
  edwards: {
    name: 'Edwards Center',
    center: [-84.51218652864813, 39.12906331848919],
    floors: [1],     //FIX: NOT IN DB
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'edwards',
  },
  emery: {
    name: 'Mary Emery Hall',
    center: [-84.51789815695886, 39.1303875174853],
    floors: [1],     //FIX: NOT IN DB
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'emery',
  },
  frenchw: {
    name: 'French Hall',
    center: [-84.51305821376505, 39.13241250641286],
    floors: [1],     //FIX: NOT IN DB
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'frenchw',
  },
  geophys: {
    name: 'Geology-Physics Building',
    center: [-84.5184797230354, 39.13338843078097],
    floors: [1, 2, 3, 4, 5, 6],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'geophys',
  },
  langsam: {
    name: 'Walter C. Langsam Library',
    center: [-84.51570566739038, 39.13418909028243],
    floors: [4, 5, 6],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'langsam',
  },
  law: {
    name: 'College of Law Building',
    center: [-84.5136542262, 39.13476248008203],
    floors: [1],     //FIX: NOT IN DB
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'law',
  },
  lindhall: {
    name: 'Carl H. Lindner Hall',
    center: [-84.51447679629442, 39.13379067791746],
    floors: [0, 1, 2, 3, 4],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'lindhall',
  },
  lndnrctr: {
    name: 'Richard E. Lindner Center',
    center: [-84.51503579504217, 39.1311145018997],
    floors: [1, 2, 3, 4, 5, 6, 7, 8],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'lndnrctr',
  },
  mantei: {
    name: 'Mantei Center',
    center: [-84.51554850896405, 39.133262214190836],
    floors: [3, 4, 5, 6, 7, 8],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'mantei',
  },
  marketpt: {
    name: 'MarketPointe',
    center: [-84.51715032209717, 39.128920809709655],
    floors: [1],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'marketpt',
  },
  morgens: {
    name: 'Morgens Hall',
    center: [-84.51202086063552, 39.13492279120541],
    floors: [1],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'morgens',
  },
  mspencer: {
    name: 'Marian Spencer Hall',
    center: [-84.51219194777279, 39.133712123042955],
    floors: [1],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'mspencer',
  },
  memorial: {
    name: 'Memorial Hall',
    center: [-84.51729620021955, 39.12953145608253],
    floors: [1],     //FIX: NOT IN DB
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'memorial',
  },
  mcmicken: { //FIX: Not in DB
    name: 'McMicken Hall',
    center: [-84.51914221815957, 39.131871165618605],
    floors: [1, 2, 3, 4, 5],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'mcmicken',
  },  
  nippert: {
    name: 'Nippert Stadium',
    center: [-84.51621683066327, 39.131152940916934],
    floors: [1, 2, 3, 4, 5],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'nippert',
  },
  oldchem:{
    name: 'Old Chemistry Building',
    center: [-84.51759931676864, 39.1332622925695],
    floors: [4, 5, 6, 7, 8],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'oldchem',
  },
  reccenter: {
    name: 'Campus Recreation Center',
    center: [-84.51500594612882, 39.13234266520985],
    floors: [0, 1, 2, 3, 4, 5, 6],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'reccenter',
  },
  rhodes: {
    name: 'James A. Rhodes Hall',
    center: [-84.5162434522422, 39.132945638406966],
    floors: [3, 4, 5, 6, 7, 8, 9],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'rhodes',
  },
  rievschl: {
    name: 'George R. Rieveschl Hall',
    center: [-84.51693465876146, 39.1339700017044],
    floors: [4, 5, 6, 7, 8, 9],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'rievschl',
  },
  schneidr: {
    name: 'Herman Schneider Hall',
    center: [-84.51219152169142, 39.13229575815134],
    floors: [1],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'schneidr',
  },
  scioto: {
    name: 'Scioto Hall',
    center: [-84.51200272222876, 39.134294086602466],
    floors: [1],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'scioto',
  },    
  
  //TODO FIX: SAPC?

  shoe: {
    name: 'Myrl H. Shoemaker Multipurpose Center',
    center: [-84.51406348593618, 39.131213349497244],
    floors: [1, 2, 3],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'shoe',
  },  
  siddall: {
    name: 'Siddall Hall',
    center: [-84.51768426507854, 39.129002143014304],
    floors: [1],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'siddall',
  },  
  steger: {
    name: 'Steger Student Life Center',
    center: [-84.5164941231769, 39.13231313776353],
    floors: [3, 4, 5, 6, 7, 8],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'steger',
  },  
  swift: {
    name: 'Swift Hall',
    center: [-84.51741254563956, 39.13245979765452],
    floors: [5, 6, 7, 8],
    elevatorNodes: null,
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'swift',
  },
  tennis: {
    name: 'Tennis Court',
    center: [-84.51568358381813, 39.12994625124256],
    floors: [1],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'tennis',
  },
  tuc: {
    name: 'Tangeman University Center',
    center: [-84.5173820428954, 39.13178769533238],
    floors: [1, 2, 3, 4, 5],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'tuc',
  },
  tuc: {
    name: 'Tangeman University Center',
    center: [-84.5173820428954, 39.13178769533238],
    floors: [1, 2, 3, 4, 5],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'tuc',
  },
  turner: {
    name: 'Darwin Turner Hall',
    center: [-84.51158195616489, 39.13253556660143],
    floors: [1],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'turner',
  },
  univpav: {
    name: '	University Pavilion',
    center: [-84.51856879595664, 39.13099149142258],
    floors: [0, 1, 2, 3, 4, 5, 6],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'univpav',
  },
  vanwormer: {
    name: 'Van Wormer Hall',
    center: [-84.5192527740965, 39.130743070345005],
    floors: [1, 2, 3, 4],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'vanwormer',
  },  
  westcharlton:{
    name: '60 West Charlton',
    center: [-84.51252815125815, 39.1309949470631],
    floors: [0, 1, 2, 3],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: '60Wcharles',
  },
  wolfson: {
    name: 'Erwin S. Wolfson Center for Environmental Design',
    center: [-84.5181774462442, 39.1341524710393],
    floors: [4, 5, 6],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'wolfson',
  },  
  zimmer: {
    name: 'Zimmer Hall',
    center: [-84.51684330107138, 39.133498145463875],
    floors: [3, 4, 5],
    elevatorNodes: [],
    entranceNodes: [],
    accessibleEntranceNodes: [],
    apiKey: 'zimmer',
  }
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
