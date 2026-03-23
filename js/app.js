/**
 * app.js
 * Application bootstrap.
 * Wires together map, floorplan, router, and UI modules.
 * This is the single entry point — all other modules are imported here.
 */

'use strict';

import { BUILDINGS } from './config.js';
import { initMap, highlightBuilding } from './map.js';
import { renderFloorplan, clearAllFloorplans, prefetchFloorplans } from './floorplan.js';
import { planRoute, clearRoute } from './router.js';
import { initUI, showToast, setActiveFloorTab, selectBuilding } from './ui.js';

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // 1. Init map
  const map = initMap('map', _onBuildingMarkerClick);

  // 2. Init UI with handlers
  initUI({
    onNavigate: _onNavigate,
    onPreview:  _onPreview,
  });

  // 3. Load default view — Baldwin floor 4
  _onPreview('baldwin', 4);

  // 4. Prefetch remaining Baldwin floors silently in background
  prefetchFloorplans('baldwin', [5, 6, 7, 8, 9]);
});

// ─── HANDLERS ────────────────────────────────────────────────────────────────

/** Called when a building marker is clicked on the map */
function _onBuildingMarkerClick(buildingKey) {
  const startSel = document.getElementById('startBuilding');
  // Fill start first, then end
  if (!startSel?.value) {
    selectBuilding('start', buildingKey);
    showToast(`${BUILDINGS[buildingKey]?.name} set as starting point.`, 'info');
  } else {
    selectBuilding('end', buildingKey);
    showToast(`${BUILDINGS[buildingKey]?.name} set as destination.`, 'info');
  }
  highlightBuilding(buildingKey);
}

/** Called when a floor tab is clicked */
async function _onPreview(building, floor) {
  clearRoute();
  clearAllFloorplans();
  setActiveFloorTab(floor);
  await renderFloorplan(building, floor, 'default', true);
}

/** Called when Navigate button is clicked */
async function _onNavigate(req) {
  try {
    await planRoute(req);
    // Highlight both buildings on the map
    highlightBuilding(null);
  } catch (err) {
    // Error is already surfaced via navvy:route:error event → toast
    console.error('[NavVy] Route planning failed:', err);
  }
}
