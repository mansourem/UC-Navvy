/**
 * UC Navvy - Database API Service
 * Connects to Supabase via the render backend: https://uc-navvy-api.onrender.com
 * All navigation data (nodes, edges, floorplans) will eventually come from the database.
 * Falls back to local JSON files if the API is unavailable.
 */

const API_BASE = 'https://uc-navvy-api.onrender.com';

// Cache to avoid redundant API calls
const _cache = {};

async function apiFetch(endpoint, fallbackUrl = null) {
  const cacheKey = endpoint;
  if (_cache[cacheKey]) return _cache[cacheKey];

  try {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    _cache[cacheKey] = data;
    return data;
  } catch (err) {
    console.warn(`API unavailable (${endpoint}), falling back to local:`, err.message);
    if (fallbackUrl) {
      try {
        const res = await fetch(fallbackUrl);
        const data = await res.json();
        _cache[cacheKey] = data;
        return data;
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr);
        return null;
      }
    }
    return null;
  }
}

// ─── Health Check ────────────────────────────────────────────────────────────
export async function checkApiHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Nodes ───────────────────────────────────────────────────────────────────
/**
 * Fetch all navigation nodes.
 * DB schema: { node_id, latitude, longitude, location, floor, building_id,
 *              entrance, elevator, accessible, indoor }
 */
export async function fetchNodes() {
  const data = await apiFetch('/api/nodes', null);
  if (!data) return [];
  // Normalize: DB returns array directly, local JSON wraps in { nodes: [] }
  return Array.isArray(data) ? data : (data.nodes || []);
}

// ─── Edges ───────────────────────────────────────────────────────────────────
/**
 * Fetch all navigation edges/paths.
 * DB schema: { edge_id, from_node, to_node, accessible, indoor, weight }
 * Local format: { paths: [{ node, connections: { nodeId: true } }] }
 */
export async function fetchEdges() {
  const data = await apiFetch('/api/edges', null);
  if (!data) return { paths: [] };
  // If DB returns flat edge list, convert to adjacency format
  if (Array.isArray(data)) {
    return convertEdgeListToAdjacency(data);
  }
  return data;
}

function convertEdgeListToAdjacency(edgeList) {
  const pathMap = {};
  edgeList.forEach(edge => {
    if (!pathMap[edge.from_node]) pathMap[edge.from_node] = { node: edge.from_node, connections: {}, accessible: {} };
    if (!pathMap[edge.to_node]) pathMap[edge.to_node] = { node: edge.to_node, connections: {}, accessible: {} };
    pathMap[edge.from_node].connections[edge.to_node] = true;
    pathMap[edge.from_node].accessible[edge.to_node] = edge.accessible !== false;
    pathMap[edge.to_node].connections[edge.from_node] = true;
    pathMap[edge.to_node].accessible[edge.from_node] = edge.accessible !== false;
  });
  return { paths: Object.values(pathMap) };
}

// ─── Buildings ────────────────────────────────────────────────────────────────
/**
 * Fetch all buildings with metadata.
 * DB schema: { building_id, name, coordinates, entrance_nodes, floors }
 */
export async function fetchBuildings() {
  const data = await apiFetch('/api/buildings', 'buildings.json');
  if (!data) return [];
  return Array.isArray(data) ? data : [];
}

// ─── Floorplans ───────────────────────────────────────────────────────────────
/**
 * Fetch floorplan GeoJSON for a specific building and floor.
 * DB stores each floor as a GeoJSON FeatureCollection.
 * Layer naming convention: "Layer_XX" where XX is the floor number (e.g., "06" = floor 6)
 *
 * @param {string} buildingId
 * @param {string|number} floor - floor number or "outside"
 */
export async function fetchFloorplan(buildingId, floor) {
  if (!buildingId || floor === 'outside') return null;
  const floorStr = String(floor).padStart(2, '0');
  return await apiFetch(`/api/floorplans/${buildingId}/${floorStr}`);
}

/**
 * Fetch all available floors for a building.
 * Returns array of floor numbers/identifiers.
 */
export async function fetchBuildingFloors(buildingId) {
  if (!buildingId) return [];
  const data = await apiFetch(`/api/buildings/${buildingId}/floors`);
  return data || [];
}

// ─── Accessible Routes ────────────────────────────────────────────────────────
/**
 * Fetch accessibility metadata for edges/nodes.
 * Used to filter accessible-only routes.
 */
export async function fetchAccessibilityData() {
  return await apiFetch('/api/accessibility', null);
}

// ─── Hazards ──────────────────────────────────────────────────────────────────
export async function fetchActiveHazards() {
  return await apiFetch('/api/hazards/active', null) || [];
}

export async function reportHazard(hazardData) {
  try {
    const res = await fetch(`${API_BASE}/api/hazards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hazardData)
    });
    return res.ok ? await res.json() : null;
  } catch (err) {
    console.error('Failed to report hazard:', err);
    return null;
  }
}
