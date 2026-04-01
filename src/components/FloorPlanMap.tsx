/**
 * FloorPlanMap.tsx
 * Renders a floor plan GeoJSON FeatureCollection on a MapLibre map.
 * Styled to match the app's dark/light theme.
 */

import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { MAP_CONFIG } from '../config';

interface FloorPlanMapProps {
  geojson:  GeoJSON.FeatureCollection;
  center:   [number, number];
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export default function FloorPlanMap({ geojson, center }: FloorPlanMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     MAP_CONFIG.styleUrl,
      center:    center,
      zoom:      19,
      minZoom:   14,
      maxZoom:   22,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      map.addSource('floorplan', {
        type: 'geojson',
        data: EMPTY_FC,
      });

      // Filled rooms / walls (Polygon / MultiPolygon)
      map.addLayer({
        id:     'fp-fill',
        type:   'fill',
        source: 'floorplan',
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: {
          'fill-color':   '#a0a0a0',
          'fill-opacity': 0.12,
        },
      });

      // Outlines for polygons + lines (walls, splines, edges)
      map.addLayer({
        id:     'fp-line',
        type:   'line',
        source: 'floorplan',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']]],
        paint: {
          'line-color': [
            'case',
            // Splines / ellipses: lighter
            ['any',
              ['in', 'AcDbSpline',  ['string', ['get', 'SubClasses'], '']],
              ['in', 'AcDbEllipse', ['string', ['get', 'SubClasses'], '']],
            ],
            '#888888',
            // Filled trace areas: accent colour
            ['in', 'AcDbTrace', ['string', ['get', 'SubClasses'], '']],
            '#b0b0b0',
            // Default wall/line color
            '#d1b179',
          ],
          'line-width': [
            'case',
            ['any',
              ['in', 'AcDbSpline',  ['string', ['get', 'SubClasses'], '']],
              ['in', 'AcDbEllipse', ['string', ['get', 'SubClasses'], '']],
            ],
            0.6,
            1.2,
          ],
          'line-opacity': [
            'case',
            ['any',
              ['in', 'AcDbSpline',  ['string', ['get', 'SubClasses'], '']],
              ['in', 'AcDbEllipse', ['string', ['get', 'SubClasses'], '']],
            ],
            0.55,
            0.85,
          ],
        },
      });

      mapRef.current = map;
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // center is stable (comes from BUILDINGS config), no need to re-run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update GeoJSON data and fit bounds whenever it changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      const src = map.getSource('floorplan') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData(geojson);

      // Fit to the extent of the floor plan features
      if (geojson.features.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        let hasCoords = false;

        const expandBounds = (coords: number[] | number[][] | number[][][] | number[][][][]) => {
          if (typeof coords[0] === 'number') {
            bounds.extend(coords as [number, number]);
            hasCoords = true;
          } else {
            (coords as number[][]).forEach(c => expandBounds(c));
          }
        };

        for (const feature of geojson.features) {
          if (feature.geometry && 'coordinates' in feature.geometry) {
            expandBounds(feature.geometry.coordinates as number[][]);
          }
        }

        if (hasCoords) {
          map.fitBounds(bounds, { padding: 40, duration: 600 });
        }
      }
    };

    if (map.isStyleLoaded()) {
      update();
    } else {
      map.once('load', update);
    }
  }, [geojson]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
