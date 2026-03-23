# UC Navvy — Campus Navigation System

A production-grade indoor/outdoor campus navigation system for the University of Cincinnati, built with vanilla HTML, CSS, and JavaScript. Uses Leaflet.js for mapping and pulls live GeoJSON floorplans from the UC Navvy REST API.

---

## Features

- 🗺️ **Interactive Map** — Leaflet.js with dark CartoDB tiles
- 🏢 **Multi-building Support** — Extensible building registry
- 📐 **Floor Plan Rendering** — Live GeoJSON floorplans per floor, per building
- 🔁 **Route Planning** — Inter- and intra-building routing with turn-by-turn steps
- ♿ **ADA Accessible Routes** — Toggle to restrict to elevator/ramp paths only
- 🔍 **Floor Comparison** — Side-by-side floor overlay mode
- 💾 **Client-side Cache** — Floorplans cached in memory to minimize API calls
- 📱 **Responsive** — Works on desktop and tablet
- 🧩 **Modular JS** — Split into focused ES module-style files

---

## Project Structure

```
uc-navvy/
├── index.html          # App shell
├── README.md
├── css/
│   ├── base.css        # Reset, variables, typography
│   ├── layout.css      # Header, sidebar, map layout
│   ├── components.css  # Cards, buttons, toggles, tabs
│   └── map.css         # Leaflet overrides, legend, badges
├── js/
│   ├── config.js       # Building registry & API config
│   ├── map.js          # Map initialization & tile layers
│   ├── floorplan.js    # GeoJSON fetch, cache, render
│   ├── router.js       # Route planning & step generation
│   ├── ui.js           # Sidebar interactions, toasts, panels
│   └── app.js          # Bootstrap & event binding
└── data/
    └── buildings.json  # Static building metadata fallback
```

---

## API

Floorplans are served from:

```
GET https://uc-navvy-api.onrender.com/api/floorplan/{building}/{floor}
```

**Example:**
```
GET https://uc-navvy-api.onrender.com/api/floorplan/baldwin/4
```

Returns a GeoJSON `FeatureCollection` with `LineString` and `Polygon` features representing architectural elements.

---

## Adding a Building

1. Add an entry to `js/config.js` → `BUILDINGS`:

```js
your_building_key: {
  name: 'Your Building Name',
  coords: [-84.5XXX, 39.1XXX],   // [lng, lat]
  floors: [1, 2, 3],
  accessibleFloors: [1, 2, 3],
  hasElevator: true,
  entranceFloor: 1,
  accessibleEntrance: true,
  apiKey: 'your_building_key',   // matches API route param
}
```

2. Upload GeoJSON files to the API under the same key.

---

## Running Locally

No build step required — pure HTML/CSS/JS.

```bash
# Any static server works:
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

---

## Browser Support

Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

---

## License

University of Cincinnati — Internal Use
