console.log("hazard.js loaded");
document.addEventListener('DOMContentLoaded', function () {
  const map = L.map('map').setView([39.1317, -84.5158], 16); // Center on UC

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  console.log("added tile layer")

  // Load buildings
  fetch('buildings.json')
    .then(response => response.json())
    .then(buildings => {
      buildings.forEach(building => {
        const polygon = L.polygon(building.coordinates, {
          className: 'building-polygon'
        }).addTo(map);

        polygon.bindPopup(`<b>${building.name}</b><br>Click here for details`);
        console.log("building clicked")
      });
    })
    .catch(error => {
      console.error('Failed to load building data:', error);
    });
    console.log("added buildings")
/*
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

    L.marker([node.latitude, node.longitude], { icon })
      .addTo(map)
      .bindPopup(`<b>${node.node_id}</b><br>Lat: ${node.latitude}<br>Lon: ${node.longitude}${node.entrance ? "<br><b>Entrance</b>" : ""}`)
      .bindTooltip(node.node_id, {permanent: false, direction: "top"}); // for testing node ids, dont need this
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

*/








    let hazardMarker = null;
    let hazardCircle = null;

    map.on('click', function (e) 
    {
        const severityInput = document.getElementById('hazard-severity');
        const severity = parseInt(severityInput.value);

        if (isNaN(severity)) {
            alert('Please select a severity before placing a hazard.');
            return;
        }

        const severityRadius = {
            0: 3,  // mostly walkable
            1: 10,
            2: 25   // not walkable at all
        };

        const radius = severityRadius[severity] || 10;
        const latlng = e.latlng;

        if (!hazardMarker) {
            // First time: create new marker and circle
            hazardMarker = L.marker(latlng, {
            title: "Hazard Location"
            }).addTo(map);

            hazardCircle = L.circle(latlng, {
            radius: radius,
            color: 'cadetblue',
            fillColor: 'cadetblue',
            fillOpacity: 0.4
            }).addTo(map);
        } else {
            // Move the existing marker and circle
            hazardMarker.setLatLng(latlng);
            hazardCircle.setLatLng(latlng);
            hazardCircle.setRadius(radius); // In case severity changed
        }
    });
});
