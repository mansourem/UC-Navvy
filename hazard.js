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
