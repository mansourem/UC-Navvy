/**
 * FloorPlanPage.tsx — Building floor plan viewer.
 * Fetches GeoJSON from the API and renders it on a MapLibre map.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BUILDINGS, API } from '../data/config';
import FloorPlanMap from './FloorPlanMap';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

const no_floorplans = ['calhoun', 'daniels', 'dabney', 'marketpt', 'morgens', 'mspencer', 'scioto', 'siddall', 'turner', 'schneidr', "crosley", 'tennis'];


const FILTERED_BUILDINGS = {...BUILDINGS};

for (const id of no_floorplans) {
  delete FILTERED_BUILDINGS[id];
}

// Sort buildings alphabetically by display name
const SORTED_BUILDINGS = Object.entries(FILTERED_BUILDINGS).sort(([, a], [, b]) =>
  a.name.localeCompare(b.name)
);

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export default function FloorPlanPage() {
  const [selectedBuilding, setSelectedBuilding] = useState<string>('');
  const [selectedFloor, setSelectedFloor]       = useState<number | null>(null);
  const [loadState, setLoadState]               = useState<LoadState>('idle');
  const [errorMsg, setErrorMsg]                 = useState<string>('');
  const [geojson, setGeojson]                   = useState<GeoJSON.FeatureCollection>(EMPTY_FC);

  // Cache: "buildingApiKey:floor" → GeoJSON
  const cacheRef = useRef<Map<string, GeoJSON.FeatureCollection>>(new Map());

  const building = selectedBuilding ? BUILDINGS[selectedBuilding] : null;
  const floors   = building?.floors ?? [];

  const handleBuildingChange = useCallback((key: string) => {
    setSelectedBuilding(key);
    setGeojson(EMPTY_FC);
    setErrorMsg('');
    if (key) {
      const firstFloor = BUILDINGS[key].floors[0] ?? null;
      setSelectedFloor(firstFloor);
      setLoadState(firstFloor === null ? 'idle' : 'loading');
    } else {
      setSelectedFloor(null);
      setLoadState('idle');
    }
  }, []);

  const handleFloorSelect = useCallback((floor: number) => {
    setSelectedFloor(floor);
    setErrorMsg('');
    setLoadState('loading');
  }, []);

  // Fetch GeoJSON whenever building/floor selection changes
  useEffect(() => {
    if (!building || selectedFloor === null) return;

    const cacheKey = `${building.apiKey}:${selectedFloor}`;

    // Return cached result immediately
    if (cacheRef.current.has(cacheKey)) {
      setGeojson(cacheRef.current.get(cacheKey)!);
      setLoadState('loaded');
      return;
    }

    setLoadState('loading');
    setGeojson(EMPTY_FC);

    let cancelled = false;

    fetch(API.floorplanUrl(building.apiKey, selectedFloor))
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<GeoJSON.FeatureCollection>;
      })
      .then(data => {
        if (cancelled) return;
        cacheRef.current.set(cacheKey, data);
        setGeojson(data);
        setLoadState('loaded');
      })
      .catch(err => {
        if (cancelled) return;
        setErrorMsg(err.message ?? 'Failed to load floor plan');
        setLoadState('error');
      });

    return () => { cancelled = true; };
  }, [building, selectedFloor]);

  return (
    <div className="fp-page">

      {/* ── Controls Panel ───────────────────────────────────────── */}
      <aside className="fp-controls">
        <div className="fp-controls__inner">

          <div className="section-label">Floor Plans</div>

          {/* Building selector */}
          <div className="fp-field">
            <label className="fp-field__label" htmlFor="fp-building-select">
              Building
            </label>
            <select
              id="fp-building-select"
              value={selectedBuilding}
              onChange={e => handleBuildingChange(e.target.value)}
            >
              <option value="">— Select a building —</option>
              {SORTED_BUILDINGS.map(([key, b]) => (
                <option key={key} value={key}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Floor tabs */}
          {building && floors.length > 0 && (
            <div className="fp-floor-section">
              <span className="fp-field__label">Floor</span>
              <div className="floor-tabs">
                {floors.map(floor => (
                  <button
                    key={floor}
                    className={`floor-tab${selectedFloor === floor ? ' floor-tab--active' : ''}`}
                    onClick={() => handleFloorSelect(floor)}
                    aria-pressed={selectedFloor === floor}
                  >
                    {floor === 0 ? 'G' : floor}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Building info */}
          {building && (
            <div className="fp-building-info">
              <div className="fp-building-info__name">{building.name}</div>
              <div className="fp-building-info__detail">
                {floors.length} floor{floors.length !== 1 ? 's' : ''}
                {building.elevatorNodes && building.elevatorNodes.length > 0 && (
                  <span className="fp-badge fp-badge--ada">Elevator</span>
                )}
              </div>
            </div>
          )}

          {/* Load status */}
          {loadState === 'loading' && (
            <div className="fp-status">
              <div className="fp-spinner__ring fp-spinner__ring--inline" />
              <span>Loading floor plan…</span>
            </div>
          )}
          {loadState === 'error' && (
            <div className="fp-status fp-status--error">
              Floor plan unavailable{errorMsg ? `: ${errorMsg}` : ''}
            </div>
          )}
          {loadState === 'loaded' && (
            <div className="fp-status fp-status--ok">
              Floor {selectedFloor === 0 ? 'G' : selectedFloor} loaded
            </div>
          )}

        </div>
      </aside>

      {/* ── Floor Plan Display ────────────────────────────────────── */}
      <main className="fp-display" role="main" aria-label="Floor plan viewer">

        {!selectedBuilding && (
          <div className="fp-empty">
            <div className="fp-empty__icon">🏛</div>
            <div className="fp-empty__title">Select a Building</div>
            <div className="fp-empty__sub">
              Choose a building from the panel to view its floor plans
            </div>
          </div>
        )}

        {selectedBuilding && selectedFloor === null && (
          <div className="fp-empty">
            <div className="fp-empty__icon">📐</div>
            <div className="fp-empty__title">No Floors Available</div>
            <div className="fp-empty__sub">
              This building has no floor plan data configured
            </div>
          </div>
        )}

        {/* Map is always mounted once a building+floor is selected, so MapLibre
            doesn't get destroyed on floor switches — just the GeoJSON data changes */}
        {building && selectedFloor !== null && (
          <div className="fp-viewer">
            <FloorPlanMap
              key={selectedBuilding}
              geojson={geojson}
              center={building.center}
            />

            {/* Loading overlay */}
            {loadState === 'loading' && (
              <div className="fp-spinner" aria-label="Loading floor plan">
                <div className="fp-spinner__ring" />
              </div>
            )}

            {/* Error overlay */}
            {loadState === 'error' && (
              <div className="fp-empty fp-empty--overlay">
                <div className="fp-empty__icon">🗺</div>
                <div className="fp-empty__title">Floor Plan Unavailable</div>
                <div className="fp-empty__sub">
                  No data found for <strong>{building.name}</strong>,
                  Floor {selectedFloor === 0 ? 'G' : selectedFloor}
                </div>
              </div>
            )}

            {/* Floor label */}
            {loadState === 'loaded' && (
              <div className="fp-overlay-label" aria-hidden="true">
                Floor {selectedFloor === 0 ? 'G' : selectedFloor}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
