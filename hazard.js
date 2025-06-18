document.addEventListener('DOMContentLoaded', function () {
  const map = L.map('map').setView([39.1317, -84.5158], 16); // UC coordinates

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

    for (const [name, coordinates] of Object.entries(buildingPolygons)) {
    const building = L.polygon(coordinates, {
        className: 'building-polygon'  // Assuming you're using CSS for styling
    }).addTo(map);

    // Optional: Add popup to each building
    building.bindPopup(`<b>${name}</b>`);
    }

    const rhodes_hall = L.polygon([
        [39.133256, -84.516537],
        [39.132565, -84.516420],
        [39.132613, -84.515948],
        [39.133270, -84.515860],
        [39.133333, -84.516069]
    ], {
        className: 'building-polygon'
    });

    rhodes_hall.bindPopup("Rhodes Hall<br>Click here for details");
    rhodes_hall.addTo(map);

    const baldwin_hall = L.polygon([
        [39.133252, -84.516552],
        [39.133219, -84.516983],
        [39.133090, -84.516953],
        [39.133106, -84.516808],
        [39.132973, -84.516786],
        [39.132968, -84.516840],
        [39.132793, -84.516795],
        [39.132802, -84.516737],
        [39.132679, -84.516708],
        [39.132651, -84.516847],
        [39.132506, -84.516811],
        [39.132565, -84.516414],
    ], {
        className: 'building-polygon'
    });

    baldwin_hall.bindPopup("Baldwin Hall<br>Click here for details");
    baldwin_hall.addTo(map);

    const swift_hall = L.polygon([
        [39.132614, -84.517069],
        [39.132394, -84.517017],
        [39.132309, -84.517735],
        [39.132489, -84.517807],
    ], {
        className: 'building-polygon'
    });

    swift_hall.bindPopup("Swift Hall<br>Click here for details");
    swift_hall.addTo(map);

});

