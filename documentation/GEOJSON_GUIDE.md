# GeoJSON Floor Plan Integration Guide

## Overview

This guide explains how to create and integrate GeoJSON floor plan outlines for your campus buildings into the UC-Navvy navigation system.

## What is GeoJSON?

GeoJSON is a format for encoding geographic data structures:

```json
{
  "type": "Feature",
  "properties": {
    "name": "Building Name - Floor"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [[lat, lon], [lat, lon], [lat, lon], ...]
    ]
  }
}
```

**Key Parts:**
- `type`: Always "Feature" for individual floor plans
- `properties`: Metadata (name, floor ID, etc.)
- `geometry.type`: "Polygon" for building outlines
- `geometry.coordinates`: Array of [latitude, longitude] pairs

## Getting Floor Plan Coordinates

### Method 1: Google Earth (Recommended for Most Users)

**Tools you need:**
- Google Earth (free desktop or web version)
- Google Earth: https://earth.google.com

**Steps:**

1. **Open Google Earth and find your building**
   - Search for your building by address
   - Zoom to see the building clearly

2. **Use the Ruler Tool**
   - Click "Tools" → "Measure"
   - Click at one corner of the building
   - Click at the next corner (continues drawing)
   - Click at each corner to trace the building outline
   - Double-click to finish

3. **Record the Coordinates**
   - After placing each point, Google Earth shows lat/lon
   - Record all corner coordinates as you go
   - Format: [latitude, longitude]

4. **Create your GeoJSON coordinate array**
   ```javascript
   "coordinates": [
     [39.13350, -84.51550],  // Corner 1
     [39.13300, -84.51550],  // Corner 2
     [39.13300, -84.51650],  // Corner 3
     [39.13350, -84.51650],  // Corner 4
     [39.13350, -84.51550]   // Back to Corner 1 (MUST CLOSE)
   ]
   ```

### Method 2: GeoJSON.io (Best for Creating Polygons)

**Website:** https://geojson.io

**Steps:**

1. **Open geojson.io**
   - Click the globe 🌍 icon to find your campus
   - Search for your building address

2. **Draw your building outline**
   - Click the polygon tool (usually left toolbar)
   - Click at each corner of your building
   - Double-click at the last corner to close
   - Or press Escape after clicking last point

3. **Export as GeoJSON**
   - Right-click the feature
   - Select "Export as GeoJSON"
   - The coordinates are automatically formatted

4. **Copy the coordinates**
   ```javascript
   "coordinates": [
     [
       [lon, lat],  // Note: GeoJSON uses [lon, lat]
       [lon, lat],
       [lon, lat],
       [lon, lat],
       [lon, lat]   // Must close
     ]
   ]
   ```

   **⚠️ IMPORTANT:** GeoJSON.io uses [longitude, latitude] but our system uses [latitude, longitude]. You must **swap them**:

   - GeoJSON.io: `[[-84.5155, 39.1335], [-84.5155, 39.1330], ...]`
   - UC-Navvy: `[[39.1335, -84.5155], [39.1330, -84.5155], ...]`

### Method 3: OpenStreetMap (Free Alternative)

**Website:** https://www.openstreetmap.org

**Steps:**

1. Search for your building
2. Browse the map to identify building outline
3. Use your browser's developer tools to identify coordinates
4. Or use JOSM (Java OpenStreetMap Editor) to trace building

### Method 4: From CAD/Floor Plan Files

If you have DXG, PDF, or image files:

1. **Using QGIS** (Free GIS Software)
   - Import your floor plan as raster image
   - Georeferenced it to campus coordinates
   - Use digitizing tools to trace building outline
   - Export as GeoJSON

2. **Contact your facilities department**
   - Most universities have building plans in digital format
   - May already have coordinates available

## Structuring Your Floor Plans

### Single Floor Building

```json
{
  "building_id": "simple_building",
  "name": "Simple Building",
  "coordinates": [
    [39.1335, -84.5155],
    [39.1330, -84.5155],
    [39.1330, -84.5165],
    [39.1335, -84.5165]
  ],
  "floors": [
    {
      "floor_id": "simple_b_ground",
      "floor_name": "Ground Floor",
      "floor_number": 0,
      "elevation_m": 0,
      "geojson": {
        "type": "Feature",
        "properties": {
          "name": "Simple Building - Ground Floor",
          "floor_id": "simple_b_ground"
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [39.1335, -84.5155],
              [39.1330, -84.5155],
              [39.1330, -84.5165],
              [39.1335, -84.5165],
              [39.1335, -84.5155]
            ]
          ]
        }
      }
    }
  ]
}
```

### Multi-Floor Building (All Floors Same Footprint)

For buildings where all floors have the same footprint polygons:

```json
{
  "floors": [
    {
      "floor_id": "building_ground",
      "floor_number": 0,
      "elevation_m": 0,
      "geojson": {
        "geometry": {
          "coordinates": [[lat,lon], [lat,lon], ...]
        }
      }
    },
    {
      "floor_id": "building_1",
      "floor_number": 1,
      "elevation_m": 3.5,
      "geojson": {
        "geometry": {
          "coordinates": [[lat,lon], [lat,lon], ...]
        }
      }
    }
  ]
}
```

### Multi-Floor Building (Different Footprints Per Floor)

Some buildings have different footprints on each floor (setbacks, courtyards, etc.):

```json
{
  "floors": [
    {
      "floor_id": "building_ground",
      "geojson": {
        "geometry": {
          "coordinates": [
            [
              [39.1336, -84.5154],
              [39.1329, -84.5154],
              [39.1329, -84.5166],
              [39.1336, -84.5166],
              [39.1336, -84.5154]
            ]
          ]
        }
      }
    },
    {
      "floor_id": "building_1",
      "geojson": {
        "geometry": {
          "coordinates": [
            [
              [39.1335, -84.5155],
              [39.1330, -84.5155],
              [39.1330, -84.5165],
              [39.1335, -84.5165],
              [39.1335, -84.5155]
            ]
          ]
        }
      }
    }
  ]
}
```

## Coordinate System Reference

### Decimal Degrees Format

Our system uses **decimal degrees** with:
- **Latitude**: -90 to +90 (N/S)
- **Longitude**: -180 to +180 (E/W)

**Example for University of Cincinnati:**
- Latitude: ~39.13° N
- Longitude: ~-84.51° W

### Converting Other Formats

**Degrees, Minutes, Seconds (DMS) to Decimal:**
```
39° 08' 00" N = 39 + (8/60) + (0/3600) = 39.1333°
84° 30' 00" W = -(84 + (30/60)) = -84.5°
```

**Tools:**
- https://www.latlong.net/
- Google Maps (right-click → coordinates)

## Coordinate Accuracy Guidelines

| Use Case | Accuracy | Notes |
|----------|----------|-------|
| Building Outline | ±5 meters | Sufficient for navigation |
| Room-level | ±1 meter | For detailed indoor plans |
| Campus Overview | ±50 meters | For high-level routing |

## Common Issues & Solutions

### Issue: Polygon doesn't show on map

**Cause:** Coordinates are not closed (first ≠ last)

**Solution:**
```javascript
// WRONG - doesn't close
"coordinates": [[39.1, -84.5], [39.2, -84.5], [39.2, -84.6]]

// CORRECT - closes polygon
"coordinates": [[39.1, -84.5], [39.2, -84.5], [39.2, -84.6], [39.1, -84.5]]
```

### Issue: Polygon shows but is the wrong shape

**Cause:** Coordinates are out of order (must trace building perimeter)

**Solution:**
- Trace building outline in order (clockwise or counterclockwise, not mixed)
- Each successive point should be adjacent to previous

### Issue: Coordinates swapped/reversed

**Cause:** [lon, lat] instead of [lat, lon] (or vice versa)

**Solution:**
- UC-Navvy expects: `[latitude, longitude]`
- If using GeoJSON.io: swap the pairs
- Verify first point makes geographic sense

### Issue: Floor plan polygon is inside out

**Cause:** Ring order (CCW vs CW)

**Solution:**
- Either order works for simple polygons
- For complex polygons with holes, outer ring is CCW, holes are CW

## Validating Your GeoJSON

### Online Validator

Use https://geojsonlint.com to validate syntax:

1. Copy your GeoJSON
2. Paste into geojsonlint.com
3. Get errors highlighted if invalid

### Manual Validation Checklist

- [ ] `type` is "Feature"
- [ ] `geometry.type` is "Polygon"
- [ ] `coordinates` is an array
- [ ] Each point is `[latitude, longitude]`
- [ ] First point equals last point
- [ ] Latitude values between -90 and 90
- [ ] Longitude values between -180 and 180
- [ ] All necessary commas and brackets present

### Visual Validation

1. Add to `building_floors.json`
2. Open `multi_floor_navigation.html` in browser
3. Floor plans should appear on map as blue polygons
4. Click on polygon to see property details

## Performance Tips

### Simplify Coordinates

Too many waypoints makes the system slow. Use fewer points:

**Complex building:** 50+ coordinate points
**For navigation:** 4-8 points (corners only) usually sufficient

Use https://mapshaper.org to simplify:
1. Upload GeoJSON
2. Adjust "simplify" slider
3. Download simplified version

### Remove Unnecessary Detail

Save only the building outline:
- Don't include interior walls
- Don't include furniture
- Don't include property boundaries beyond building

### Coordinate Precision

Reduce precision for faster processing:

```javascript
// BLOATED - Too many decimal places
[39.133492832849, -84.516392839432]

// EFFICIENT - Sufficient precision
[39.1335, -84.5164]

// For large campus
[39.133, -84.516]
```

## Examples

### Simple Building (4 corners)

```json
"coordinates": [
  [39.1340, -84.5150],
  [39.1320, -84.5150],
  [39.1320, -84.5170],
  [39.1340, -84.5170],
  [39.1340, -84.5150]
]
```

### L-Shaped Building (8 corners)

```json
"coordinates": [
  [39.1340, -84.5150],
  [39.1335, -84.5150],
  [39.1335, -84.5155],
  [39.1320, -84.5155],
  [39.1320, -84.5170],
  [39.1340, -84.5170],
  [39.1340, -84.5150]
]
```

### Building with Courtyard (Polygon with hole)

```json
"coordinates": [
  [
    [39.1340, -84.5150],
    [39.1320, -84.5150],
    [39.1320, -84.5170],
    [39.1340, -84.5170],
    [39.1340, -84.5150]
  ],
  [
    [39.1333, -84.5160],
    [39.1327, -84.5160],
    [39.1327, -84.5165],
    [39.1333, -84.5165],
    [39.1333, -84.5160]
  ]
]
```

## Next Steps

1. **Collect building coordinates** using one of the methods above
2. **Create GeoJSON features** for each floor
3. **Add to building_floors.json** in your building entry
4. **Validate** using geojsonlint.com
5. **Test** by opening multi_floor_navigation.html
6. **Adjust elevation_m** values for each floor

## Tools Reference

| Tool | URL | Purpose |
|------|-----|---------|
| Google Earth | earth.google.com | Finding coordinates |
| GeoJSON.io | geojson.io | Creating/editing GeoJSON |
| GeoJSON Lint | geojsonlint.com | Validating GeoJSON |
| Leaflet | leafletjs.com | Map display (already used) |
| MapShaper | mapshaper.org | Simplifying coordinates |
| LatLong.net | latlong.net | Format conversion |

## Support & Resources

- **GeoJSON Specification**: https://geojson.org/
- **RFC 7946**: https://tools.ietf.org/html/rfc7946
- **Leaflet Documentation**: https://leafletjs.com/
- **OpenStreetMap**: https://www.openstreetmap.org/

---

**Ready to add your floor plans?** Start with a single building and test, then expand to your entire campus! 🗺️
