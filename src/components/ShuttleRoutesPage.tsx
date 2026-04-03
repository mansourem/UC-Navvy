/**
 * ShuttleRoutesPage.tsx
 * Interactive multi-route shuttle map.
 * Multiple routes can be toggled simultaneously via the sidebar checkboxes.
 * Routes and stops are rendered as MapLibre GL vector layers.
 * Transit Row hub is an HTML marker (immune to dark-mode canvas filter).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { SHUTTLE_ROUTES, TRANSIT_ROW } from '../data/shuttleRoutes';
import { MAP_CONFIG } from '../config';

// ─── Pre-build GeoJSON feature arrays (computed once at module load) ─────────

const ALL_ROUTE_FEATURES: GeoJSON.Feature<GeoJSON.LineString>[] = SHUTTLE_ROUTES.map(r => ({
  type: 'Feature',
  id:   r.id,
  geometry: { type: 'LineString', coordinates: r.path },
  properties: { routeId: r.id, color: r.color },
}));

const ALL_STOP_FEATURES: GeoJSON.Feature<GeoJSON.Point>[] = SHUTTLE_ROUTES.flatMap(r =>
  r.stops.map((s, i) => ({
    type: 'Feature',
    id:   `${r.id}-${i}`,
    geometry: { type: 'Point', coordinates: s.coord },
    properties: { routeId: r.id, color: r.color, name: s.name },
  }))
);

function filteredFC<T extends GeoJSON.Geometry>(
  features: GeoJSON.Feature<T>[],
  ids: Set<string>,
): GeoJSON.FeatureCollection<T> {
  return {
    type: 'FeatureCollection',
    features: features.filter(f => ids.has(f.properties!.routeId as string)),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

const ALL_IDS = new Set(SHUTTLE_ROUTES.map(r => r.id));

export default function ShuttleRoutesPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set(ALL_IDS));
  const [mapLoaded, setMapLoaded]  = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);
  const popupRef     = useRef<maplibregl.Popup | null>(null);
  const selectedRef  = useRef(selected);

  // Keep ref in sync so the map.on('load') closure can read latest selection
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const applySelection = useCallback((ids: Set<string>) => {
    const map = mapRef.current;
    if (!map) return;
    const rs = map.getSource('shuttle-routes') as maplibregl.GeoJSONSource | undefined;
    const ss = map.getSource('shuttle-stops')  as maplibregl.GeoJSONSource | undefined;
    if (!rs || !ss) return;
    rs.setData(filteredFC(ALL_ROUTE_FEATURES, ids));
    ss.setData(filteredFC(ALL_STOP_FEATURES,  ids));
  }, []);

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(ALL_IDS)), []);
  const clearAll  = useCallback(() => setSelected(new Set()),        []);

  // ── Map initialisation (once) ──────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     MAP_CONFIG.styleUrl,
      center:    TRANSIT_ROW,
      zoom:      13.5,
      minZoom:   11,
      maxZoom:   18,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      // ── Sources ────────────────────────────────────────────────────────
      const initialIds = selectedRef.current;

      map.addSource('shuttle-routes', {
        type: 'geojson',
        data: filteredFC(ALL_ROUTE_FEATURES, initialIds),
      });
      map.addSource('shuttle-stops', {
        type: 'geojson',
        data: filteredFC(ALL_STOP_FEATURES, initialIds),
      });

      // ── Route glow ─────────────────────────────────────────────────────
      map.addLayer({
        id:     'shuttle-route-glow',
        type:   'line',
        source: 'shuttle-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color':   ['get', 'color'],
          'line-width':   8,
          'line-opacity': 0.15,
        },
      });

      // ── Route line ─────────────────────────────────────────────────────
      map.addLayer({
        id:     'shuttle-route-lines',
        type:   'line',
        source: 'shuttle-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color':   ['get', 'color'],
          'line-width':   3,
          'line-opacity': 0.9,
        },
      });

      // ── Stop circles ───────────────────────────────────────────────────
      map.addLayer({
        id:     'shuttle-stop-circles',
        type:   'circle',
        source: 'shuttle-stops',
        paint: {
          'circle-radius':       5,
          'circle-color':        ['get', 'color'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      // ── Transit Row HTML marker (immune to dark-mode canvas filter) ────
      const hubEl = document.createElement('div');
      hubEl.className = 'sr-hub-marker';
      hubEl.textContent = '★';
      new maplibregl.Marker({ element: hubEl })
        .setLngLat(TRANSIT_ROW)
        .addTo(map);

      // ── Stop click → popup ─────────────────────────────────────────────
      map.on('click', 'shuttle-stop-circles', e => {
        const feat = e.features?.[0];
        if (!feat) return;
        const name   = feat.properties?.name  as string;
        const color  = feat.properties?.color as string;
        const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({ offset: 10, closeButton: false })
          .setLngLat(coords)
          .setHTML(`<div class="sr-popup" style="--route-color:${color}">${name}</div>`)
          .addTo(map);
      });

      map.on('click', e => {
        // close popup when clicking the map background
        const hits = map.queryRenderedFeatures(e.point, { layers: ['shuttle-stop-circles'] });
        if (!hits.length) popupRef.current?.remove();
      });

      map.on('mouseenter', 'shuttle-stop-circles', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'shuttle-stop-circles', () => {
        map.getCanvas().style.cursor = '';
      });

      mapRef.current = map;
      setMapLoaded(true);
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-filter sources whenever selection changes ──────────────────────────

  useEffect(() => {
    if (mapLoaded) applySelection(selected);
  }, [selected, mapLoaded, applySelection]);

  // ── Sidebar route count badge ─────────────────────────────────────────────
  const count = selected.size;

  return (
    <div className="sr-page">

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className="sr-sidebar">
        <div className="sr-sidebar__inner">

          <div className="section-label">Shuttle Routes</div>

          {/* Bulk-select buttons + active count */}
          <div className="sr-bulk-row">
            <button className="sr-bulk-btn" onClick={selectAll}>All</button>
            <button className="sr-bulk-btn" onClick={clearAll}>None</button>
            <span className="sr-bulk-count">{count}/{SHUTTLE_ROUTES.length} active</span>
          </div>

          {/* Route list */}
          <nav className="sr-route-list" aria-label="Shuttle routes">
            {SHUTTLE_ROUTES.map(route => {
              const active = selected.has(route.id);
              return (
                <label
                  key={route.id}
                  className={`sr-route-item${active ? ' sr-route-item--active' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="sr-route-checkbox"
                    checked={active}
                    onChange={() => toggle(route.id)}
                    aria-label={`Show ${route.name}`}
                  />
                  <span
                    className="sr-route-item__dot"
                    style={{
                      background:  route.color,
                      boxShadow:   active ? `0 0 5px ${route.color}` : undefined,
                    }}
                  />
                  <span className="sr-route-item__name">{route.name}</span>
                  {route.isNightride && (
                    <span className="sr-route-item__badge">Night</span>
                  )}
                </label>
              );
            })}
          </nav>

        </div>
      </aside>

      {/* ── Map ─────────────────────────────────────────────────────── */}
      <main className="sr-display" role="main" aria-label="Shuttle route map">
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </main>

    </div>
  );
}
