const API_BASE_URL = 'https://move-638e.onrender.com';
const API_URL = `${API_BASE_URL}/api/shipments`;
const TRACKING_NUMBERS_URL = `${API_BASE_URL}/api/shipments/tracking-numbers`;

let homepageMap = null;
let homepageRouteLine = null;
let homepageOriginMarker = null;
let homepageDestinationMarker = null;
let homepagePackageMarker = null;
let homepageLastPackageLatLng = null;

function initNavigation() {
  const toggle = document.querySelector('.mobile-nav-toggle');
  const nav = document.getElementById('siteNav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    toggle.classList.toggle('is-active', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      toggle.classList.remove('is-active');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

function initRevealAnimations() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  items.forEach((item) => observer.observe(item));
}

function animateCounters() {
  const counters = document.querySelectorAll('.stat-number');
  counters.forEach((counter) => {
    const target = Number(counter.dataset.target || 0);
    const suffix = counter.dataset.suffix || '';
    const duration = 1200;
    const start = performance.now();

    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const value = Math.floor(progress * target);
      counter.textContent = `${value}${suffix}`;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        counter.textContent = `${target}${suffix}`;
      }
    };

    requestAnimationFrame(step);
  });
}

async function loadTrackingDatalist() {
  try {
    const response = await fetch(TRACKING_NUMBERS_URL);
    const result = await response.json();

    if (!result.success || !Array.isArray(result.data)) {
      return;
    }

    const datalist = document.getElementById('trackingNumbers');
    if (!datalist) return;

    datalist.innerHTML = result.data
      .filter((trackingNumber) => trackingNumber)
      .map((trackingNumber) => `<option value="${escapeHtml(trackingNumber)}"></option>`)
      .join('');
  } catch (error) {
    console.error('Error loading tracking suggestions:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  hideHomepageMap();
  initNavigation();
  initRevealAnimations();
  animateCounters();
  loadTrackingDatalist();

  const trackingForm = document.getElementById('trackingForm');
  const trackingInput = document.getElementById('trackingInput');
  const statusBox = document.getElementById('statusBox');

  if (!trackingForm || !trackingInput || !statusBox) {
    return;
  }

  trackingForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const trackingNumber = trackingInput.value.trim();

    if (!trackingNumber) {
      statusBox.classList.remove('is-loading');
      statusBox.innerHTML = '<p class="status-error">Please enter a tracking number.</p>';
      return;
    }

    statusBox.classList.add('is-loading');
    statusBox.innerHTML = '<div class="loading-state"><span></span>Searching shipment details...</div>';

    try {
      const response = await fetch(`${API_URL}/${trackingNumber}`);
      const result = await response.json();

      if (result.success) {
        const shipment = result.data;

        statusBox.classList.remove('is-loading');
        statusBox.innerHTML = `
          <div class="tracking-result-card">
            <div class="tracking-result-header">
              <h3>Package #${escapeHtml(shipment.trackingNumber || trackingNumber)}</h3>
              <span class="tracking-pill">${escapeHtml(shipment.status || 'Unknown')}</span>
            </div>
            <div class="tracking-result-grid">
              <p><strong>Sender:</strong> ${escapeHtml(shipment.senderName || 'N/A')}</p>
              <p><strong>Receiver:</strong> ${escapeHtml(shipment.receiverName || 'N/A')}</p>
              <p><strong>Origin:</strong> ${escapeHtml(shipment.originName || 'N/A')}</p>
              <p><strong>Destination:</strong> ${escapeHtml(shipment.destinationName || 'N/A')}</p>
              <p><strong>Weight:</strong> ${shipment.weight != null ? `${shipment.weight} kg` : 'N/A'}</p>
              <p class="full"><strong>Description:</strong> ${escapeHtml(shipment.description || 'N/A')}</p>
              <p class="full"><strong>Est. Delivery:</strong> ${escapeHtml(shipment.estimatedDelivery || 'Pending')}</p>
            </div>
          </div>
        `;

        if (shipment.coordinates && shipment.coordinates.currentLocation) {
          showHomepageMap();
          renderShipmentOnHomepageMap(shipment);
        } else {
          hideHomepageMap();
        }
      } else {
        statusBox.classList.remove('is-loading');
        statusBox.innerHTML = `<p class="status-error">${result.message || 'Tracking number not found.'}</p>`;
        hideHomepageMap();
      }
    } catch (error) {
      console.error('Error fetching shipment data:', error);
      statusBox.classList.remove('is-loading');
      statusBox.innerHTML = '<p class="status-error">Unable to connect to the backend server.</p>';
      hideHomepageMap();
    }
  });
});

function showHomepageMap() {
  const mapEl = document.getElementById('homepage-map');
  if (!mapEl) return;
  mapEl.classList.remove('hidden');
  mapEl.setAttribute('aria-hidden', 'false');
}

function hideHomepageMap() {
  const mapEl = document.getElementById('homepage-map');
  if (!mapEl) return;
  mapEl.classList.add('hidden');
  mapEl.setAttribute('aria-hidden', 'true');
}

function initializeHomepageMap(lat, lng) {
  const mapEl = document.getElementById('homepage-map');
  if (!mapEl || typeof window.L === 'undefined') return null;

  try {
    if (mapEl._leaflet_id) {
      mapEl._leaflet_id = null;
    }

    homepageMap = window.L.map('homepage-map', { attributionControl: false }).setView([lat, lng], 10);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(homepageMap);
    setTimeout(() => homepageMap.invalidateSize(), 300);
    return homepageMap;
  } catch (err) {
    console.error('Failed to initialize homepage map', err);
    return null;
  }
}

function clearHomepageRoute() {
  if (homepageRouteLine && homepageMap) {
    homepageMap.removeLayer(homepageRouteLine);
  }
  homepageRouteLine = null;
}

function clearHomepageFixedMarkers() {
  [homepageOriginMarker, homepageDestinationMarker].forEach((marker) => {
    if (marker && homepageMap) {
      homepageMap.removeLayer(marker);
    }
  });
  homepageOriginMarker = null;
  homepageDestinationMarker = null;
}

function clearHomepagePackageMarker() {
  if (homepagePackageMarker && homepageMap) {
    homepageMap.removeLayer(homepagePackageMarker);
  }
  homepagePackageMarker = null;
  homepageLastPackageLatLng = null;
}

function createHomepageCircleMarker(coords, options) {
  return window.L.circleMarker([coords.lat, coords.lng], options).addTo(homepageMap);
}

function buildHomepagePackageMarkerHtml(status) {
  const statusClass = status === 'Delivered' ? 'is-delivered' : status === 'In Transit' ? 'is-active' : 'is-pending';
  const imgSrc = 'imges/package indicator.png';
  return `
    <div class="package-map-marker ${statusClass} is-current-location">
      <img src="${imgSrc}" class="package-indicator-img" alt="Package Indicator" />
    </div>
  `;
}

function createHomepagePackageIcon(status) {
  return window.L.divIcon({
    className: 'package-marker-wrapper',
    html: buildHomepagePackageMarkerHtml(status),
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -16]
  });
}

function createHomepagePackageMarker(coords, popupText, status) {
  const marker = window.L.marker([coords.lat, coords.lng], {
    icon: createHomepagePackageIcon(status),
    riseOnHover: true
  }).addTo(homepageMap);

  if (popupText) {
    marker.bindPopup(popupText).openPopup();
  }

  return marker;
}

function animateHomepageMarkerMovement(marker, fromCoords, toCoords, duration = 900) {
  if (!marker || !fromCoords || !toCoords || duration <= 0) {
    marker.setLatLng([toCoords.lat, toCoords.lng]);
    return;
  }

  const start = performance.now();
  const startLat = fromCoords.lat;
  const startLng = fromCoords.lng;
  const deltaLat = toCoords.lat - startLat;
  const deltaLng = toCoords.lng - startLng;

  const step = (timestamp) => {
    const elapsed = timestamp - start;
    const progress = Math.min(elapsed / duration, 1);
    const nextLat = startLat + deltaLat * progress;
    const nextLng = startLng + deltaLng * progress;
    marker.setLatLng([nextLat, nextLng]);

    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };

  window.requestAnimationFrame(step);
}

function renderShipmentOnHomepageMap(shipment) {
  if (!homepageMap) {
    const currentLocation = shipment.coordinates?.currentLocation;
    if (!currentLocation) return;
    homepageMap = initializeHomepageMap(currentLocation.lat, currentLocation.lng);
  }

  if (!homepageMap) return;

  clearHomepageRoute();
  clearHomepageFixedMarkers();

  const origin = shipment.coordinates?.origin;
  const current = shipment.coordinates?.currentLocation;
  const destination = shipment.coordinates?.destination;
  const bounds = window.L.latLngBounds([]);

  if (origin?.lat != null && origin?.lng != null) {
    homepageOriginMarker = createHomepageCircleMarker(origin, {
      radius: 8,
      color: '#1f77b4',
      fillColor: '#1f77b4',
      fillOpacity: 0.9,
      weight: 2
    }).bindPopup('<strong>Origin</strong>');
    bounds.extend([origin.lat, origin.lng]);
  }

  if (destination?.lat != null && destination?.lng != null) {
    homepageDestinationMarker = createHomepageCircleMarker(destination, {
      radius: 8,
      color: '#d9534f',
      fillColor: '#d9534f',
      fillOpacity: 0.9,
      weight: 2
    }).bindPopup('<strong>Destination</strong>');
    bounds.extend([destination.lat, destination.lng]);
  }

  if (origin && destination) {
    homepageRouteLine = window.L.polyline([[origin.lat, origin.lng], [destination.lat, destination.lng]], {
      color: '#2a9df4',
      weight: 4,
      opacity: 0.85,
      dashArray: '8,6'
    }).addTo(homepageMap);
  }

  if (current?.lat != null && current?.lng != null) {
    const currentCoords = { lat: current.lat, lng: current.lng };
    const popupText = `<strong>Package Location</strong><br>Status: ${escapeHtml(shipment.status || 'Unknown')}`;

    if (homepagePackageMarker && homepageLastPackageLatLng) {
      animateHomepageMarkerMovement(homepagePackageMarker, homepageLastPackageLatLng, currentCoords);
      if (homepagePackageMarker.getPopup && homepagePackageMarker.getPopup()) {
        homepagePackageMarker.setPopupContent(popupText);
      }
    } else if (homepagePackageMarker) {
      homepagePackageMarker.setLatLng([currentCoords.lat, currentCoords.lng]);
      if (homepagePackageMarker.getPopup && homepagePackageMarker.getPopup()) {
        homepagePackageMarker.setPopupContent(popupText);
      }
    } else {
      homepagePackageMarker = createHomepagePackageMarker(currentCoords, popupText, shipment.status);
    }

    homepageLastPackageLatLng = currentCoords;
    bounds.extend([current.lat, current.lng]);
  } else {
    clearHomepagePackageMarker();
  }

  if (bounds.isValid()) {
    homepageMap.fitBounds(bounds.pad(0.12));
  }

  setTimeout(() => homepageMap.invalidateSize(), 100);
}

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
