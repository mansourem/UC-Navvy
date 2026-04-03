/**
 * shuttleRoutes.ts
 * Approximate route geometry for the 12 UC shuttle lines.
 * Coordinates are [lng, lat] throughout (GeoJSON / MapLibre convention).
 * Transit Row anchor: [-84.51451210887464, 39.13430985516541]
 *
 * Street coordinate sources: OpenStreetMap / Nominatim lookups.
 * Waypoints are approximate — update path arrays to improve accuracy.
 */

export const TRANSIT_ROW: [number, number] = [-84.51451210887464, 39.13430985516541];

export interface ShuttleStop {
  name:  string;
  coord: [number, number]; // [lng, lat]
}

export interface ShuttleRoute {
  id:         string;
  name:       string;
  color:      string;
  isNightride?: boolean;
  stops:      ShuttleStop[];
  path:       [number, number][];
}

// ─── Helper coordinates ────────────────────────────────────────────────────
// MLK Dr
const MLK_WOODSIDE: [number, number]    = [-84.5147, 39.1357];
const MLK_CAMPUS_GREEN: [number, number]= [-84.5137, 39.1357];
const MLK_JEFFERSON: [number, number]   = [-84.5107, 39.1354];
const MLK_SHORT_VINE: [number, number]  = [-84.5090, 39.1352];
const MLK_VINE: [number, number]        = [-84.5120, 39.1355];
const MLK_AHRENS: [number, number]      = [-84.5073, 39.1351];
const MLK_EDEN: [number, number]        = [-84.5056, 39.1350];
const MLK_CLIFTON: [number, number]     = [-84.5196, 39.1390];
const MLK_WEST: [number, number]        = [-84.5252, 39.1397];
const MLK_FAR_WEST: [number, number]    = [-84.5298, 39.1397];

// Key streets
const CLIFTON_LUDLOW: [number, number]  = [-84.5193, 39.1438];
const CLIFTON_STRAIGHT: [number, number]= [-84.5193, 39.1417];
const CLIFTON_CALHOUN: [number, number] = [-84.5197, 39.1277];
const CLIFTON_ATKINSON: [number, number]= [-84.5031, 39.1175];

const LUDLOW_EAST: [number, number]     = [-84.5157, 39.1500];
const LUDLOW_BROKLINE: [number, number] = [-84.5178, 39.1490];
const LUDLOW_WHITFIELD: [number, number]= [-84.5237, 39.1492];

const WHITFIELD_TERRACE: [number, number]= [-84.5237, 39.1447];
const WHITFIELD_LOWELL: [number, number] = [-84.5237, 39.1425];
const WHITFIELD_DIXMYTH: [number, number]= [-84.5237, 39.1395];

const BISHOP_RUTHER: [number, number]   = [-84.5148, 39.1472];
const BISHOP_MID: [number, number]      = [-84.5157, 39.1450];
const DIXMYTH_CLIFTON: [number, number] = [-84.5193, 39.1460];

const W_NIXON_CLIFTON: [number, number] = [-84.5193, 39.1425];
const W_NIXON_MID: [number, number]     = [-84.5120, 39.1425];
const W_NIXON_GOODMAN: [number, number] = [-84.5057, 39.1420];

const GOODMAN_VINE: [number, number]    = [-84.5120, 39.1375];
const GOODMAN_SHORT_VINE: [number, number] = [-84.5091, 39.1377];
const GOODMAN_EDEN: [number, number]    = [-84.5057, 39.1375];
const PANZECA_WAY: [number, number]     = [-84.5050, 39.1390];
const EDEN_MLK: [number, number]        = [-84.5056, 39.1350];

const JEFFERSON_CORRY: [number, number] = [-84.5107, 39.1292];
const JEFFERSON_MLK: [number, number]   = [-84.5107, 39.1354];
const CORRY_ST: [number, number]        = [-84.5101, 39.1292];
const E_MCMILLAN_HIGHLAND: [number, number] = [-84.5031, 39.1272];
const E_MCMILLAN_JEFF: [number, number]= [-84.5107, 39.1272];
const E_MCMILLAN_WHEELER: [number, number] = [-84.5192, 39.1272];
const HIGHLAND_STETSON: [number, number]= [-84.5031, 39.1320];
const HIGHLAND_TAFT: [number, number]   = [-84.5031, 39.1282];
const HIGHLAND_ATKINSON: [number, number]= [-84.5031, 39.1175];
const W_TAFT_HIGHLAND: [number, number] = [-84.4975, 39.1282];
const W_TAFT_VICTORY: [number, number]  = [-84.4828, 39.1282];
const VICTORY_PKWY: [number, number]    = [-84.4828, 39.1215];
const CYPRESS_HIGHLAND: [number, number]= [-84.5031, 39.1193];
const CYPRESS_VICTORY: [number, number] = [-84.4828, 39.1193];
const MAY_TAFT: [number, number]        = [-84.4905, 39.1290];
const MAY_CYPRESS: [number, number]     = [-84.4905, 39.1193];
const STETSON_HIGHLAND: [number, number]= [-84.5031, 39.1320];
const DANIELS_JEFFERSON: [number, number]= [-84.5107, 39.1367];

const DECKEBACH_MLK: [number, number]   = [-84.5294, 39.1358];
const DECKEBACH_MID: [number, number]   = [-84.5294, 39.1385];
const DECKEBACH_UPPER: [number, number] = [-84.5294, 39.1420];
const MARSHALL_MID: [number, number]    = [-84.5278, 39.1340];
const MARSHALL_UPPER: [number, number]  = [-84.5265, 39.1390];
const RIDDLE_WEST: [number, number]     = [-84.5306, 39.1370];
const RIDDLE_EAST: [number, number]     = [-84.5245, 39.1370];
const RIDDLE_UPPER: [number, number]    = [-84.5245, 39.1460];
const PROBASCO_MID: [number, number]    = [-84.5265, 39.1440];
const W_MCMICKEN_SOUTH: [number, number]= [-84.5270, 39.1340];
const W_MCMICKEN_MID: [number, number]  = [-84.5270, 39.1390];
const W_MCMICKEN_UPPER: [number, number]= [-84.5270, 39.1430];

const RAVINE_STRAIGHT: [number, number] = [-84.5074, 39.1417];
const RAVINE_ADA: [number, number]      = [-84.5074, 39.1310];
const RAVINE_WARNER: [number, number]   = [-84.5074, 39.1248];
const WARNER_CLIFTON: [number, number]  = [-84.5190, 39.1248];
const WARNER_RAVINE: [number, number]   = [-84.5074, 39.1248];
const WARNER_MID: [number, number]      = [-84.5130, 39.1248];
const STRAIGHT_CLIFTON: [number, number]= [-84.5193, 39.1417];
const STRAIGHT_RAVINE: [number, number] = [-84.5074, 39.1417];

const READING_RD_MLK: [number, number]  = [-84.4968, 39.1341];
const READING_RD_LINCOLN: [number, number] = [-84.4968, 39.1218];
const DIGITAL_FUTURES: [number, number] = [-84.4952, 39.1202];

const CCM_BLVD_W: [number, number]      = [-84.5210, 39.1232];
const CCM_BLVD_E: [number, number]      = [-84.5165, 39.1232];
const UNIVERSITY_CIR: [number, number]  = [-84.5210, 39.1258];
const CORRY_BLVD_W: [number, number]    = [-84.5210, 39.1245];
const CORRY_BLVD_MID: [number, number]  = [-84.5150, 39.1245];
const CORRY_BLVD_E: [number, number]    = [-84.5107, 39.1245];
const CALHOUN_CLIFTON: [number, number] = [-84.5197, 39.1275];
const COMMONS_WAY_N: [number, number]   = [-84.5040, 39.1380];
const COMMONS_WAY_S: [number, number]   = [-84.5040, 39.1295];
const SCIOTO_N: [number, number]        = [-84.5028, 39.1360];
const SCIOTO_S: [number, number]        = [-84.5028, 39.1310];

const CAMPUS_GREEN_E: [number, number]  = [-84.5137, 39.1343];

// ─── Routes ───────────────────────────────────────────────────────────────

export const SHUTTLE_ROUTES: ShuttleRoute[] = [
  // ── COM Connector ──────────────────────────────────────────────────────
  {
    id: 'com-connector',
    name: 'COM Connector',
    color: '#E00122',
    stops: [
      { name: 'Transit Row Hub',           coord: TRANSIT_ROW },
      { name: 'Vine St & MLK Dr',          coord: MLK_VINE },
      { name: 'Goodman Dr',                coord: GOODMAN_SHORT_VINE },
      { name: 'Panzeca Way',               coord: PANZECA_WAY },
      { name: 'Eden Ave & Goodman Dr',     coord: GOODMAN_EDEN },
    ],
    path: [
      TRANSIT_ROW,
      CAMPUS_GREEN_E,
      MLK_CAMPUS_GREEN,
      MLK_VINE,
      GOODMAN_VINE,
      GOODMAN_SHORT_VINE,
      [-84.5062, 39.1376],
      PANZECA_WAY,
      [-84.5035, 39.1400],
      [-84.5025, 39.1395],
      [-84.5035, 39.1382],
      GOODMAN_EDEN,
      EDEN_MLK,
      MLK_AHRENS,
      MLK_SHORT_VINE,
      MLK_VINE,
      MLK_CAMPUS_GREEN,
      MLK_WOODSIDE,
      [-84.5152, 39.1343],
      TRANSIT_ROW,
    ],
  },

  // ── CP Cincy Union ─────────────────────────────────────────────────────
  {
    id: 'cp-cincy-union',
    name: 'CP Cincy Union',
    color: '#1565C0',
    stops: [
      { name: 'Transit Row Hub',           coord: TRANSIT_ROW },
      { name: 'Reading Rd & Bathgate St',  coord: READING_RD_LINCOLN },
      { name: 'Digital Futures (18)',      coord: DIGITAL_FUTURES },
      { name: 'Digital Futures (19)',      coord: [-84.4968, 39.1202] },
    ],
    path: [
      TRANSIT_ROW,
      [-84.5050, 39.1343],
      [-84.4990, 39.1342],
      READING_RD_MLK,
      [-84.4968, 39.1268],
      READING_RD_LINCOLN,
      DIGITAL_FUTURES,
      [-84.4968, 39.1202],
      READING_RD_LINCOLN,
      [-84.4968, 39.1268],
      READING_RD_MLK,
      [-84.4990, 39.1342],
      [-84.5050, 39.1343],
      TRANSIT_ROW,
    ],
  },

  // ── East Route ─────────────────────────────────────────────────────────
  {
    id: 'east-route',
    name: 'East Route',
    color: '#2E7D32',
    stops: [
      { name: 'Transit Row Hub',           coord: TRANSIT_ROW },
      { name: 'E McMillan St & Wheeler',   coord: E_MCMILLAN_WHEELER },
      { name: 'E McMillan St',             coord: E_MCMILLAN_JEFF },
      { name: 'Clifton Ave & Atkinson',    coord: HIGHLAND_ATKINSON },
      { name: 'Highland Ave & W McMillan', coord: E_MCMILLAN_HIGHLAND },
      { name: 'William Howard Taft Rd',    coord: W_TAFT_HIGHLAND },
      { name: 'May St',                    coord: MAY_TAFT },
    ],
    path: [
      TRANSIT_ROW,
      [-84.5152, 39.1343],
      MLK_CLIFTON,
      CLIFTON_CALHOUN,
      E_MCMILLAN_WHEELER,
      E_MCMILLAN_JEFF,
      E_MCMILLAN_HIGHLAND,
      HIGHLAND_ATKINSON,
      MAY_CYPRESS,
      MAY_TAFT,
      W_TAFT_HIGHLAND,
      E_MCMILLAN_HIGHLAND,
      HIGHLAND_STETSON,
      JEFFERSON_MLK,
      TRANSIT_ROW,
    ],
  },

  // ── Housing Weekend Route ───────────────────────────────────────────────
  {
    id: 'housing-weekend',
    name: 'Housing Weekend Route',
    color: '#E65100',
    stops: [
      { name: 'Transit Row Hub',           coord: TRANSIT_ROW },
      { name: 'Ludlow Ave (east)',         coord: LUDLOW_EAST },
      { name: 'Ludlow Ave (west)',         coord: LUDLOW_WHITFIELD },
      { name: 'Whitfield Ave & Terrace',   coord: WHITFIELD_TERRACE },
      { name: 'Whitfield Ave & Lowell',    coord: WHITFIELD_LOWELL },
    ],
    path: [
      TRANSIT_ROW,
      [-84.5152, 39.1343],
      MLK_CLIFTON,
      CLIFTON_LUDLOW,
      [-84.5193, 39.1492],
      LUDLOW_EAST,
      [-84.5193, 39.1492],
      LUDLOW_BROKLINE,
      LUDLOW_WHITFIELD,
      WHITFIELD_TERRACE,
      WHITFIELD_LOWELL,
      WHITFIELD_DIXMYTH,
      [-84.5193, 39.1460],
      CLIFTON_LUDLOW,
      MLK_CLIFTON,
      [-84.5152, 39.1343],
      TRANSIT_ROW,
    ],
  },

  // ── Innovation District ────────────────────────────────────────────────
  {
    id: 'innovation-district',
    name: 'Innovation District',
    color: '#7B1FA2',
    stops: [
      { name: 'Transit Row Hub',           coord: TRANSIT_ROW },
      { name: 'Ludlow Ave & Brokline',     coord: LUDLOW_BROKLINE },
      { name: 'Jefferson Ave (upper)',     coord: [-84.5157, 39.1472] },
      { name: 'Jefferson Ave (mid)',       coord: [-84.5157, 39.1450] },
      { name: 'W Nixon St',               coord: W_NIXON_MID },
      { name: 'Goodman Dr & W Nixon',     coord: W_NIXON_GOODMAN },
      { name: 'Corry St',                 coord: CORRY_ST },
      { name: 'E McMillan & Highland',    coord: E_MCMILLAN_HIGHLAND },
      { name: 'William Howard Taft Rd',   coord: W_TAFT_HIGHLAND },
    ],
    path: [
      TRANSIT_ROW,
      [-84.5152, 39.1343],
      MLK_CLIFTON,
      CLIFTON_LUDLOW,
      [-84.5193, 39.1492],
      LUDLOW_BROKLINE,
      [-84.5157, 39.1472],
      BISHOP_MID,
      W_NIXON_MID,
      W_NIXON_GOODMAN,
      GOODMAN_EDEN,
      EDEN_MLK,
      MLK_SHORT_VINE,
      JEFFERSON_MLK,
      JEFFERSON_CORRY,
      CORRY_ST,
      E_MCMILLAN_HIGHLAND,
      W_TAFT_HIGHLAND,
      E_MCMILLAN_HIGHLAND,
      HIGHLAND_STETSON,
      JEFFERSON_MLK,
      TRANSIT_ROW,
    ],
  },

  // ── Northeast Route ───────────────────────────────────────────────────
  {
    id: 'northeast-route',
    name: 'Northeast Route',
    color: '#006064',
    stops: [
      { name: 'Transit Row Hub',           coord: TRANSIT_ROW },
      { name: 'W McMicken & Riddle Rd',    coord: W_MCMICKEN_UPPER },
      { name: 'Riddle Rd stop',            coord: RIDDLE_UPPER },
      { name: 'Riddle Rd (east)',          coord: RIDDLE_EAST },
      { name: 'Marshall Ave (mid)',        coord: MARSHALL_UPPER },
      { name: 'Marshall Ave (lower)',      coord: MARSHALL_MID },
      { name: 'W McMicken Ave',            coord: W_MCMICKEN_SOUTH },
    ],
    path: [
      TRANSIT_ROW,
      MLK_WOODSIDE,
      MLK_WEST,
      W_MCMICKEN_SOUTH,
      W_MCMICKEN_MID,
      W_MCMICKEN_UPPER,
      RIDDLE_WEST,
      RIDDLE_UPPER,
      RIDDLE_EAST,
      MLK_WEST,
      MARSHALL_MID,
      MARSHALL_UPPER,
      W_MCMICKEN_UPPER,
      RIDDLE_EAST,
      MLK_WEST,
      MLK_WOODSIDE,
      TRANSIT_ROW,
    ],
  },

  // ── North Route ───────────────────────────────────────────────────────
  {
    id: 'north-route',
    name: 'North Route',
    color: '#4E342E',
    stops: [
      { name: 'Transit Row Hub',           coord: TRANSIT_ROW },
      { name: 'Whitfield Ave (upper)',     coord: WHITFIELD_TERRACE },
      { name: 'Whitfield Ave & Lowell',    coord: WHITFIELD_LOWELL },
      { name: 'Ludlow Ave (east)',         coord: LUDLOW_EAST },
      { name: 'Ludlow Ave (west)',         coord: LUDLOW_BROKLINE },
      { name: 'Bishop St',                 coord: BISHOP_MID },
      { name: 'Ruther Ave area',           coord: BISHOP_RUTHER },
      { name: 'W Nixon St',               coord: W_NIXON_MID },
      { name: 'Goodman Dr',               coord: GOODMAN_EDEN },
    ],
    path: [
      TRANSIT_ROW,
      [-84.5152, 39.1343],
      MLK_CLIFTON,
      CLIFTON_LUDLOW,
      [-84.5193, 39.1492],
      LUDLOW_BROKLINE,
      LUDLOW_WHITFIELD,
      WHITFIELD_TERRACE,
      WHITFIELD_LOWELL,
      WHITFIELD_DIXMYTH,
      DIXMYTH_CLIFTON,
      [-84.5193, 39.1492],
      LUDLOW_EAST,
      BISHOP_RUTHER,
      BISHOP_MID,
      W_NIXON_MID,
      GOODMAN_EDEN,
      EDEN_MLK,
      MLK_SHORT_VINE,
      JEFFERSON_MLK,
      MLK_WOODSIDE,
      TRANSIT_ROW,
    ],
  },

  // ── North Nightride ───────────────────────────────────────────────────
  {
    id: 'north-nightride',
    name: 'North Nightride',
    color: '#546E7A',
    isNightride: true,
    stops: [
      { name: 'Transit Row Hub',           coord: TRANSIT_ROW },
      { name: 'Ludlow Ave (east)',         coord: LUDLOW_EAST },
      { name: 'Ludlow Ave (west)',         coord: LUDLOW_WHITFIELD },
      { name: 'Whitfield Ave & Terrace',   coord: WHITFIELD_TERRACE },
      { name: 'Whitfield Ave & Lowell',    coord: WHITFIELD_LOWELL },
      { name: 'Whitfield Ave & Dixmyth',   coord: WHITFIELD_DIXMYTH },
    ],
    path: [
      TRANSIT_ROW,
      [-84.5152, 39.1343],
      MLK_CLIFTON,
      CLIFTON_LUDLOW,
      [-84.5193, 39.1492],
      LUDLOW_EAST,
      [-84.5193, 39.1492],
      LUDLOW_WHITFIELD,
      WHITFIELD_TERRACE,
      WHITFIELD_LOWELL,
      WHITFIELD_DIXMYTH,
      DIXMYTH_CLIFTON,
      CLIFTON_LUDLOW,
      MLK_CLIFTON,
      [-84.5152, 39.1343],
      TRANSIT_ROW,
    ],
  },

  // ── Northwest Route ───────────────────────────────────────────────────
  {
    id: 'northwest-route',
    name: 'Northwest Route',
    color: '#880E4F',
    stops: [
      { name: 'Transit Row Hub',           coord: TRANSIT_ROW },
      { name: 'Deckebach Ave (upper)',     coord: DECKEBACH_UPPER },
      { name: 'Deckebach Ave (mid)',       coord: DECKEBACH_MID },
      { name: 'Marshall Ave (upper)',      coord: MARSHALL_UPPER },
      { name: 'Straight St',              coord: STRAIGHT_CLIFTON },
      { name: 'Ravine St & Ada St',       coord: RAVINE_ADA },
      { name: 'Warner St (mid)',           coord: WARNER_MID },
      { name: 'Clifton Ave & Atkinson',   coord: [-84.5031, 39.1248] },
      { name: 'Clifton Ave & W McMillan', coord: [-84.5031, 39.1295] },
    ],
    path: [
      TRANSIT_ROW,
      MLK_WOODSIDE,
      MLK_WEST,
      MLK_FAR_WEST,
      RIDDLE_WEST,
      RIDDLE_EAST,
      DECKEBACH_UPPER,
      DECKEBACH_MID,
      DECKEBACH_MLK,
      MLK_FAR_WEST,
      MARSHALL_MID,
      MARSHALL_UPPER,
      PROBASCO_MID,
      STRAIGHT_CLIFTON,
      CLIFTON_LUDLOW,
      CLIFTON_STRAIGHT,
      STRAIGHT_RAVINE,
      RAVINE_ADA,
      RAVINE_WARNER,
      WARNER_MID,
      WARNER_CLIFTON,
      CLIFTON_CALHOUN,
      MLK_CLIFTON,
      MLK_WOODSIDE,
      TRANSIT_ROW,
    ],
  },

  // ── Southwest ─────────────────────────────────────────────────────────
  {
    id: 'southwest',
    name: 'Southwest Route',
    color: '#F9A825',
    stops: [
      { name: 'Transit Row Hub',           coord: TRANSIT_ROW },
      { name: 'MLK Dr stop',              coord: MLK_WOODSIDE },
      { name: 'Clifton Ave stop',          coord: CLIFTON_STRAIGHT },
      { name: 'University Cir',           coord: UNIVERSITY_CIR },
      { name: 'CCM Blvd',                 coord: CCM_BLVD_W },
      { name: 'Corry Blvd (mid)',         coord: CORRY_BLVD_MID },
      { name: 'Corry Blvd (east)',        coord: CORRY_BLVD_E },
      { name: 'Calhoun St & Jefferson',   coord: CALHOUN_CLIFTON },
      { name: 'Commons Way (north)',      coord: COMMONS_WAY_N },
      { name: 'Scioto Ln',               coord: SCIOTO_N },
    ],
    path: [
      TRANSIT_ROW,
      [-84.5152, 39.1343],
      MLK_WOODSIDE,
      MLK_CLIFTON,
      CLIFTON_STRAIGHT,
      UNIVERSITY_CIR,
      CCM_BLVD_W,
      CORRY_BLVD_W,
      CORRY_BLVD_MID,
      CORRY_BLVD_E,
      CORRY_ST,
      CALHOUN_CLIFTON,
      [-84.5050, 39.1275],
      COMMONS_WAY_S,
      SCIOTO_S,
      SCIOTO_N,
      COMMONS_WAY_N,
      [-84.5040, 39.1343],
      MLK_JEFFERSON,
      MLK_WOODSIDE,
      [-84.5152, 39.1343],
      TRANSIT_ROW,
    ],
  },

  // ── Southwest Nightride ────────────────────────────────────────────────
  {
    id: 'southwest-nightride',
    name: 'Southwest Nightride',
    color: '#1A237E',
    isNightride: true,
    stops: [
      { name: 'Transit Row Hub',           coord: TRANSIT_ROW },
      { name: 'Clifton Ave stop',          coord: MLK_CLIFTON },
      { name: 'University Cir',           coord: UNIVERSITY_CIR },
      { name: 'Corry Blvd',              coord: CORRY_BLVD_E },
      { name: 'Calhoun St',              coord: CALHOUN_CLIFTON },
    ],
    path: [
      TRANSIT_ROW,
      [-84.5152, 39.1343],
      MLK_CLIFTON,
      CLIFTON_STRAIGHT,
      UNIVERSITY_CIR,
      CCM_BLVD_W,
      CORRY_BLVD_W,
      CORRY_BLVD_E,
      CALHOUN_CLIFTON,
      CLIFTON_CALHOUN,
      MLK_CLIFTON,
      [-84.5152, 39.1343],
      TRANSIT_ROW,
    ],
  },

  // ── Uptown Express ─────────────────────────────────────────────────────
  {
    id: 'uptown-express',
    name: 'Uptown Express',
    color: '#00695C',
    stops: [
      { name: 'Transit Row Hub',           coord: TRANSIT_ROW },
      { name: 'Woodside Dr / MLK Dr',      coord: MLK_WOODSIDE },
      { name: 'MLK Dr stop',              coord: [-84.5252, 39.1340] },
      { name: 'Stetson St & Highland',     coord: STETSON_HIGHLAND },
      { name: 'E University & Highland',   coord: HIGHLAND_STETSON },
      { name: 'Corry St & Euclid',        coord: CORRY_ST },
      { name: 'E McMillan St',            coord: E_MCMILLAN_JEFF },
      { name: 'E McMillan & Wheeler',     coord: E_MCMILLAN_WHEELER },
      { name: 'William Howard Taft Rd',   coord: W_TAFT_HIGHLAND },
      { name: 'Victory Pkwy',             coord: W_TAFT_VICTORY },
      { name: 'Cypress St',              coord: CYPRESS_VICTORY },
    ],
    path: [
      TRANSIT_ROW,
      MLK_WOODSIDE,
      MLK_CLIFTON,
      MLK_WEST,
      [-84.5252, 39.1340],
      [-84.5196, 39.1340],
      JEFFERSON_MLK,
      DANIELS_JEFFERSON,
      [-84.5031, 39.1367],
      STETSON_HIGHLAND,
      CORRY_ST,
      E_MCMILLAN_JEFF,
      E_MCMILLAN_WHEELER,
      CLIFTON_CALHOUN,
      CALHOUN_CLIFTON,
      E_MCMILLAN_JEFF,
      W_TAFT_HIGHLAND,
      W_TAFT_VICTORY,
      VICTORY_PKWY,
      CYPRESS_VICTORY,
      CYPRESS_HIGHLAND,
      HIGHLAND_ATKINSON,
      HIGHLAND_STETSON,
      JEFFERSON_MLK,
      TRANSIT_ROW,
    ],
  },
];
