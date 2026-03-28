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
import { initUI, showToast, selectBuilding } from './ui.js';

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // 1. Init map
  const map = initMap('map', _onBuildingMarkerClick);

  // 2. Init UI with handlers
  initUI({
    onNavigate: _onNavigate,
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

/** Called when Navigate button is clicked */
async function _onNavigate(req) {
  try {
    await planRoute(req);
    // Highlight both buildings on the map
    highlightBuilding(null);
    collapsePlannerOnMobile();
  } catch (err) {
    // Error is already surfaced via navvy:route:error event → toast
    console.error('[Navvy] Route planning failed:', err);
  }
}

const legendToggle = document.getElementById('legendToggle');
const mapLegend = document.getElementById('mapLegend');

legendToggle.addEventListener('click', () => {
  const isCollapsed = mapLegend.classList.contains('map-legend--collapsed');

  if (isCollapsed) {
    mapLegend.classList.remove('map-legend--collapsed');
    legendToggle.setAttribute('aria-expanded', 'true');
  } else {
    mapLegend.classList.add('map-legend--collapsed');
    legendToggle.setAttribute('aria-expanded', 'false');
  }
});

const sidebar = document.querySelector('.sidebar');
const navigateBtn = document.getElementById('navigateBtn');
const plannerToggleBtn = document.getElementById('plannerToggleBtn');

function collapsePlannerOnMobile() {
  if (window.innerWidth <= 900) {
    sidebar.classList.add('sidebar--collapsed');
    plannerToggleBtn.hidden = false;
    plannerToggleBtn.setAttribute('aria-expanded', 'false');
  }
}

function expandPlanner() {
  sidebar.classList.remove('sidebar--collapsed');
  plannerToggleBtn.setAttribute('aria-expanded', 'true');
}

plannerToggleBtn.addEventListener('click', expandPlanner);