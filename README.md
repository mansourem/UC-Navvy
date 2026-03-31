# UC Navvy — Campus Navigation System

A production-grade indoor/outdoor campus navigation system for the University of Cincinnati, built with React, TypeScript, and Vite. Uses MapLibre GL for mapping and supports both web and native mobile (iOS/Android) via Capacitor.

---

## Features

- **Interactive Map** — MapLibre GL with campus tile layers
- **Multi-building Support** — Extensible building registry
- **Floor Plan Rendering** — GeoJSON floorplans per floor, per building
- **Route Planning** — Inter- and intra-building routing with turn-by-turn steps
- **ADA Accessible Routes** — Toggle to restrict to elevator/ramp paths only
- **Client-side Cache** — Floorplans cached in memory to minimize API calls
- **Responsive** — Works on desktop, tablet, and mobile
- **Native Mobile** — iOS and Android apps via Capacitor

---

## Project Structure

```
UC-Navvy/
├── src/                    # Shared source (React + TypeScript)
│   ├── main.tsx            # App entry point
│   ├── App.tsx             # Root component
│   ├── router.ts           # Route planning logic
│   ├── graph.ts            # Graph traversal / pathfinding
│   ├── config.ts           # Building registry & app config
│   ├── components/
│   │   ├── NavvyMap.tsx    # MapLibre GL map component
│   │   └── Sidebar.tsx     # Route planner sidebar
│   ├── css/
│   │   ├── base.css        # Reset, variables, typography
│   │   ├── layout.css      # Header, sidebar, map layout
│   │   ├── components.css  # Cards, buttons, toggles
│   │   └── map.css         # MapLibre overrides, legend, badges
│   ├── data/
│   │   └── graphs/         # GeoJSON graph files per building
│   └── js/                 # Legacy JS utilities
├── web/
│   └── index.html          # Web entry point
├── mobile/
│   ├── android/            # Android native project
│   └── ios/                # iOS native project
├── capacitor.config.ts     # Capacitor configuration
├── vite.config.ts          # Vite build configuration
├── tsconfig.json
└── package.json
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 18 + TypeScript |
| Build | Vite |
| Maps | MapLibre GL |
| Mobile | Capacitor (iOS / Android) |

---

## Running Locally

```bash
npm install
npm run dev       # starts Vite dev server
```

Then open `http://localhost:5173`.

---

## Building

```bash
npm run build     # TypeScript compile + Vite build → dist/
npm run preview   # Preview the production build locally
```

---

## Mobile

Needs to be built first

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android # If using for
npm run build                                                 # the first
npx cap add android                                           # time
npx cap sync android # Sync chnages after every change to web build 

npm run android   # Build and open in Android Studio
npm run ios       # Build and open in Xcode
```

Requires Android Studio (Android) or Xcode (iOS) to be installed.

---

## Adding a Building

1. Add an entry to [src/config.ts](src/config.ts):

```ts
your_building_key: {
  name: 'Your Building Name',
  coords: [-84.5XXX, 39.1XXX],   // [lng, lat]
  floors: [1, 2, 3],
  accessibleFloors: [1, 2, 3],
  hasElevator: true,
  entranceFloor: 1,
  accessibleEntrance: true,
}
```

2. Add a GeoJSON graph file to [src/data/graphs/](src/data/graphs/).

---

## Browser Support

Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

---

## License

University of Cincinnati — Internal Use
