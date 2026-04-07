/**
 * config.ts — TypeScript port of js/config.js.
 * All coordinates are [lng, lat] (GeoJSON / MapLibre order).
 */

export const API = {
  BASE_URL:  'https://uc-navvy-api.onrender.com/api/floorplan',
  NODES_URL: 'https://uc-navvy-api.onrender.com/api/nodes',
  EDGES_URL: 'https://uc-navvy-api.onrender.com/api/edges',
  floorplanUrl(buildingKey: string, floor: number) {
    return `${this.BASE_URL}/${buildingKey}/${floor}`;
  },
};

export const MAP_CONFIG = {
  center:   [-84.51574775941579, 39.13194517045321] as [number, number],  // [lng, lat]
  zoom:     16,
  minZoom:  14,
  maxZoom:  22,
  // Full MapLibre GL style (replaces Leaflet raster tile URL)
  styleUrl: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
};

export const STYLES = {
  route: {
    standard: { color: '#4A9EFF', width: 3.5, opacity: 0.9 },
    ada:      { color: '#FFB300', width: 3.5, opacity: 0.9 },
  },
};

export const FEATURES = {
  INDOOR_ROUTING:    true,
  FLOORPLAN_DISPLAY: false,
  BUILDING_POLYGONS: false,
};

export const APP = {
  TOAST_DURATION:    4500,
  SIDEBAR_BREAKPOINT: 768,
  FIT_PADDING:       60,
};

export interface Building {
  name:                    string;
  /** [lng, lat] */
  center:                  [number, number];
  floors:                  number[];
  elevatorNodes:           number[] | null;
  entranceNodes:           number[];
  accessibleEntranceNodes: number[];
  apiKey:                  string;
}

export const BUILDINGS: Record<string, Building> = {
  alms:        { name: 'Alms Building',                               center: [-84.51947795239127, 39.13394397955207],    floors: [5,6,7,8],               elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'alms' },
  armory:      { name: 'Armory Fieldhouse',                           center: [-84.51400670992946, 39.13188560825981],    floors: [2,3,4,5,6],             elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'armory' },
  aronoff:     { name: 'Aronoff Center',                              center: [-84.51817996210889, 39.13433426000876],    floors: [2,3,4,5,6],             elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'aronoff' },
  artsci:      { name: 'Arts & Sciences Hall',                        center: [-84.51914563201682, 39.131863468061795],   floors: [0,1,2,3,4,5,6],         elevatorNodes: [], entranceNodes: [60,470,479,480,483,486,487,488,489,490], accessibleEntranceNodes: [479,480,487,488,489,490], apiKey: 'artsci' },
  baldwin:     { name: 'Baldwin Hall',                                center: [-84.51673800615372, 39.13284623685328],    floors: [4,5,6,7,8,9],           elevatorNodes: [], entranceNodes: [17,307,379,10005], accessibleEntranceNodes: [379,10005], apiKey: 'baldwin' },
  blegen:      { name: 'Blegen Library',                              center: [-84.51934098443131, 39.12958090288538],    floors: [1,2,3,4,5,6,7,8,9],     elevatorNodes: [], entranceNodes: [906,907], accessibleEntranceNodes: [906,907], apiKey: 'blegen' },
  baseball:    { name: 'UC Baseball Field',                           center: [-84.51370743009456, 39.13016559114516],    floors: [0],                     elevatorNodes: null, entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'baseball' },
  braunstein:  { name: 'Braunstein Hall',                             center: [-84.51860949637083, 39.13296254880689],    floors: [1,2,3,4,5],             elevatorNodes: [], entranceNodes: [119,121,122,123,148,385], accessibleEntranceNodes: [119,122,123,148], apiKey: 'braunstein' },
  calhoun:     { name: 'Calhoun Hall',                                center: [-84.5170062084613,  39.12863856749061],    floors: [1],                     elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'calhoun' },
  clftct:      { name: 'Clifton Court Hall',                          center: [-84.51968485850163, 39.13316427138764],    floors: [1,2,3,4,5],             elevatorNodes: [], entranceNodes: [45,48,156], accessibleEntranceNodes: [45,48,156], apiKey: 'clftct' },
  crosley:     { name: 'Crosley Tower',                               center: [-84.51671492419757, 39.13455654727545],    floors: [0],                     elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'crosley' },
  daap:        { name: 'Design, Architecture, Art and Planning',      center: [-84.51877458005757, 39.13427502634562],    floors: [4,5,6,7,8],             elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'daap' },
  daniels:     { name: 'Daniels Hall',                                center: [-84.5117758446023,  39.13140851835192],    floors: [1],                     elevatorNodes: [], entranceNodes: [1082], accessibleEntranceNodes: [1082], apiKey: 'daniels' },
  dabney:      { name: 'Dabney Hall',                                 center: [-84.51311555671336, 39.131668135819666],   floors: [1],                     elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'dabney' },
  dieterle:    { name: 'Dieterle Vocal Arts Center',                  center: [-84.51691097865304, 39.13021498359652],    floors: [1,2,3,4],               elevatorNodes: [], entranceNodes: [990,991,992,997,998], accessibleEntranceNodes: [990], apiKey: 'dieterle' },
  dyers:       { name: 'Dyer Hall',                                   center: [-84.51863197602383, 39.13042132369668],    floors: [1,2,3,4,5,6],           elevatorNodes: [], entranceNodes: [877,878,879], accessibleEntranceNodes: [877], apiKey: 'dyers' },
  edwards:     { name: 'Edwards Center',                              center: [-84.51218652864813, 39.12906331848919],    floors: [1],                     elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'edwards' },
  emery:       { name: 'Mary Emery Hall',                             center: [-84.51789815695886, 39.1303875174853],     floors: [2,3,4,5],               elevatorNodes: [], entranceNodes: [912,913,933,962], accessibleEntranceNodes: [912,913,933,962], apiKey: 'emery' },
  frenchw:     { name: 'French Hall',                                 center: [-84.51305821376505, 39.13241250641286],    floors: [1,2,3,4,5,6,7],         elevatorNodes: [], entranceNodes: [756,762,806], accessibleEntranceNodes: [756,762,806], apiKey: 'french-w' },
  geophys:     { name: 'Geology-Physics Building',                    center: [-84.5184797230354,  39.13338843078097],    floors: [1,2,3,4,5,6],           elevatorNodes: [], entranceNodes: [147], accessibleEntranceNodes: [147], apiKey: 'geophys' },
  langsam:     { name: 'Langsam Library',                             center: [-84.51570566739038, 39.13418909028243],    floors: [4,5,6],                 elevatorNodes: [], entranceNodes: [334], accessibleEntranceNodes: [334], apiKey: 'langsam' },
  law:         { name: 'College of Law Building',                     center: [-84.5136542262,     39.13476248008203],    floors: [0,1,2,3,4,5,6],         elevatorNodes: [], entranceNodes: [807,808,809], accessibleEntranceNodes: [807,808,809], apiKey: 'law' },
  lindhall:    { name: 'Lindner Hall',                                center: [-84.51447679629442, 39.13379067791746],    floors: [0,1,2,3,4],             elevatorNodes: [], entranceNodes: [621,622,623,624], accessibleEntranceNodes: [621,623], apiKey: 'lindhall' },
  lndnrctr:    { name: 'Lindner Center',                              center: [-84.51503579504217, 39.1311145018997],     floors: [1,2,3,4,5,6,7,8],       elevatorNodes: [], entranceNodes: [577,578,579], accessibleEntranceNodes: [577,578,579], apiKey: 'lndnrctr' },
  mantei:      { name: 'Mantei Center',                               center: [-84.51554850896405, 39.133262214190836],   floors: [3,4,5,6,7,8],           elevatorNodes: [11003,11054,11100,11150,11200,11250], entranceNodes: [333,370,594,11000,11050], accessibleEntranceNodes: [333,370,594,11000,11050], apiKey: 'mantei' },
  marketpt:    { name: 'MarketPointe',                                center: [-84.51715032209717, 39.128920809709655],   floors: [1],                     elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'marketpt' },
  morgens:     { name: 'Morgens Hall',                                center: [-84.51202086063552, 39.13492279120541],    floors: [1],                     elevatorNodes: [], entranceNodes: [1056], accessibleEntranceNodes: [1056], apiKey: 'morgens' },
  mspencer:    { name: 'Marian Spencer Hall',                         center: [-84.51219194777279, 39.133712123042955],   floors: [1],                     elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'mspencer' },
  memorial:    { name: 'Memorial Hall',                               center: [-84.51729620021955, 39.12953145608253],    floors: [1],                     elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'memorial' },
  nippert:     { name: 'Nippert Stadium',                             center: [-84.51621683066327, 39.131152940916934],   floors: [1,2,3,4,5],             elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'nippert' },
  oldchem:     { name: 'Old Chemistry Building',                      center: [-84.51759931676864, 39.1332622925695],     floors: [4,5,6,7,8],             elevatorNodes: [], entranceNodes: [35,128,129,380,383], accessibleEntranceNodes: [35,128,129,383], apiKey: 'oldchem' },
  reccenter:   { name: 'Campus Recreation Center',                    center: [-84.51500594612882, 39.13234266520985],    floors: [0,1,2,3,4,5,6],         elevatorNodes: [], entranceNodes: [497,498,499,521,596,599,604], accessibleEntranceNodes: [497,498,499,521,596,599], apiKey: 'reccenter' },
  rhodes:      { name: 'Rhodes Hall',                                 center: [-84.5162434522422,  39.132945638406966],   floors: [3,4,5,6,7,8,9],         elevatorNodes: [10050,10055,10080,10100,10120,10140,10160], entranceNodes: [231,310,328,398,10067,10068,10070,10071,10074,10075,10089,10093,10109,10110,10111,10129], accessibleEntranceNodes: [310,328,10070,10071,10075,10111,10129], apiKey: 'rhodes' },
  rievschl:    { name: 'Rieveschl Hall',                              center: [-84.51693465876146, 39.1339700017044],     floors: [4,5,6,7,8,9],           elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'rievschl' },
  schneidr:    { name: 'Schneider Hall',                              center: [-84.51219152169142, 39.13229575815134],    floors: [1],                     elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'schneidr' },
  scioto:      { name: 'Scioto Hall',                                 center: [-84.51200272222876, 39.134294086602466],   floors: [1],                     elevatorNodes: [], entranceNodes: [1055], accessibleEntranceNodes: [1055], apiKey: 'scioto' },
  shoe:        { name: 'Shoemaker Multipurpose Center',               center: [-84.51406348593618, 39.131213349497244],   floors: [1,2,3,4,5,6,7],                 elevatorNodes: [10509,10558,10573,10574,10582,10586,10587,10600,10601,10602,10603,10604,10654,10655,10656,10657,10658,10692,10693], entranceNodes: [544,545,546,547,558,559,560], accessibleEntranceNodes: [544,545,546,547,558], apiKey: 'shoe' },
  siddall:     { name: 'Siddall Hall',                                center: [-84.51768426507854, 39.129002143014304],   floors: [1],                     elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'siddall' },
  steger:      { name: 'Steger Student Life Center',                  center: [-84.5164941231769,  39.13231313776353],    floors: [3,4,5,6,7,8],           elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'steger' },
  swift:       { name: 'Swift Hall',                                  center: [-84.51741254563956, 39.13245979765452],    floors: [5,6,7,8],               elevatorNodes: [], entranceNodes: [34,236,237,244,245,293,299], accessibleEntranceNodes: [245,293,299], apiKey: 'swift' },
  tennis:      { name: 'Tennis Court',                                center: [-84.51568358381813, 39.12994625124256],    floors: [0],                     elevatorNodes: null, entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'tennis' },
  tuc:         { name: 'Tangeman University Center',                  center: [-84.5173820428954,  39.13178769533238],    floors: [1,2,3,4,5],             elevatorNodes: [], entranceNodes: [261,266,270,271,280,391], accessibleEntranceNodes: [261,266,270,271,391], apiKey: 'tuc' },
  turner:      { name: 'Turner Hall',                                 center: [-84.51158195616489, 39.13253556660143],    floors: [1],                     elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'turner' },
  univpav:     { name: 'University Pavilion',                         center: [-84.51856879595664, 39.13099149142258],    floors: [0,1,2,3,4,5,6],         elevatorNodes: [], entranceNodes: [277,278,279,390], accessibleEntranceNodes: [277,278,279,390], apiKey: 'univpav' },
  vanwormer:   { name: 'Van Wormer Hall',                             center: [-84.5192527740965,  39.130743070345005],   floors: [1,2,3,4],               elevatorNodes: [], entranceNodes: [893,894], accessibleEntranceNodes: [894], apiKey: 'vanwormer' },
  westcharlton:{ name: '60 West Charlton',                            center: [-84.51252815125815, 39.1309949470631],     floors: [0,1,2,3],               elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: '60Wcharles' },
  wolfson:     { name: 'Wolfson Center',                              center: [-84.5181774462442,  39.1341524710393],     floors: [4,5,6],                 elevatorNodes: [], entranceNodes: [], accessibleEntranceNodes: [], apiKey: 'wolfson' },
  zimmer:      { name: 'Zimmer Hall',                                 center: [-84.51684330107138, 39.133498145463875],   floors: [3,4,5],                 elevatorNodes: [], entranceNodes: [39,326,327,491,492,493,11500,11550,11561,11562,11563,11600,11607], accessibleEntranceNodes: [326,327,491,11500,11550,11563], apiKey: 'zimmer' },
  teachers:    { name: 'Teachers Hall',                               center: [-84.51932480761624,39.13014487678015],     floors: [1,2,3,4,5,6,7],          elevatorNodes: [], entranceNodes: [829,854,858,859], accessibleEntranceNodes: [829], apiKey: 'teachers'},
};
