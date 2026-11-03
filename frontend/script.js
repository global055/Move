const API_BASE_URL = '';
const API_URL = `${API_BASE_URL}/api/public/shipments`;
const TRACKING_NUMBERS_URL = `${API_BASE_URL}/api/public/shipments/tracking-numbers`;

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
    link.addEventListener('click', (ev) => {
      // Close mobile nav
      nav.classList.remove('is-open');
      toggle.classList.remove('is-active');
      toggle.setAttribute('aria-expanded', 'false');

      // Smooth scroll behavior for in-page anchors
      try {
        const href = link.getAttribute('href') || '';
        if (href.startsWith('#') && href.length > 1) {
          ev.preventDefault();
          const target = document.querySelector(href);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Update URL without reloading
            history.replaceState(null, '', href);
          }
        }
      } catch (err) {
        // ignore
      }
    });
  });

  // Also enable smooth scrolling for any anchor links elsewhere on the page
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (ev) => {
      const href = a.getAttribute('href') || '';
      if (href === '#' || href === '') return;
      const target = document.querySelector(href);
      if (target) {
        ev.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', href);
      }
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

function buildHomepageFieldRow(label, value) {
  if (value == null || value === '') return '';
  return `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`;
}

function renderHomepageCustomSections(shipment) {
  const sections = Array.isArray(shipment.customSections)
    ? shipment.customSections.map((section) => ({
      title: typeof section.title === 'string' ? section.title.trim() : '',
      fields: Array.isArray(section.fields)
        ? section.fields.filter((field) => field && field.value != null && String(field.value).trim() !== '')
        : []
    })).filter((section) => section.fields.length)
    : [];

  if (!sections.length) return '';

  return `
    <section class="homepage-custom-sections" aria-label="Additional shipment details">
      <h4>Additional shipment details</h4>
      ${sections.map((section) => `
        <div class="homepage-custom-section">
          ${section.title ? `<h5>${escapeHtml(section.title)}</h5>` : ''}
          <div class="homepage-custom-fields">
            ${section.fields.map((field) => `
              <div><strong>${escapeHtml(field.label || 'Detail')}</strong><span>${escapeHtml(field.value || '')}</span></div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </section>
  `;
}

function renderHomepageQuickEntryFields(shipment) {
  const currentLocationText = shipment.currentLocationName || shipment.currentPackageLocation || shipment.currentLocation || '';
  return [
    ['Origin', shipment.originName || shipment.origin],
    ['Destination', shipment.destinationName || shipment.destination],
    ['Origin latitude', shipment.coordinates?.origin?.lat],
    ['Origin longitude', shipment.coordinates?.origin?.lng],
    ['Destination latitude', shipment.coordinates?.destination?.lat],
    ['Destination longitude', shipment.coordinates?.destination?.lng],
    ['Current Location', currentLocationText],
    ['Current latitude', shipment.coordinates?.currentLocation?.lat],
    ['Current longitude', shipment.coordinates?.currentLocation?.lng],
    ['Estimated Delivery', shipment.estimatedDelivery],
    ['Delivery Date', shipment.deliveryDate],
    ['Shipment Type', shipment.shipmentType],
    ['Carrier', shipment.carrier],
    ['Package Description', shipment.packageDescription],
    ['Package Weight', shipment.packageWeight != null ? `${shipment.packageWeight} kg` : (shipment.weight != null ? `${shipment.weight} kg` : '')],
    ['Shipper Name', shipment.shipper?.name || shipment.senderName],
    ['Shipper Phone', shipment.shipper?.phone],
    ['Shipper Email', shipment.shipper?.email],
    ['Shipper Address', shipment.shipper?.address],
    ['Receiver Name', shipment.receiver?.name || shipment.receiverName],
    ['Receiver Phone', shipment.receiver?.phone],
    ['Receiver Email', shipment.receiver?.email],
    ['Receiver Address', shipment.receiver?.address]
  ].map(([label, value]) => buildHomepageFieldRow(label, value)).join('');
}

function formatCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) return '';
  return `$${Number(Number(value)).toFixed(2)}`;
}

function homepageTimelineSortValue(event) {
  const timestamp = new Date(event.timestamp || `${event.date || ''}T${event.time || '00:00'}`).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatHomepageEventDate(event) {
  if (event.date) return event.date;
  if (!event.timestamp) return '';
  const date = new Date(event.timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

function formatHomepageEventTime(event) {
  if (event.time) return event.time;
  if (!event.timestamp) return '';
  const date = new Date(event.timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderHomepageEvents(shipment) {
  const events = Array.isArray(shipment.timeline)
    ? [...shipment.timeline].sort((a, b) => homepageTimelineSortValue(b) - homepageTimelineSortValue(a))
    : [];

  if (!events.length) {
    return '<p class="homepage-events-empty">No tracking events have been posted yet.</p>';
  }

  const eventRows = events.map((event, index) => {
    const title = event.title || event.status || (index === 0 ? shipment.status : '') || 'Shipment update';
    const description = event.description || event.remarks || '';
    const location = event.location || event.currentLocationName || '';
    const dateTime = [formatHomepageEventDate(event), formatHomepageEventTime(event)].filter(Boolean).join(' · ');
    return `
      <li class="homepage-event ${index === 0 ? 'is-current' : ''}">
        <span class="homepage-event-marker" aria-hidden="true"></span>
        <div class="homepage-event-content">
          <div class="homepage-event-heading">
            <strong>${escapeHtml(title)}</strong>
            ${dateTime ? `<time>${escapeHtml(dateTime)}</time>` : ''}
          </div>
          ${description ? `<p>${escapeHtml(description)}</p>` : ''}
          ${location ? `<span class="homepage-event-location">${escapeHtml(location)}</span>` : ''}
          ${event.updatedBy ? `<span class="homepage-event-updated">Updated by ${escapeHtml(event.updatedBy)}</span>` : ''}
        </div>
      </li>
    `;
  }).join('');

  return `<ol class="homepage-event-list">${eventRows}</ol>`;
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

        const summaryRows = renderHomepageQuickEntryFields(shipment);
        const eventCount = Array.isArray(shipment.timeline) ? shipment.timeline.length : 0;

        statusBox.classList.remove('is-loading');
        statusBox.innerHTML = `
          <div class="tracking-result-card">
            <div class="tracking-result-header">
              <div>
                <span class="tracking-result-label">Shipment tracking</span>
                <h3>${escapeHtml(shipment.trackingNumber || trackingNumber)}</h3>
              </div>
              <span class="tracking-pill">${escapeHtml(shipment.status || 'Unknown')}</span>
            </div>
            <div class="tracking-result-grid">
              ${summaryRows}
            </div>
            ${renderHomepageCustomSections(shipment)}
            ${shipment.description ? `<p class="tracking-result-description">${escapeHtml(shipment.description)}</p>` : ''}
            <section class="homepage-events" aria-label="Shipment event history">
              <div class="homepage-events-header">
                <h4>Shipment events</h4>
                <span>${eventCount} ${eventCount === 1 ? 'event' : 'events'}</span>
              </div>
              ${renderHomepageEvents(shipment)}
            </section>
            <a class="more-details-button" href="tracking-details.html?tracking=${encodeURIComponent(shipment.trackingNumber || trackingNumber)}">Full shipment details <span aria-hidden="true">→</span></a>
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
  return `<div class="package-map-marker ${statusClass} is-current-location" aria-label="Package location"></div>`;
}

function createHomepagePackageIcon(status) {
  return window.L.divIcon({
    className: 'package-marker-wrapper',
    html: buildHomepagePackageMarkerHtml(status),
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12]
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
