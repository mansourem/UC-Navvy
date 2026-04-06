/**
 * Sidebar.tsx — React port of js/ui.js.
 * Preserves the exact HTML class names so the existing css/components.css
 * and css/layout.css work without modification.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BUILDINGS, APP, FEATURES } from '../data/config';
import { planRoute, RouteResult, RouteStep } from '../router';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface SidebarProps {
  startBuilding: string;
  endBuilding:   string;
  onStartChange: (key: string) => void;
  onEndChange:   (key: string) => void;
  onRouteReady:  (result: RouteResult) => void;
}

// ─── BUILDING OPTIONS ─────────────────────────────────────────────────────────

const BUILDING_OPTIONS = Object.entries(BUILDINGS)
  .map(([key, b]) => ({ key, name: b.name }))
  .sort((a, b) => a.name.localeCompare(b.name));

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function Sidebar({
  startBuilding,
  endBuilding,
  onStartChange,
  onEndChange,
  onRouteReady,
}: SidebarProps) {
  const [adaMode,    setAdaMode]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [steps,      setSteps]      = useState<RouteStep[] | null>(null);
  const [collapsed,  setCollapsed]  = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [toast,      setToast]      = useState<{ msg: string; type: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canNavigate = !!(startBuilding && endBuilding);

  // ── Toast helper ─────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, type = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), APP.TOAST_DURATION);
  }, []);

  // ── Navigate handler ─────────────────────────────────────────────────────
  const handleNavigate = useCallback(async () => {
    if (!canNavigate) return;
    setLoading(true);
    setSteps(null);
    try {
      const result = await planRoute({ startBuilding, endBuilding, adaOnly: adaMode });
      setSteps(result.steps);
      onRouteReady(result);
      // Collapse sidebar on mobile after navigating
      if (window.innerWidth <= APP.SIDEBAR_BREAKPOINT) setCollapsed(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not plan route.';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [startBuilding, endBuilding, adaMode, canNavigate, onRouteReady, showToast]);

  // ── ADA toggle keyboard handler ───────────────────────────────────────────
  const handleAdaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAdaMode(v => !v); }
  };

  return (
    <>
      {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
      <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`} aria-label="Navigation controls">

        {/* Route Planner */}
        <div className="sidebar__section">
          <div className="section-label" aria-hidden="true">Route Planner</div>

          {/* START card */}
          <div className="route-card" role="group" aria-labelledby="startCardLabel">
            <div className="route-card__label" id="startCardLabel" style={{ fontSize: '14px' }}>
              <span className="route-dot route-dot--start" aria-hidden="true"></span>
              Starting Point
            </div>
            <div className="select-row">
              <div className="select-group">
                {/* <label htmlFor="startBuilding">Building</label> */}
                <select
                  id="startBuilding"
                  aria-label="Starting building"
                  value={startBuilding}
                  onChange={e => onStartChange(e.target.value)}
                >
                  <option value="">Select building…</option>
                  {BUILDING_OPTIONS.map(o => (
                    <option key={o.key} value={o.key}>{o.name}</option>
                  ))}
                </select>
              </div>
              {FEATURES.INDOOR_ROUTING && (
                <div className="select-group indoor-routing-field">
                  <select id="startFloor" aria-label="Starting floor">
                    <option value="">Floor…</option>
                    {startBuilding && BUILDINGS[startBuilding]?.floors.map(f => (
                      <option key={f} value={f}>Floor {f}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="route-connector" aria-hidden="true">
            <div className="route-connector__line"></div>
          </div>

          {/* END card */}
          <div className="route-card" role="group" aria-labelledby="endCardLabel">
            <div className="route-card__label" id="endCardLabel" style={{ fontSize: '14px' }}>
              <span className="route-dot route-dot--end" aria-hidden="true"></span>
              Destination
            </div>
            <div className="select-row">
              <div className="select-group">
                {/* <label htmlFor="endBuilding">Building</label> */}
                <select
                  id="endBuilding"
                  aria-label="Destination building"
                  value={endBuilding}
                  onChange={e => onEndChange(e.target.value)}
                >
                  <option value="">Select building…</option>
                  {BUILDING_OPTIONS.map(o => (
                    <option key={o.key} value={o.key}>{o.name}</option>
                  ))}
                </select>
              </div>
              {FEATURES.INDOOR_ROUTING && (
                <div className="select-group indoor-routing-field">
                  <select id="endFloor" aria-label="Destination floor">
                    <option value="">Floor…</option>
                    {endBuilding && BUILDINGS[endBuilding]?.floors.map(f => (
                      <option key={f} value={f}>Floor {f}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ADA Toggle */}
        <div
          className={`ada-row${adaMode ? ' ada-row--active' : ''}`}
          id="adaToggleRow"
          role="switch"
          aria-checked={adaMode}
          aria-label="Accessible route only"
          tabIndex={0}
          onClick={() => setAdaMode(v => !v)}
          onKeyDown={handleAdaKeyDown}
        >
          <div className="ada-info">
            <div className="ada-title">
              <span className="ada-badge" aria-hidden="true">♿ ADA</span>
              Accessible Route Only
            </div>
            <div className="ada-subtitle">Elevators &amp; Ramps - no stairs</div>
          </div>
          <div className={`toggle${adaMode ? ' toggle--active' : ''}`} aria-hidden="true">
            <div className="toggle__thumb"></div>
          </div>
        </div>

        {/* Navigate button */}
        <div className="nav-btn-wrap">
          <button
            className="nav-btn"
            id="navigateBtn"
            disabled={!canNavigate || loading}
            aria-label="Plan route"
            onClick={handleNavigate}
          >
            {loading ? (
              <span>Loading…</span>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
                </svg>
                Navigate
              </>
            )}
          </button>
        </div>

        <div className="u-divider" role="separator"></div>

        {/* Edit route button (shown on mobile after navigating) */}
        {collapsed && (
          <button
            className="planner-toggle-btn"
            id="plannerToggleBtn"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(false)}
          >
            Edit Route
          </button>
        )}

        {/* Route Summary */}
        {steps && steps.length > 0 && (
          <div
            className="route-summary route-summary--visible"
            id="routeSummary"
            role="region"
            aria-label="Route instructions"
            aria-live="polite"
          >
            <div className="route-summary__header">
              <span className="route-summary__title">▸ Route Instructions</span>
            </div>
            <div className="route-summary__body" id="summarySteps">
              {steps.map((step, i) => (
                <div key={i} className={`step step--${step.type}`}>
                  <div className="step__num">{i + 1}</div>
                  <div className="step__icon">{step.icon}</div>
                  <div className="step__text">{step.text}</div>
                </div>
              ))}
              {adaMode && (
                <div className="step-ada-badge">
                  <span>♿</span> ADA accessible route — elevators &amp; ramps only
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* ── MAP OVERLAY ELEMENTS ─────────────────────────────────────────── */}

      {/* Loading overlay */}
      <div
        className={`loading-overlay${loading ? ' loading-overlay--visible' : ''}`}
        id="loadingOverlay"
        role="status"
        aria-label="Loading"
      >
        <div className="spinner" aria-hidden="true"></div>
        <span className="loading-label" id="loadingLabel">Planning route…</span>
      </div>

      {/* Legend toggle */}
      <button
        className="legend-toggle"
        id="legendToggle"
        aria-expanded={legendOpen}
        onClick={() => setLegendOpen(v => !v)}
      >
        Legend
      </button>

      <div
        className={`map-legend${legendOpen ? '' : ' map-legend--collapsed'}`}
        id="mapLegend"
        aria-label="Map legend"
        role="complementary"
      >
        <div className="map-legend__title">Legend</div>
        <div className="legend-item"><div className="legend-line legend-line--start" aria-hidden="true"></div>Start Point</div>
        <div className="legend-item"><div className="legend-line legend-line--end"   aria-hidden="true"></div>Destination</div>
        <div className="legend-item"><div className="legend-line legend-line--route" aria-hidden="true"></div>Route Path</div>
        <div className="legend-item"><div className="legend-line legend-line--ada"   aria-hidden="true"></div>ADA Route</div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast toast--${toast.type} toast--visible`} role="alert" aria-live="assertive">
          {toast.msg}
        </div>
      )}
    </>
  );
}
