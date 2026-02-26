// ============================================================
// Multi-Floor Navigation Interface Controller (scoped)
// ============================================================

(function() {
  // Wrap in IIFE to avoid global variable collisions
  let map;
  let buildingFloorsData;
  let nodesData;
  let buildingMap = {};
//   let currentRoute = null;
  let currentRouteLine = null;

  const UI = {
  startBuilding: document.getElementById('start-building'),
  endBuilding: document.getElementById('end-building'),
  startFloorSelector: document.getElementById('start-floor-selector'),
  endFloorSelector: document.getElementById('end-floor-selector'),
  findRouteBtn: document.getElementById('find-route-btn'),
  clearRouteBtn: document.getElementById('clear-route-btn'),
  swapBtn: document.getElementById('swap-locations'),
  wheelchairCheckbox: document.getElementById('wheelchair-accessible'),
  avoidStairsCheckbox: document.getElementById('avoid-stairs'),
  pathDisplay: document.getElementById('path-display'),
  routeInfoBox: document.getElementById('route-info-box')
};

let selectedFloors = {
  start: null,
  end: null
};

// ============================================================
// INITIALIZATION
// ============================================================

  document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    loadBuildingData();
    setupEventListeners();
  });

function initializeMap() {
  map = L.map('map').setView([39.1317, -84.5158], 16);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  // Expose the internal map for small external helpers
  window._mf_map = map;
}

function loadBuildingData() {
  Promise.all([
    fetch('building_floors.json').then(r => r.json()),
    fetch('nodes.json').then(r => r.json()),
    fetch('edges.json').then(r => r.json())
  ]).then(([floors, nodes, edges]) => {
    buildingFloorsData = floors;
    nodesData = nodes;

    populateBuildingSelects();
    drawFloorPlans();
    console.log('Building data loaded successfully');
  }).catch(error => {
    console.error('Failed to load data:', error);
  });
}

// ============================================================
// UI POPULATION
// ============================================================

function populateBuildingSelects() {
  buildingFloorsData.buildings.forEach(building => {
    const option1 = document.createElement('option');
    option1.value = building.building_id;
    option1.textContent = building.name;
    UI.startBuilding.appendChild(option1);

    const option2 = option1.cloneNode(true);
    UI.endBuilding.appendChild(option2);

    // Store building info
    buildingMap[building.building_id] = building;
  });
}

function updateFloorSelectors() {
  const startBuildingId = UI.startBuilding.value;
  const endBuildingId = UI.endBuilding.value;

  updateFloorButtons(UI.startFloorSelector, startBuildingId, 'start');
  updateFloorButtons(UI.endFloorSelector, endBuildingId, 'end');
}

function updateFloorButtons(selector, buildingId, type) {
  selector.innerHTML = '';

  if (!buildingId) return;

  const building = buildingMap[buildingId];
  if (!building) return;

  building.floors.forEach(floor => {
    const btn = document.createElement('button');
    btn.textContent = floor.floor_name;
    btn.dataset.floorId = floor.floor_id;
    btn.addEventListener('click', () => selectFloor(btn, type));
    
    if (selectedFloors[type] === floor.floor_id) {
      btn.classList.add('active');
    }
    
    selector.appendChild(btn);
  });

  // Auto-select first floor if none selected
  if (!selectedFloors[type] && building.floors.length > 0) {
    const firstFloorBtn = selector.querySelector('button');
    if (firstFloorBtn) {
      selectFloor(firstFloorBtn, type);
    }
  }
}

function selectFloor(btn, type) {
  const selector = type === 'start' ? UI.startFloorSelector : UI.endFloorSelector;
  
  // Remove active from all buttons in this selector
  selector.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  
  // Add active to clicked button
  btn.classList.add('active');
  
  // Update selected floor
  selectedFloors[type] = btn.dataset.floorId;
}

// ============================================================
// DRAWING FLOOR PLANS
// ============================================================

function drawFloorPlans() {
  buildingFloorsData.buildings.forEach(building => {
    building.floors.forEach(floor => {
      if (floor.geojson && floor.geojson.geometry) {
        const geoJsonLayer = L.geoJSON(floor.geojson, {
          style: {
            color: '#0066cc',
            weight: 2,
            opacity: 0.5,
            fillOpacity: 0.1
          },
          onEachFeature: (feature, layer) => {
            layer.bindPopup(`
              <b>${building.name}</b><br>
              ${floor.floor_name}<br>
              <small>ID: ${floor.floor_id}</small>
            `);
          }
        }).addTo(map);

        // Store for later reference
        if (!buildingMap[building.building_id].geoJsonLayers) {
          buildingMap[building.building_id].geoJsonLayers = {};
        }
        buildingMap[building.building_id].geoJsonLayers[floor.floor_id] = geoJsonLayer;
      }
    });
  });
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function setupEventListeners() {
  UI.startBuilding.addEventListener('change', updateFloorSelectors);
  UI.endBuilding.addEventListener('change', updateFloorSelectors);
  
  UI.findRouteBtn.addEventListener('click', findAndDrawRoute);
  UI.clearRouteBtn.addEventListener('click', clearRoute);
  UI.swapBtn.addEventListener('click', swapLocations);
}

function swapLocations() {
  // Swap buildings
  const temp = UI.startBuilding.value;
  UI.startBuilding.value = UI.endBuilding.value;
  UI.endBuilding.value = temp;

  // Swap floors
  const tempFloor = selectedFloors.start;
  selectedFloors.start = selectedFloors.end;
  selectedFloors.end = tempFloor;

  // Update UI
  updateFloorSelectors();
}

// ============================================================
// ROUTING LOGIC
// ============================================================

function findAndDrawRoute() {
  const startBuildingId = UI.startBuilding.value;
  const endBuildingId = UI.endBuilding.value;
  const startFloor = selectedFloors.start;
  const endFloor = selectedFloors.end;

  if (!startBuildingId || !endBuildingId || !startFloor || !endFloor) {
    alert('Please select both start and end locations with floors');
    return;
  }

  if (!window.MultiFloorRouter) {
    alert('Routing system not loaded');
    return;
  }

  // Get entrance nodes for start and end
  const startBuilding = buildingMap[startBuildingId];
  const endBuilding = buildingMap[endBuildingId];

  // Find entrance node for start location
  let startNode = null;
  const startEntrance = startBuilding.entrances.find(e => e.floor_id === startFloor);
  if (startEntrance) {
    startNode = startEntrance.node_id;
  } else {
    // Use first available entrance
    startNode = startBuilding.entrances[0]?.node_id;
  }

  // Find entrance node for end location
  let endNode = null;
  const endEntrance = endBuilding.entrances.find(e => e.floor_id === endFloor);
  if (endEntrance) {
    endNode = endEntrance.node_id;
  } else {
    // Use first available entrance
    endNode = endBuilding.entrances[0]?.node_id;
  }

  if (!startNode || !endNode) {
    alert('Could not find entrance nodes');
    return;
  }

  // Find the complete path
  const path = window.MultiFloorRouter.findCompletePath(
    startBuildingId, startFloor, startNode,
    endBuildingId, endFloor, endNode
  );

  if (!path) {
    alert('No route found between selected locations');
    return;
  }

  // Format and display path
  const formattedPath = window.MultiFloorRouter.formatPathForDisplay(path);
  const distance = window.MultiFloorRouter.calculatePathDistance(path);

  displayRoute(formattedPath, distance);
  drawRouteOnMap(path);
}

function displayRoute(formattedPath, distance) {
  currentRoute = formattedPath;

  // Update info box
  const distanceInMeters = distance.toFixed(0);
  const estimatedTime = Math.ceil(distance / 1.4 / 60); // Assuming 5 km/h walking speed
  
  UI.routeInfoBox.innerHTML = `
    <strong>Route Found!</strong><br>
    Distance: ${distanceInMeters}m<br>
    Est. Time: ${estimatedTime} min
  `;
  UI.routeInfoBox.style.display = 'block';

  // Display path segments
  UI.pathDisplay.innerHTML = '';
  UI.pathDisplay.style.display = 'block';

  formattedPath.forEach((segment, index) => {
    const div = document.createElement('div');
    div.className = 'path-segment';
    
    let content = `<div class="segment-building">① ${segment.building_name}</div>`;
    content += `<div class="segment-floor">${segment.floor_name}</div>`;
    content += `<div class="segment-coords">Node: ${segment.node_id}</div>`;
    
    if (index < formattedPath.length - 1) {
      const nextSegment = formattedPath[index + 1];
      if (nextSegment.building_name !== segment.building_name) {
        content += `<div style="color: #ff6600; margin-top: 3px;">→ Proceed to ${nextSegment.building_name}</div>`;
      } else if (nextSegment.floor_name !== segment.floor_name) {
        content += `<div style="color: #ff6600; margin-top: 3px;">→ Go to ${nextSegment.floor_name}</div>`;
      }
    }
    
    div.innerHTML = content;
    UI.pathDisplay.appendChild(div);
  });
}

function drawRouteOnMap(path) {
  // Remove previous route
  if (currentRouteLine) {
    map.removeLayer(currentRouteLine);
  }

  if (!nodesData) return;

  const latlngs = path.map(([nodeId, floorId]) => {
    const node = nodesData.nodes.find(n => n.node_id === nodeId);
    if (node) return [node.latitude, node.longitude];
  }).filter(coord => coord != null);

  if (latlngs.length > 0) {
    currentRouteLine = L.polyline(latlngs, {
      color: '#ff0000',
      weight: 4,
      opacity: 0.8,
      dashArray: '5, 5'
    }).addTo(map);

    // Fit map to route
    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { padding: [50, 50] });

    // Add markers for start and end
    if (latlngs.length > 0) {
      L.circleMarker(latlngs[0], {
        radius: 8,
        fillColor: '#00aa00',
        color: '#006600',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(map).bindPopup('Start');

      L.circleMarker(latlngs[latlngs.length - 1], {
        radius: 8,
        fillColor: '#ff0000',
        color: '#cc0000',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(map).bindPopup('Destination');
    }
  }
}

function clearRoute() {
  if (currentRouteLine) {
    map.removeLayer(currentRouteLine);
    currentRouteLine = null;
  }

  UI.pathDisplay.innerHTML = '';
  UI.pathDisplay.style.display = 'none';
  UI.routeInfoBox.style.display = 'none';
  currentRoute = null;
}

// Expose small helpers so external demo scripts can request drawing
window._mf_drawRoute = function(path) {
  try {
    drawRouteOnMap(path);
  } catch (e) {
    console.error('Failed to draw route via helper', e);
  }
};

window._mf_clearRoute = function() {
  try {
    clearRoute();
  } catch (e) {
    console.error('Failed to clear route via helper', e);
  }
};

// ============================================================
// Initialize on page load
// ============================================================

  document.addEventListener('DOMContentLoaded', function() {
    // Initial floor selector update
    setTimeout(() => {
      if (UI.startBuilding.options.length > 1) {
        UI.startBuilding.selectedIndex = 1;
        UI.startBuilding.dispatchEvent(new Event('change'));
      }
      if (UI.endBuilding.options.length > 1) {
        UI.endBuilding.selectedIndex = 1;
        UI.endBuilding.dispatchEvent(new Event('change'));
      }
    }, 1000);
  });

})();
