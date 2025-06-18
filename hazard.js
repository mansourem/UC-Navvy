document.addEventListener('DOMContentLoaded', function () {
  const map = L.map('map').setView([39.1317, -84.5158], 16); // Center on UC

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // Fetch building polygons from external JSON file
  fetch('buildings.json')
    .then(response => response.json())
    .then(buildings => {
      buildings.forEach(building => {
        const polygon = L.polygon(building.coordinates, {
          className: 'building-polygon'
        }).addTo(map);

        polygon.bindPopup(`<b>${building.name}</b><br>Click here for details`);
      });
    })
    .catch(error => {
      console.error('Failed to load building data:', error);
    });
});
