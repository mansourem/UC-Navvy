document.addEventListener('DOMContentLoaded', function () {
  const map = L.map('map').setView([39.1317, -84.5158], 16);
  let startMarker = null;
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
          center: polygon.getBounds().getCenter()
        };
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
    })
    .catch(error => {
      console.error('Failed to load building data:', error);
    });
});
