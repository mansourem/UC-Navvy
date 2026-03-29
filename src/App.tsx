/**
 * App.tsx — React port of js/app.js + the HTML shell in index.html.
 * Renders the header, sidebar, and map; wires all state together.
 */

import React, { useState, useRef, useCallback } from 'react';
import NavvyMap, { NavvyMapHandle } from './components/NavvyMap';
import Sidebar from './components/Sidebar';
import { BUILDINGS } from './config';
import { RouteResult } from './router';

export default function App() {
  const mapRef = useRef<NavvyMapHandle>(null);

  const [startBuilding,     setStartBuilding]     = useState('');
  const [endBuilding,       setEndBuilding]        = useState('');
  const [selectedBuilding,  setSelectedBuilding]   = useState<string | null>(null);
  const [routeResult,       setRouteResult]        = useState<RouteResult | null>(null);

  // Clicking a building marker auto-fills start first, then end
  const handleBuildingClick = useCallback((key: string) => {
    if (!startBuilding) {
      setStartBuilding(key);
      setSelectedBuilding(key);
      mapRef.current?.flyTo(BUILDINGS[key].center, 18);
    } else {
      setEndBuilding(key);
    }
  }, [startBuilding]);

  const handleRouteReady = useCallback((result: RouteResult) => {
    setRouteResult(result);
    setSelectedBuilding(null);   // reset highlight once route is drawn
    if (result.bounds) {
      mapRef.current?.fitBounds(result.bounds);
    }
  }, []);

  const handleStartChange = useCallback((key: string) => {
    setStartBuilding(key);
    setSelectedBuilding(key || null);
    if (key) mapRef.current?.flyTo(BUILDINGS[key].center, 18);
  }, []);

  const handleEndChange = useCallback((key: string) => {
    setEndBuilding(key);
  }, []);

  return (
    <div className="app">

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header className="header" role="banner">
        <div className="header__logo">
          <div className="header__logomark" aria-hidden="true">UC</div>
          <span className="header__wordmark">Nav<em>vy</em></span>
        </div>
        <span className="header__meta" aria-hidden="true">
          University of Cincinnati — Campus Navigation
        </span>
        <div className="header__status" title="System online" aria-label="Navigation system online">
          <span className="header__status-dot"></span>
          <span>LIVE</span>
        </div>
      </header>

      {/* ── APP BODY ────────────────────────────────────────────────────── */}
      <div className="app-body">

        <Sidebar
          startBuilding={startBuilding}
          endBuilding={endBuilding}
          onStartChange={handleStartChange}
          onEndChange={handleEndChange}
          onRouteReady={handleRouteReady}
        />

        {/* ── MAP AREA ──────────────────────────────────────────────────── */}
        <main className="map-wrap" role="main" aria-label="Campus map">
          <NavvyMap
            ref={mapRef}
            routeResult={routeResult}
            selectedBuilding={selectedBuilding}
            onBuildingClick={handleBuildingClick}
          />
        </main>

      </div>
    </div>
  );
}
