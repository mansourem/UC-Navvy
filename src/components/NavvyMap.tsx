/**
 * NavvyMap.tsx
 * MapLibre GL JS map component — replaces js/map.js.
 *
 * Leaflet → MapLibre equivalents used here:
 *   L.map()               → new maplibregl.Map()
 *   L.tileLayer()         → style URL (full GL style, not raster tile template)
 *   L.control.zoom()      → new maplibregl.NavigationControl()
 *   L.marker(divIcon)     → 'circle' + 'symbol' layers on a GeoJSON source
 *   L.polygon()           → 'fill' layer on a GeoJSON source
 *   L.polyline()          → 'line' layer on a GeoJSON source
 *   L.circleMarker()      → 'circle' layer on a GeoJSON source
 *   map.flyTo()           → map.flyTo()
 *   map.fitBounds()       → map.fitBounds()
 *   layer.on('click')     → map.on('click', layerId, handler)
 */

import React, {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BUILDINGS, MAP_CONFIG, APP } from '../config';
import { RouteResult } from '../router';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface NavvyMapHandle {
  flyTo(lngLat: [number, number], zoom?: number): void;
  fitBounds(bounds: [[number, number], [number, number]]): void;
}

interface NavvyMapProps {
  routeResult:      RouteResult | null;
  selectedBuilding: string | null;
  onBuildingClick:  (key: string) => void;
}

// ─── STATIC DATA ─────────────────────────────────────────────────────────────

// Base buildings GeoJSON — computed once, never mutated.
// Highlighting is done via the 'highlighted'/'dimmed' properties which are
// refreshed by setData() whenever selectedBuilding changes.
function buildBuildingsGeoJSON(selected: string | null): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Object.entries(BUILDINGS).map(([key, b]) => ({
      type:       'Feature' as const,
      id:         key,
      geometry:   { type: 'Point' as const, coordinates: b.center },
      properties: {
        key,
        name:        b.name,
        highlighted: selected === key,
        dimmed:      selected !== null && selected !== key,
      },
    })),
  };
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// ─── COMPONENT ───────────────────────────────────────────────────────────────

const NavvyMap = forwardRef<NavvyMapHandle, NavvyMapProps>(
  ({ routeResult, selectedBuilding, onBuildingClick }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef       = useRef<maplibregl.Map | null>(null);
    // Keep callback in a ref so map event listeners never hold stale closures
    const clickCbRef   = useRef(onBuildingClick);
    useEffect(() => { clickCbRef.current = onBuildingClick; }, [onBuildingClick]);

    // ── Expose flyTo / fitBounds to parent ──────────────────────────────────
    useImperativeHandle(ref, () => ({
      flyTo([lng, lat], zoom = 18) {
        mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 800 });
      },
      fitBounds(bounds) {
        mapRef.current?.fitBounds(bounds, { padding: APP.FIT_PADDING });
      },
    }));

    // ── Map initialisation (runs once on mount) ──────────────────────────────
    useEffect(() => {
      if (!containerRef.current || mapRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style:     MAP_CONFIG.styleUrl,
        center:    MAP_CONFIG.center,
        zoom:      MAP_CONFIG.zoom,
        minZoom:   MAP_CONFIG.minZoom,
        maxZoom:   MAP_CONFIG.maxZoom,
      });

      // Replaces L.control.zoom({ position: 'topright' })
      map.addControl(new maplibregl.NavigationControl(), 'top-right');

      map.on('load', () => {
        // ── Buildings source + layers ──────────────────────────────────────
        map.addSource('buildings', {
          type: 'geojson',
          data: buildBuildingsGeoJSON(null),
        });

        // Dot — replaces L.divIcon circle
        map.addLayer({
          id:     'building-dots',
          type:   'circle',
          source: 'buildings',
          paint: {
            'circle-radius':       6,
            'circle-color': [
              'case',
              ['get', 'highlighted'], '#E00122',
              ['get', 'dimmed'],      '#888888',
              '#4A9EFF',
            ],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': ['case', ['get', 'dimmed'], 0.3, 1],
          },
        });

        // Label — replaces <span class="building-marker__label">
        map.addLayer({
          id:     'building-labels',
          type:   'symbol',
          source: 'buildings',
          layout: {
            'text-field':     ['get', 'name'],
            'text-size':      10,
            'text-offset':    [0, 1.2],
            'text-anchor':    'top',
            'text-optional':  true,
            'text-max-width': 8,
          },
          paint: {
            'text-color':       '#333333',
            'text-halo-color':  '#ffffff',
            'text-halo-width':  1,
            'text-opacity': ['case', ['get', 'dimmed'], 0.3, 1],
          },
        });

        // ── Route source + layers ──────────────────────────────────────────
        // Replaces the L.polyline() calls in router.js
        map.addSource('route', { type: 'geojson', data: EMPTY_FC });

        // Glow layer — replaces the semi-transparent wider polyline
        map.addLayer({
          id:     'route-glow',
          type:   'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color':   '#4A9EFF',
            'line-width':   9,
            'line-opacity': 0.15,
          },
        }, 'building-dots');   // insert below building markers

        // Main route line
        map.addLayer({
          id:     'route-line',
          type:   'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color':   '#4A9EFF',
            'line-width':   3.5,
            'line-opacity': 0.9,
          },
        }, 'building-dots');

        // ── Endpoints source + layer ───────────────────────────────────────
        // Replaces L.circleMarker() for start / end markers
        map.addSource('endpoints', { type: 'geojson', data: EMPTY_FC });

        map.addLayer({
          id:     'endpoint-circles',
          type:   'circle',
          source: 'endpoints',
          paint: {
            'circle-radius':       10,
            'circle-color':        ['match', ['get', 'markerType'], 'start', '#00C851', '#E00122'],
            'circle-stroke-width': 2,
            'circle-stroke-color': ['match', ['get', 'markerType'], 'start', '#00ff66', '#ff3344'],
            'circle-opacity':      0.95,
          },
        });

        // ── Click / cursor for building markers ────────────────────────────
        map.on('click', 'building-dots', e => {
          const key = e.features?.[0]?.properties?.key as string | undefined;
          if (key) clickCbRef.current(key);
        });
        map.on('mouseenter', 'building-dots', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'building-dots', () => {
          map.getCanvas().style.cursor = '';
        });

        mapRef.current = map;
      });

      return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Update route layers when routeResult changes ─────────────────────────
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;

      const routeSrc     = map.getSource('route')     as maplibregl.GeoJSONSource;
      const endpointsSrc = map.getSource('endpoints') as maplibregl.GeoJSONSource;

      if (!routeSrc || !endpointsSrc) return;

      if (!routeResult) {
        routeSrc.setData(EMPTY_FC);
        endpointsSrc.setData(EMPTY_FC);
        return;
      }

      const isAda = routeResult.isAda;
      const color = isAda ? '#FFB300' : '#4A9EFF';

      map.setPaintProperty('route-glow', 'line-color', color);
      map.setPaintProperty('route-line', 'line-color', color);
      map.setPaintProperty('route-line', 'line-dasharray', isAda ? [3, 2] : []);
      map.setPaintProperty('route-glow', 'line-dasharray', isAda ? [3, 2] : []);

      routeSrc.setData(routeResult.routeGeoJSON);
      endpointsSrc.setData(routeResult.endpointsGeoJSON);

      if (routeResult.bounds) {
        map.fitBounds(routeResult.bounds, { padding: APP.FIT_PADDING });
      }
    }, [routeResult]);

    // ── Update building highlight when selectedBuilding changes ──────────────
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      const src = map.getSource('buildings') as maplibregl.GeoJSONSource | undefined;
      src?.setData(buildBuildingsGeoJSON(selectedBuilding));
    }, [selectedBuilding]);

    return <div ref={containerRef} id="map" style={{ width: '100%', height: '100%' }} />;
  },
);

export default NavvyMap;
