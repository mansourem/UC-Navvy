document.addEventListener('DOMContentLoaded', function () {
window.map = L.map('map').setView([39.1317, -84.5158], 16);
  let endMarker = null;
  const buildingMap = {};

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  fetch('buildings.json')
    .then(response => response.json())
    .then(data => {
      const startSelect = document.getElementById('start-building');
      const endSelect = document.getElementById('end-building');

      data.forEach(building => {
        // Create and append dropdown options
        const option1 = document.createElement('option');
        option1.value = building.name;
        option1.textContent = building.name;
        startSelect.appendChild(option1);

        const option2 = option1.cloneNode(true);
        endSelect.appendChild(option2);

        // Add polygon to map
        const polygon = L.polygon(building.coordinates, {
          className: 'building-polygon'
        }).addTo(map);

        polygon.bindPopup(`<b>${building.name}</b><br>Click here for details`);

        // Add to the buildingMap
        buildingMap[building.name] = {
          polygon: polygon,
          center: polygon.getBounds().getCenter(),
          entrance_nodes: building.entrance_nodes || [] // <-- Add this line
        };
      });
console.log("buildingMap:", buildingMap);



      
// Load and display nodes and edges
Promise.all([
  fetch('nodes.json').then(r => r.json()),
  fetch('edges.json').then(r => r.json())
]).then(([nodesData, edgesData]) => {
  // Build a lookup for node positions
  const nodePos = {};
  nodesData.nodes.forEach(node => {
    nodePos[node.node_id] = [node.latitude, node.longitude];

    // Draw node marker with constant size
    const icon = L.divIcon({
      className: 'custom-node-icon',
      iconSize: [8, 8],
      html: `<div style="
        width:8px;height:8px;
        border-radius:50%;
        background:${node.entrance ? 'limegreen' : 'blue'};
        border:2px solid ${node.entrance ? 'limegreen' : 'blue'};
        opacity:0.8;"></div>`
    });
///*
   L.marker([node.latitude, node.longitude], { icon })
      .addTo(map)
      .bindPopup(`<b>${node.node_id}</b><br>Lat: ${node.latitude}<br>Lon: ${node.longitude}${node.entrance ? "<br><b>Entrance</b>" : ""}`)
      .bindTooltip(node.node_id, {permanent: false, direction: "top"}); // for testing node ids, dont need this
       //*/     //this is for displaying nodes for testing.
    });

  // Draw edges
  edgesData.paths.forEach(path => {
    const from = nodePos[path.node];
    if (!from) return;
    Object.keys(path.connections).forEach(toId => {
      const to = nodePos[toId];
      if (to) {
        L.polyline([from, to], {color: 'gray', weight: 2, opacity: 0.7}).addTo(map);
      }
    });
  });
}).catch(error => {
  console.error('Failed to load node/edge data:', error);
});







      // Dropdown change handler for start
      startSelect.addEventListener('change', event => {
        const selected = event.target.value;

        // Remove previous hover style
        Object.values(buildingMap).forEach(obj => {
          obj.polygon.getElement()?.classList.remove('building-hover-start');
        });

        // Add hover style + marker
        const selectedBuilding = buildingMap[selected];
        if (selectedBuilding) {
          selectedBuilding.polygon.getElement()?.classList.add('building-hover-start');

          if (startMarker) {
            startMarker.setLatLng(selectedBuilding.center);
          } else {
            startMarker = L.marker(selectedBuilding.center).addTo(map);
          }
        }
      });

      // Change handler for end
      endSelect.addEventListener('change', event => {
        const selected = event.target.value;

        // Remove previous hover style
        Object.values(buildingMap).forEach(obj => {
          obj.polygon.getElement()?.classList.remove('building-hover-end');
        });

        // Add hover style + marker
        const selectedBuilding = buildingMap[selected];
        if (selectedBuilding) {
          selectedBuilding.polygon.getElement()?.classList.add('building-hover-end');

          if (endMarker) {
            endMarker.setLatLng(selectedBuilding.center);
          } else {
            endMarker = L.marker(selectedBuilding.center).addTo(map);
          }
        }
      });

      // --- Example: How to get entrance nodes for selected buildings ---
      // (You can use this in your route-finding logic)
      window.getSelectedEntrances = function() {
        const start = startSelect.value;
        const end = endSelect.value;
  console.log("Dropdown values:", start, end);
  console.log("buildingMap keys:", Object.keys(buildingMap));
  console.log("buildingMap[start]:", buildingMap[start]);
  console.log("buildingMap[end]:", buildingMap[end]);
        return {
          startEntrances: buildingMap[start]?.entrance_nodes || [],
          endEntrances: buildingMap[end]?.entrance_nodes || []
        };
      };
      // ---------------------------------------------------------------
    })
    .catch(error => {
      console.error('Failed to load building data:', error);
    });
});