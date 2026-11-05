(function () {
  let map = null;
  let routeLines = [];
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
    routeLines.forEach((routeLine) => map.removeLayer(routeLine));
    routeLines = [];
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

  function createRouteMarker(coords, type, label) {
    return window.L.marker([coords.lat, coords.lng], {
      icon: window.L.divIcon({
        className: 'route-map-marker-shell',
        html: `<span class="route-map-marker route-map-marker--${type}" aria-label="${label}">${type === 'origin' ? 'O' : type === 'destination' ? 'D' : '✓'}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      })
    }).addTo(map).bindPopup(`<strong>${label}</strong>`);
  }

  function addRouteLine(points, className, color, dashArray = null) {
    if (points.length < 2) return;
    const line = window.L.polyline(points, {
      className,
      color,
      weight: 5,
      opacity: 0.9,
      dashArray,
      lineCap: 'round'
    }).addTo(map);
    routeLines.push(line);
  }

  function isDeliveredStatus(status) {
    return String(status || '').toLowerCase().includes('delivered');
  }

  function isShipmentMovingStatus(status) {
    if (!status) return false;
    const normalized = status.toLowerCase();
    const movingKeywords = ['in transit', 'out for delivery', 'enroute', 'arriving soon', 'picked up', 'on the way', 'moving', 'departed', 'shipped'];
    return movingKeywords.some((keyword) => normalized.includes(keyword));
  }

  function escapeMapHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getLocationName(...values) {
    const coordinatesPattern = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/;
    return values.find((value) => (
      typeof value === 'string' && value.trim() && !coordinatesPattern.test(value)
    ))?.trim() || 'Location name unavailable';
  }

  function createPackageIcon(status) {
    const isMoving = isShipmentMovingStatus(status);
    const normalized = String(status || '').toLowerCase();
    const statusClass = normalized.includes('delivered') ? 'status-delivered'
      : normalized.includes('out for delivery') ? 'status-out-for-delivery'
        : normalized.includes('hold') ? 'status-on-hold'
          : normalized.includes('exception') || normalized.includes('delayed') || normalized.includes('returned') || normalized.includes('cancel') ? 'status-exception'
            : normalized.includes('processing') ? 'status-processing'
              : normalized.includes('pending') || normalized.includes('order received') || normalized.includes('label') ? 'status-pending'
                : 'status-in-transit';
    return window.L.divIcon({
      className: 'package-marker-wrapper',
      html: `<span class="package-map-marker ${statusClass} ${isMoving ? 'is-active' : 'is-paused'}" aria-label="${escapeMapHtml(status || 'Shipment')} location"></span>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -12]
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
      originMarker = createRouteMarker(origin, 'origin', 'Origin');
      bounds.extend([origin.lat, origin.lng]);
    }

    if (destination?.lat != null && destination?.lng != null) {
      destinationMarker = createRouteMarker(destination, isDeliveredStatus(shipment.status) ? 'delivered' : 'destination', isDeliveredStatus(shipment.status) ? 'Delivered destination' : 'Destination');
      bounds.extend([destination.lat, destination.lng]);
    }

    const hasCurrent = current?.lat != null && current?.lng != null;
    const moving = isShipmentMovingStatus(shipment.status);
    if (origin && destination && isDeliveredStatus(shipment.status)) {
      addRouteLine([[origin.lat, origin.lng], [destination.lat, destination.lng]], 'route-line route-line--complete', '#239653');
    } else if (origin && destination && hasCurrent) {
      addRouteLine([[origin.lat, origin.lng], [current.lat, current.lng]], 'route-line route-line--complete', '#239653');
      addRouteLine(
        [[current.lat, current.lng], [destination.lat, destination.lng]],
        `route-line ${moving ? 'route-line--active' : 'route-line--upcoming'}`,
        moving ? '#08a6d8' : '#9aa8b8',
        moving ? '10 10' : '5 8'
      );
    } else if (origin && destination) {
      addRouteLine(
        [[origin.lat, origin.lng], [destination.lat, destination.lng]],
        `route-line ${moving ? 'route-line--active' : 'route-line--upcoming'}`,
        moving ? '#08a6d8' : '#9aa8b8',
        moving ? '10 10' : '5 8'
      );
    }

    if (current?.lat != null && current?.lng != null) {
      const currentCoords = { lat: current.lat, lng: current.lng };
      const lastUpdated = shipment.timeline && shipment.timeline.length
        ? (shipment.timeline[shipment.timeline.length - 1].time || shipment.timeline[shipment.timeline.length - 1].date || 'Recently updated')
        : 'Recently updated';
      const currentLocationName = getLocationName(
        shipment.currentLocationName,
        shipment.currentPackageLocation,
        shipment.currentLocation
      );
      const popupText = `
        <div class="shipment-map-popup">
          <div class="shipment-map-popup__title">Package Location</div>
          <div class="shipment-map-popup__status">${escapeMapHtml(shipment.status || 'In Transit')}</div>
          <div class="shipment-map-popup__label">Current Location</div>
          <div class="shipment-map-popup__value">${escapeMapHtml(currentLocationName)}</div>
          <div class="shipment-map-popup__label">Last Updated</div>
          <div class="shipment-map-popup__value">${escapeMapHtml(lastUpdated)}</div>
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
