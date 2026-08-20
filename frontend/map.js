(function () {
  let map = null;
  let routeLine = null;
  let originMarker = null;
  let packageMarker = null;
  let destinationMarker = null;
  let lastPackageLatLng = null;

  function initializeMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl || typeof window.L === 'undefined') return;

    // Check if map container is already initialized
    if (mapEl._leaflet_id) {
      mapEl._leaflet_id = null;
    }

    // Initialize map and save instance to scoped variable
    map = window.L.map('map').setView([4.0511, 9.7679], 4);

    window.GM = window.GM || {};
    window.GM.map = map;
    window.map = map;

    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
  }

  function clearRoute() {
    if (routeLine) {
      map.removeLayer(routeLine);
      routeLine = null;
    }
  }

  function clearFixedMarkers() {
    [originMarker, destinationMarker].forEach((marker) => {
      if (marker && map) {
        map.removeLayer(marker);
      }
    });
    originMarker = null;
    destinationMarker = null;
  }

  function clearPackageMarker() {
    if (packageMarker && map) {
      map.removeLayer(packageMarker);
    }
    packageMarker = null;
    lastPackageLatLng = null;
  }

  function createCircleMarker(coords, options) {
    return window.L.circleMarker([coords.lat, coords.lng], options).addTo(map);
  }

  function isShipmentMovingStatus(status) {
    if (!status) return false;
    const normalized = status.toLowerCase();
    const movingKeywords = ['in transit', 'out for delivery', 'enroute', 'arriving soon', 'picked up', 'on the way', 'moving', 'departed', 'shipped'];
    return movingKeywords.some((keyword) => normalized.includes(keyword));
  }

  function createPackageIcon(status) {
    const isMoving = isShipmentMovingStatus(status);
    return window.L.icon({
      iconUrl: 'imges/package%20indicator.png',
      iconRetinaUrl: 'imges/package%20indicator.png',
      className: `package-tracking-icon ${isMoving ? 'is-moving' : 'is-paused'}`,
      iconSize: [52, 52],
      iconAnchor: [26, 26],
      popupAnchor: [0, -14]
    });
  }

  function createPackageMarker(coords, popupText, status) {
    const marker = window.L.marker([coords.lat, coords.lng], {
      icon: createPackageIcon(status),
      riseOnHover: true
    }).addTo(map);

    if (popupText) {
      marker.bindPopup(popupText).openPopup();
    }

    return marker;
  }

  function animateMarkerMovement(marker, fromCoords, toCoords, duration = 900) {
    if (!marker || !fromCoords || !toCoords || duration <= 0) {
      marker.setLatLng([toCoords.lat, toCoords.lng]);
      return;
    }

    const start = performance.now();
    const startLat = fromCoords.lat;
    const startLng = fromCoords.lng;
    const deltaLat = toCoords.lat - startLat;
    const deltaLng = toCoords.lng - startLng;

    function step(timestamp) {
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      const nextLat = startLat + deltaLat * progress;
      const nextLng = startLng + deltaLng * progress;
      marker.setLatLng([nextLat, nextLng]);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    }

    window.requestAnimationFrame(step);
  }

  function updateMapFromShipment(shipment) {
    if (!map) return;

    clearRoute();
    clearFixedMarkers();

    const origin = shipment.coordinates?.origin;
    const current = shipment.coordinates?.currentLocation;
    const destination = shipment.coordinates?.destination;
    const bounds = window.L.latLngBounds([]);

    if (origin?.lat != null && origin?.lng != null) {
      originMarker = createCircleMarker(origin, {
        radius: 8,
        color: '#1f77b4',
        fillColor: '#1f77b4',
        fillOpacity: 0.9,
        weight: 2
      }).bindPopup('<strong>Pickup Location</strong>');
      bounds.extend([origin.lat, origin.lng]);
    }

    if (destination?.lat != null && destination?.lng != null) {
      destinationMarker = createCircleMarker(destination, {
        radius: 8,
        color: '#d74d4d',
        fillColor: '#d74d4d',
        fillOpacity: 0.9,
        weight: 2
      }).bindPopup('<strong>Destination Location</strong>');
      bounds.extend([destination.lat, destination.lng]);
    }

    if (origin && destination) {
      routeLine = window.L.polyline([
        [origin.lat, origin.lng],
        [destination.lat, destination.lng]
      ], {
        color: '#2b70d9',
        weight: 3,
        opacity: 0.9,
        smoothFactor: 1.2
      }).addTo(map);
      bounds.extend([origin.lat, origin.lng]);
      bounds.extend([destination.lat, destination.lng]);
    }

    if (current?.lat != null && current?.lng != null) {
      const currentCoords = { lat: current.lat, lng: current.lng };
      const lastUpdated = shipment.timeline && shipment.timeline.length
        ? (shipment.timeline[shipment.timeline.length - 1].time || shipment.timeline[shipment.timeline.length - 1].date || 'Recently updated')
        : 'Recently updated';
      const currentLocationName = shipment.currentLocationName || shipment.currentPackageLocation || shipment.currentLocation || 'Current location unavailable';
      const popupText = `
        <div class="shipment-map-popup">
          <div class="shipment-map-popup__title">Package Location</div>
          <div class="shipment-map-popup__status">${shipment.status || 'In Transit'}</div>
          <div class="shipment-map-popup__label">Current Location</div>
          <div class="shipment-map-popup__value">${currentLocationName}</div>
          <div class="shipment-map-popup__label">Last Updated</div>
          <div class="shipment-map-popup__value">${lastUpdated}</div>
        </div>
      `;
      const moving = isShipmentMovingStatus(shipment.status);

      if (packageMarker && lastPackageLatLng) {
        packageMarker.setIcon(createPackageIcon(shipment.status));
        if (packageMarker.getPopup && packageMarker.getPopup()) {
          packageMarker.setPopupContent(popupText);
        }
        if (moving) {
          animateMarkerMovement(packageMarker, lastPackageLatLng, currentCoords);
        } else {
          packageMarker.setLatLng([currentCoords.lat, currentCoords.lng]);
        }
      } else if (packageMarker) {
        packageMarker.setIcon(createPackageIcon(shipment.status));
        packageMarker.setLatLng([currentCoords.lat, currentCoords.lng]);
        if (packageMarker.getPopup && packageMarker.getPopup()) {
          packageMarker.setPopupContent(popupText);
        }
      } else {
        packageMarker = createPackageMarker(currentCoords, popupText, shipment.status);
      }

      lastPackageLatLng = currentCoords;
      bounds.extend([current.lat, current.lng]);
    } else if (packageMarker) {
      map.removeLayer(packageMarker);
      packageMarker = null;
      lastPackageLatLng = null;
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.12));
    } else if (current?.lat != null && current?.lng != null) {
      map.setView([current.lat, current.lng], 10);
    }
  }

  // Auto-initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
  });

  // Expose functions globally if needed by other scripts
  window.initializeMap = initializeMap;
  window.GM = window.GM || {};
  window.GM.updateMapFromShipment = updateMapFromShipment;
})();
