/**
 * App.tsx — React port of js/app.js + the HTML shell in index.html.
 * Renders the header, sidebar, and map; wires all state together.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import NavvyMap, { NavvyMapHandle } from './components/NavvyMap';
import Sidebar from './components/Sidebar';
import FloorPlanPage from './components/FloorPlanPage';
import { BUILDINGS } from './data/config';
import { RouteResult } from './router';

type Page = 'navigate' | 'floorplans';

export default function App() {
  const mapRef = useRef<NavvyMapHandle>(null);

  const [page, setPage] = useState<Page>('navigate');

  const [startBuilding, setStartBuilding] = useState('');
  const [endBuilding,   setEndBuilding]   = useState('');
  const [routeResult,   setRouteResult]   = useState<RouteResult | null>(null);

  // ── Theme ─────────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') !== 'light';
  });

  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [darkMode]);

  // Fit the map so both buildings are visible
  const fitToBoth = useCallback((startKey: string, endKey: string) => {
    const a = BUILDINGS[startKey].center;
    const b = BUILDINGS[endKey].center;
    mapRef.current?.fitBounds([
      [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
      [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
    ]);
  }, []);

  // Clicking a building marker auto-fills start first, then end
  const handleBuildingClick = useCallback((key: string) => {
    if (!startBuilding) {
      setStartBuilding(key);
      mapRef.current?.flyTo(BUILDINGS[key].center, 18);
    } else {
      setEndBuilding(key);
      fitToBoth(startBuilding, key);
    }
  }, [startBuilding, fitToBoth]);

  const handleRouteReady = useCallback((result: RouteResult) => {
    setRouteResult(result);
    if (result.bounds) {
      mapRef.current?.fitBounds(result.bounds);
    }
  }, []);

  const handleStartChange = useCallback((key: string) => {
    setStartBuilding(key);
    if (key) mapRef.current?.flyTo(BUILDINGS[key].center, 18);
  }, []);

  const handleEndChange = useCallback((key: string) => {
    setEndBuilding(key);
    if (key && startBuilding) fitToBoth(startBuilding, key);
  }, [startBuilding, fitToBoth]);

  return (
    <div className="app">

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header className="header" role="banner">
        <div className="header__logo">
          <div className="header__logomark" aria-hidden="true">UC</div>
          <span className="header__wordmark">Nav<em>vy</em></span>
        </div>
        <nav className="header__nav" aria-label="Page navigation">
          <button
            className={`header__nav-tab${page === 'navigate' ? ' header__nav-tab--active' : ''}`}
            onClick={() => setPage('navigate')}
          >
            Navigate
          </button>
          <button
            className={`header__nav-tab${page === 'floorplans' ? ' header__nav-tab--active' : ''}`}
            onClick={() => setPage('floorplans')}
          >
            Floor Plans
          </button>
        </nav>
        <div align-items="center" style={{ display: 'flex', gap: '1rem' }}>
        <label
          className="switch"
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <input
            type="checkbox"
            checked={!darkMode}
            onChange={() => setDarkMode(v => !v)}
          />
          <span className="slider"></span>
          <span className="decoration"></span>
        </label>
        <div className="header__status" title="System online" aria-label="Navigation system online">
          <span className="header__status-dot"></span>
          <span>LIVE</span>
        </div>
        </div>
      </header>

      {/* ── APP BODY ────────────────────────────────────────────────────── */}
      <div className="app-body">

        {page === 'navigate' ? (
          <>
            <Sidebar
              startBuilding={startBuilding}
              endBuilding={endBuilding}
              onStartChange={handleStartChange}
              onEndChange={handleEndChange}
              onRouteReady={handleRouteReady}
            />

            {/* ── MAP AREA ────────────────────────────────────────────── */}
            <main className="map-wrap" role="main" aria-label="Campus map">
              <NavvyMap
                ref={mapRef}
                routeResult={routeResult}
                start={startBuilding}
                end={endBuilding}
                onBuildingClick={handleBuildingClick}
              />
            </main>
          </>
        ) : (
          <FloorPlanPage />
        )}

      </div>
    </div>
  );
}
