/**
 * IndoorRoutePanel.tsx
 * Displays floor plan(s) with an indoor route overlay after navigation.
 * Rendered inside the Sidebar when the route has one or more indoor segments.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API, BUILDINGS } from '../data/config';
import { IndoorSegment } from '../router';
import FloorPlanMap from './FloorPlanMap';

interface IndoorRoutePanelProps {
  segments: IndoorSegment[];
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

export default function IndoorRoutePanel({ segments }: IndoorRoutePanelProps) {
  const [segIdx,       setSegIdx]       = useState(0);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [geojson,      setGeojson]      = useState<GeoJSON.FeatureCollection>(EMPTY_FC);
  const [loadState,    setLoadState]    = useState<LoadState>('idle');

  // Cache: "buildingApiKey:floor" → GeoJSON
  const cacheRef = useRef<Map<string, GeoJSON.FeatureCollection>>(new Map());

  const seg     = segments[segIdx] ?? segments[0];
  const building = seg ? BUILDINGS[seg.buildingKey] : null;

  // Reset to first segment/floor when segments change
  useEffect(() => {
    setSegIdx(0);
    setSelectedFloor(segments[0]?.floors[0] ?? null);
    setGeojson(EMPTY_FC);
    setLoadState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  // When segment index changes, reset to that segment's first floor
  const handleSegmentChange = useCallback((idx: number) => {
    setSegIdx(idx);
    setSelectedFloor(segments[idx]?.floors[0] ?? null);
    setGeojson(EMPTY_FC);
    setLoadState('idle');
  }, [segments]);

  // Fetch floor plan GeoJSON whenever building/floor selection changes
  useEffect(() => {
    if (!building || selectedFloor === null) return;

    const cacheKey = `${building.apiKey}:${selectedFloor}`;
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
      .catch(() => {
        if (cancelled) return;
        setLoadState('error');
      });

    return () => { cancelled = true; };
  }, [building, selectedFloor]);

  if (!seg || !building) return null;

  const routeForFloor = selectedFloor !== null ? (seg.routesByFloor[selectedFloor] ?? EMPTY_FC) : EMPTY_FC;

  return (
    <div className="indoor-panel">
      <div className="indoor-panel__header">
        <span className="indoor-panel__title">Indoor Route</span>
      </div>

      {/* Building tabs — only shown when there are multiple segments */}
      {segments.length > 1 && (
        <div className="indoor-panel__building-tabs">
          {segments.map((s, i) => (
            <button
              key={s.buildingKey}
              className={`indoor-panel__building-tab${i === segIdx ? ' indoor-panel__building-tab--active' : ''}`}
              onClick={() => handleSegmentChange(i)}
            >
              {s.buildingName}
            </button>
          ))}
        </div>
      )}

      {/* Floor tabs — only shown when the segment visits multiple floors */}
      {seg.floors.length > 1 && (
        <div className="indoor-panel__floor-tabs">
          {seg.floors.map(floor => (
            <button
              key={floor}
              className={`floor-tab${selectedFloor === floor ? ' floor-tab--active' : ''}`}
              onClick={() => setSelectedFloor(floor)}
              aria-pressed={selectedFloor === floor}
            >
              {floor}
            </button>
          ))}
        </div>
      )}

      {/* Map */}
      <div className="indoor-panel__map">
        {building && selectedFloor !== null && (
          <FloorPlanMap
            key={`${seg.buildingKey}-${segIdx}`}
            geojson={geojson}
            center={building.center}
            routeGeoJSON={routeForFloor}
          />
        )}

        {loadState === 'loading' && (
          <div className="indoor-panel__overlay">
            <div className="fp-spinner__ring fp-spinner__ring--inline" />
            <span>Loading floor plan…</span>
          </div>
        )}

        {loadState === 'error' && (
          <div className="indoor-panel__overlay indoor-panel__overlay--error">
            Floor plan unavailable for {building?.name}
          </div>
        )}

        {/* Single-floor label */}
        {seg.floors.length === 1 && loadState === 'loaded' && (
          <div className="indoor-panel__floor-label">
            {building.name} — Floor {selectedFloor}
          </div>
        )}
      </div>
    </div>
  );
}
