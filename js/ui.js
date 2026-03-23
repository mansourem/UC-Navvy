/**
 * ui.js
 * All DOM interactions: sidebar selects, floor tabs, ADA toggle,
 * loading overlay, toast notifications, route summary panel.
 *
 * This module owns the sidebar DOM but has zero knowledge of
 * Leaflet or routing logic — it only reads config and emits/listens
 * to custom events.
 */

'use strict';

import { BUILDINGS, APP } from './config.js';

// ─── INTERNAL STATE ───────────────────────────────────────────────────────────

let _adaMode = false;
let _toastTimer = null;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Wire up all sidebar UI elements.
 * @param {Object} handlers
 * @param {Function} handlers.onNavigate   - Called with RouteRequest when Navigate is clicked
 * @param {Function} handlers.onPreview    - Called with (building, floor) when a floor tab is clicked
 * @param {Function} handlers.onBuildingMapClick - Passed to map.js as onBuildingClick
 */
export function initUI({ onNavigate, onPreview }) {
  _populateBuildingSelects();
  _bindSelectEvents();
  _bindADAToggle();
  _bindNavigateButton(onNavigate);
  _bindFloorTabs(onPreview);
  _listenToRouteEvents();
}

/** @returns {boolean} Current ADA mode state */
export function isAdaMode() {
  return _adaMode;
}

/**
 * Programmatically select a building in the START or END select.
 * @param {'start'|'end'} which
 * @param {string} buildingKey
 */
export function selectBuilding(which, buildingKey) {
  const sel = document.getElementById(`${which}Building`);
  if (!sel) return;
  // Only set if it's a valid option
  const opt = sel.querySelector(`option[value="${buildingKey}"]`);
  if (opt) {
    sel.value = buildingKey;
    _updateFloorSelect(which);
    _checkNavigateReady();
  }
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'info'|'error'|'success'} [type='info']
 */
export function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  clearTimeout(_toastTimer);
  toast.textContent = message;
  toast.className = `toast toast--${type} toast--visible`;
  _toastTimer = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, APP.TOAST_DURATION);
}

/**
 * Show or hide the full-screen loading overlay.
 * @param {boolean} visible
 * @param {string} [message]
 */
export function setLoading(visible, message = 'Loading…') {
  const overlay = document.getElementById('loadingOverlay');
  const label = document.getElementById('loadingLabel');
  if (!overlay) return;
  if (label) label.textContent = message;
  overlay.classList.toggle('loading-overlay--visible', visible);
}

/**
 * Update the map floor badge.
 * @param {string|null} text - null to hide
 */
export function setFloorBadge(text) {
  const badge = document.getElementById('floorBadge');
  const badgeText = document.getElementById('floorBadgeText');
  if (!badge) return;
  if (text) {
    badgeText.textContent = text;
    badge.classList.add('floor-badge--visible');
  } else {
    badge.classList.remove('floor-badge--visible');
  }
}

/**
 * Render the route step summary in the sidebar.
 * @param {import('./router.js').RouteStep[]} steps
 */
export function renderRouteSummary(steps) {
  const panel = document.getElementById('routeSummary');
  const container = document.getElementById('summarySteps');
  if (!panel || !container) return;

  container.innerHTML = steps.map((step, i) => `
    <div class="step step--${step.type}">
      <div class="step__num">${i + 1}</div>
      <div class="step__icon">${step.icon}</div>
      <div class="step__text">${step.text}</div>
    </div>
  `).join('');

  if (_adaMode) {
    container.insertAdjacentHTML('beforeend', `
      <div class="step-ada-badge">
        <span>♿</span> ADA accessible route — elevators &amp; ramps only
      </div>
    `);
  }

  panel.classList.add('route-summary--visible');
}

/** Clear and hide the route summary panel */
export function clearRouteSummary() {
  const panel = document.getElementById('routeSummary');
  if (panel) panel.classList.remove('route-summary--visible');
}

/**
 * Set the active floor tab in the Floor Plan Viewer.
 * @param {number} floor
 */
export function setActiveFloorTab(floor) {
  document.querySelectorAll('.floor-tab').forEach(tab => {
    tab.classList.toggle('floor-tab--active', parseInt(tab.dataset.floor) === floor);
  });
}

// ─── PRIVATE HELPERS ─────────────────────────────────────────────────────────

function _populateBuildingSelects() {
  const startSel = document.getElementById('startBuilding');
  const endSel   = document.getElementById('endBuilding');
  if (!startSel || !endSel) return;

  const options = Object.entries(BUILDINGS)
    .map(([key, b]) => `<option value="${key}">${b.name}</option>`)
    .join('');

  [startSel, endSel].forEach(sel => {
    sel.innerHTML = `<option value="">Select building…</option>${options}`;
  });
}

function _bindSelectEvents() {
  ['start', 'end'].forEach(which => {
    const bldgSel = document.getElementById(`${which}Building`);
    const floorSel = document.getElementById(`${which}Floor`);
    if (bldgSel) bldgSel.addEventListener('change', () => {
      _updateFloorSelect(which);
      _checkNavigateReady();
    });
    if (floorSel) floorSel.addEventListener('change', _checkNavigateReady);
  });
}

function _updateFloorSelect(which) {
  const buildingKey = document.getElementById(`${which}Building`)?.value;
  const floorSel    = document.getElementById(`${which}Floor`);
  if (!floorSel) return;

  floorSel.innerHTML = '<option value="">Floor…</option>';

  if (!buildingKey || !BUILDINGS[buildingKey]) return;

  const bldg  = BUILDINGS[buildingKey];
  const floors = _adaMode ? bldg.accessibleFloors : bldg.floors;

  floors.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = `Floor ${f}`;
    floorSel.appendChild(opt);
  });
}

function _bindADAToggle() {
  const row = document.getElementById('adaToggleRow');
  if (!row) return;

  function _toggleADA() {
    _adaMode = !_adaMode;
    row.setAttribute('aria-checked', String(_adaMode));
    row.classList.toggle('ada-row--active', _adaMode);
    row.querySelector('.toggle')?.classList.toggle('toggle--active', _adaMode);
    ['start', 'end'].forEach(_updateFloorSelect);
    _checkNavigateReady();
    document.dispatchEvent(new CustomEvent('navvy:ada:changed', { detail: { adaMode: _adaMode } }));
  }

  row.addEventListener('click', _toggleADA);
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      _toggleADA();
    }
  });
}

function _checkNavigateReady() {
  const sb = document.getElementById('startBuilding')?.value;
  const sf = document.getElementById('startFloor')?.value;
  const eb = document.getElementById('endBuilding')?.value;
  const ef = document.getElementById('endFloor')?.value;
  const btn = document.getElementById('navigateBtn');
  if (btn) btn.disabled = !(sb && sf && eb && ef);
}

function _bindNavigateButton(onNavigate) {
  const btn = document.getElementById('navigateBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const req = {
      startBuilding: document.getElementById('startBuilding')?.value,
      startFloor:    parseInt(document.getElementById('startFloor')?.value),
      endBuilding:   document.getElementById('endBuilding')?.value,
      endFloor:      parseInt(document.getElementById('endFloor')?.value),
      adaOnly:       _adaMode,
    };
    if (onNavigate) onNavigate(req);
  });
}

function _bindFloorTabs(onPreview) {
  document.querySelectorAll('.floor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const floor = parseInt(tab.dataset.floor);
      const building = tab.dataset.building || 'baldwin';
      if (onPreview) onPreview(building, floor);
    });
  });
}

function _listenToRouteEvents() {
  document.addEventListener('navvy:floorplan:loading', () => {
    setLoading(true, 'Loading floor plan…');
  });
  document.addEventListener('navvy:floorplan:loaded', (e) => {
    setLoading(false);
    const { building, floor } = e.detail;
    const bldg = BUILDINGS[building];
    setFloorBadge(bldg ? `${bldg.name} — Floor ${floor}` : `Floor ${floor}`);
  });
  document.addEventListener('navvy:floorplan:error', () => {
    setLoading(false);
    showToast('Could not load floor plan. The API may be waking up — try again in a moment.', 'error');
  });
  document.addEventListener('navvy:route:start', () => {
    clearRouteSummary();
    setLoading(true, 'Planning route…');
  });
  document.addEventListener('navvy:route:ready', (e) => {
    setLoading(false);
    renderRouteSummary(e.detail.steps);
  });
  document.addEventListener('navvy:route:error', (e) => {
    setLoading(false);
    showToast(e.detail.error.message, 'error');
  });
}
