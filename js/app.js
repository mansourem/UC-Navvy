/**
 * app.js
 * Application bootstrap.
 * Wires together map, floorplan, router, and UI modules.
 * This is the single entry point — all other modules are imported here.
 */

'use strict';

import { BUILDINGS } from './config.js';
import { initMap, highlightBuilding } from './map.js';
import { planRoute } from './router.js';
// TODO: re-enable setActiveFloorTab once floor tab UI is wired up
import { initUI, showToast, /* setActiveFloorTab, */ selectBuilding } from './ui.js';

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // 1. Init map
  const map = initMap('map', _onBuildingMarkerClick);

  // 2. Init UI with handlers
  initUI({
    onNavigate: _onNavigate,
    // TODO: re-enable onFloorTab once floor tab UI is wired up
    // onFloorTab: _onFloorTab,
  });
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

// TODO: re-enable once floor tab UI is wired up
// function _onFloorTab(_building, floor) {
//   setActiveFloorTab(floor);
// }

/** Called when Navigate button is clicked */
async function _onNavigate(req) {
  try {
    await planRoute(req);
    // Highlight both buildings on the map
    highlightBuilding(null);
  } catch (err) {
    // Error is already surfaced via navvy:route:error event → toast
    console.error('[Navvy] Route planning failed:', err);
  }
}
