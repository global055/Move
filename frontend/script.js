const API_BASE_URL = '';
const API_URL = `${API_BASE_URL}/api/public/shipments`;
const TRACKING_NUMBERS_URL = `${API_BASE_URL}/api/public/shipments/tracking-numbers`;

let homepageMap = null;
let homepageRouteLines = [];
let homepageOriginMarker = null;
let homepageDestinationMarker = null;
let homepagePackageMarker = null;
let homepageLastPackageLatLng = null;
let homepageTrackingRefreshTimer = null;
let homepageActiveTrackingNumber = '';

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

  const currentEventIndex = events.findIndex((event) => homepageTimelineSortValue(event) <= Date.now());
  const eventRows = events.map((event, index) => {
    const isCurrent = index === currentEventIndex;
    const progressClass = currentEventIndex < 0 || index < currentEventIndex ? 'is-upcoming' : isCurrent ? 'is-current' : 'is-completed';
    const title = event.title || event.status || (isCurrent ? shipment.status : '') || 'Shipment update';
    const statusClass = homepageStatusClass(event.status || event.title || shipment.status);
    const description = event.description || event.remarks || '';
    const location = event.location || event.currentLocationName || '';
    const dateTime = [formatHomepageEventDate(event), formatHomepageEventTime(event)].filter(Boolean).join(' · ');
    return `
      <li class="homepage-event ${statusClass} ${progressClass}">
        <span class="homepage-event-marker" aria-hidden="true"></span>
        <div class="homepage-event-content">
          <div class="homepage-event-heading">
            <strong>${escapeHtml(title)}</strong>
            ${dateTime ? `<time>${escapeHtml(dateTime)}</time>` : ''}
          </div>
          ${description ? `<p>${escapeHtml(description)}</p>` : ''}
          ${location ? `<span class="homepage-event-location">${escapeHtml(location)}</span>` : ''}
        </div>
      </li>
    `;
  }).join('');

  return `<ol class="homepage-event-list">${eventRows}</ol>`;
}

function homepageStatusClass(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized.includes('delivered')) return 'status-delivered';
  if (normalized.includes('out for delivery')) return 'status-out-for-delivery';
  if (normalized.includes('hold')) return 'status-on-hold';
  if (normalized.includes('exception') || normalized.includes('delayed') || normalized.includes('returned') || normalized.includes('cancel')) return 'status-exception';
  if (normalized.includes('processing')) return 'status-processing';
  if (normalized.includes('pending') || normalized.includes('order received') || normalized.includes('label')) return 'status-pending';
  if (normalized.includes('accepted')) return 'status-accepted';
  if (normalized.includes('arrived at facility')) return 'status-facility';
  return 'status-in-transit';
}

function homepageStatusLabel(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized.includes('delivered')) return 'Delivered';
  if (normalized.includes('out for delivery')) return 'Out for Delivery';
  if (normalized.includes('hold')) return 'On Hold';
  if (normalized.includes('processing')) return 'Processing';
  if (normalized.includes('pending') || normalized.includes('order received')) return 'Pending';
  if (normalized.includes('label')) return 'Label Created';
  if (normalized.includes('accepted')) return 'Shipment Accepted';
  if (normalized.includes('arrived at facility')) return 'Arrived at Facility';
  if (normalized.includes('enroute') || normalized.includes('in transit') || normalized.includes('shipped')) return 'In Transit';
  return status || 'Unknown';
}

function homepageStatusIndicator(status) {
  const statusClass = homepageStatusClass(status);
  if (statusClass === 'status-pending') return 'dot';
  if (statusClass === 'status-processing') return 'spinner';
  if (statusClass === 'status-on-hold' || statusClass === 'status-exception') return 'warning';
  if (statusClass === 'status-out-for-delivery') return 'truck';
  if (statusClass === 'status-delivered' || statusClass === 'status-accepted') return 'check';
  if (statusClass === 'status-facility') return 'pin';
  return 'route';
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
        homepageActiveTrackingNumber = shipment.trackingNumber || trackingNumber;

        const summaryRows = renderHomepageQuickEntryFields(shipment);
        const eventCount = Array.isArray(shipment.timeline) ? shipment.timeline.length : 0;
        if (!homepageTrackingRefreshTimer) {
          homepageTrackingRefreshTimer = window.setInterval(() => {
            if (document.visibilityState === 'visible' && trackingInput.value.trim() === homepageActiveTrackingNumber) {
              trackingForm.requestSubmit();
            }
          }, 60000);
        }

        statusBox.classList.remove('is-loading');
        statusBox.innerHTML = `
          <div class="tracking-result-card">
            <div class="tracking-result-header">
              <div>
                <span class="tracking-result-label">Shipment tracking</span>
                <h3>${escapeHtml(shipment.trackingNumber || trackingNumber)}</h3>
              </div>
              <span class="tracking-pill ${homepageStatusClass(shipment.status)}"><span class="status-indicator status-indicator--${homepageStatusIndicator(shipment.status)}" aria-hidden="true"></span>${escapeHtml(homepageStatusLabel(shipment.status))}</span>
            </div>
            <div class="tracking-result-grid">
              ${summaryRows}
            </div>
            ${renderHomepageCustomSections(shipment)}
            ${shipment.description ? `<p class="tracking-result-description">${escapeHtml(shipment.description)}</p>` : ''}
            <button type="button" class="more-details-button js-toggle-shipment-events" data-expanded="false" aria-expanded="false">
              View more shipments <span aria-hidden="true">→</span>
            </button>
            <section class="homepage-events hidden" aria-label="Shipment event history" aria-live="polite">
              <div class="homepage-events-header">
                <h4>Shipment events</h4>
                <span>${eventCount} ${eventCount === 1 ? 'event' : 'events'}</span>
              </div>
              <div class="homepage-events-body">
                ${renderHomepageEvents(shipment)}
              </div>
            </section>
          </div>
        `;

        const toggleButton = statusBox.querySelector('.js-toggle-shipment-events');
        const shipmentEvents = statusBox.querySelector('.homepage-events');

        if (toggleButton && shipmentEvents) {
          toggleButton.addEventListener('click', () => {
            const expanded = toggleButton.dataset.expanded === 'true';
            const shouldExpand = !expanded;

            toggleButton.dataset.expanded = String(shouldExpand);
            toggleButton.setAttribute('aria-expanded', String(shouldExpand));
            shipmentEvents.classList.toggle('hidden', !shouldExpand);

            toggleButton.innerHTML = shouldExpand
              ? 'Hide shipment events <span aria-hidden="true">↑</span>'
              : 'View more shipments <span aria-hidden="true">→</span>';
          });
        }

        if (shipment.coordinates && (shipment.coordinates.origin || shipment.coordinates.currentLocation || shipment.coordinates.destination)) {
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
  homepageRouteLines.forEach((routeLine) => {
    if (homepageMap) homepageMap.removeLayer(routeLine);
  });
  homepageRouteLines = [];
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

function createHomepageRouteMarker(coords, type, label) {
  return window.L.marker([coords.lat, coords.lng], {
    icon: window.L.divIcon({
      className: 'route-map-marker-shell',
      html: `<span class="route-map-marker route-map-marker--${type}" aria-label="${label}">${type === 'origin' ? 'O' : type === 'destination' ? 'D' : '✓'}</span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    })
  }).addTo(homepageMap).bindPopup(`<strong>${label}</strong>`);
}

function addHomepageRouteLine(points, className, color, dashArray = null) {
  if (points.length < 2) return;
  const routeLine = window.L.polyline(points, {
    className,
    color,
    weight: 5,
    opacity: 0.9,
    dashArray,
    lineCap: 'round'
  }).addTo(homepageMap);
  homepageRouteLines.push(routeLine);
}

function isHomepageShipmentMoving(status) {
  const normalized = String(status || '').toLowerCase();
  return ['in transit', 'out for delivery', 'enroute', 'arriving soon', 'picked up', 'on the way', 'moving', 'departed', 'shipped']
    .some((value) => normalized.includes(value));
}

function buildHomepagePackageMarkerHtml(status) {
  const statusClass = homepageStatusClass(status);
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
    const center = shipment.coordinates?.currentLocation || shipment.coordinates?.origin || shipment.coordinates?.destination;
    if (!center) return;
    homepageMap = initializeHomepageMap(center.lat, center.lng);
  }

  if (!homepageMap) return;

  clearHomepageRoute();
  clearHomepageFixedMarkers();

  const origin = shipment.coordinates?.origin;
  const current = shipment.coordinates?.currentLocation;
  const destination = shipment.coordinates?.destination;
  const status = String(shipment.status || '').toLowerCase();
  const isDelivered = status.includes('delivered');
  const isMoving = isHomepageShipmentMoving(status);
  const bounds = window.L.latLngBounds([]);

  if (origin?.lat != null && origin?.lng != null) {
    homepageOriginMarker = createHomepageRouteMarker(origin, 'origin', 'Origin');
    bounds.extend([origin.lat, origin.lng]);
  }

  if (destination?.lat != null && destination?.lng != null) {
    homepageDestinationMarker = createHomepageRouteMarker(destination, isDelivered ? 'delivered' : 'destination', isDelivered ? 'Delivered destination' : 'Destination');
    bounds.extend([destination.lat, destination.lng]);
  }

  const hasCurrent = current?.lat != null && current?.lng != null;
  if (origin && destination && isDelivered) {
    addHomepageRouteLine([[origin.lat, origin.lng], [destination.lat, destination.lng]], 'route-line route-line--complete', '#239653');
  } else if (origin && destination && hasCurrent) {
    addHomepageRouteLine([[origin.lat, origin.lng], [current.lat, current.lng]], 'route-line route-line--complete', '#239653');
    addHomepageRouteLine(
      [[current.lat, current.lng], [destination.lat, destination.lng]],
      `route-line ${isMoving ? 'route-line--active' : 'route-line--upcoming'}`,
      isMoving ? '#08a6d8' : '#9aa8b8',
      isMoving ? '10 10' : '5 8'
    );
  } else if (origin && destination) {
    addHomepageRouteLine(
      [[origin.lat, origin.lng], [destination.lat, destination.lng]],
      `route-line ${isMoving ? 'route-line--active' : 'route-line--upcoming'}`,
      isMoving ? '#08a6d8' : '#9aa8b8',
      isMoving ? '10 10' : '5 8'
    );
  }

  if (current?.lat != null && current?.lng != null) {
    const currentCoords = { lat: current.lat, lng: current.lng };
    const popupText = `<strong>Package Location</strong><br>Status: ${escapeHtml(shipment.status || 'Unknown')}`;

    if (homepagePackageMarker && homepageLastPackageLatLng) {
      homepagePackageMarker.setIcon(createHomepagePackageIcon(shipment.status));
      animateHomepageMarkerMovement(homepagePackageMarker, homepageLastPackageLatLng, currentCoords);
      if (homepagePackageMarker.getPopup && homepagePackageMarker.getPopup()) {
        homepagePackageMarker.setPopupContent(popupText);
      }
    } else if (homepagePackageMarker) {
      homepagePackageMarker.setIcon(createHomepagePackageIcon(shipment.status));
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
