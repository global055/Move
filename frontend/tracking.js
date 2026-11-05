const API_BASE_URL = '';
const API_URL = `${API_BASE_URL}/api/public/shipments`;
const TRACKING_NUMBERS_URL = `${API_BASE_URL}/api/public/shipments/tracking-numbers`;
let activeTrackingNumber = '';
let trackingRefreshTimer = null;

// Load shipments and populate datalist on page load
window.addEventListener('DOMContentLoaded', () => {
  loadTrackingDatalist();
});

async function loadTrackingDatalist() {
  try {
    const response = await fetch(TRACKING_NUMBERS_URL);
    const result = await response.json();

    if (result.success && Array.isArray(result.data)) {
      renderTrackingDatalist(result.data);
    }
  } catch (error) {
    console.error('Error loading shipments:', error);
  }
}

function renderTrackingDatalist(shipments) {
  const datalist = document.getElementById('trackingNumbers');
  if (!datalist) return;

  const trackingNumbers = (Array.isArray(shipments) ? shipments : [])
    .map((shipment) => typeof shipment === 'string' ? shipment : shipment?.trackingNumber)
    .filter(Boolean);

  datalist.innerHTML = trackingNumbers
    .map((trackingNumber) => `<option value="${escapeHtml(trackingNumber)}"></option>`)
    .join('');
}

function hasDisplayValue(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.some((item) => hasDisplayValue(item));
  return true;
}

function getLocationName(...values) {
  const coordinatesPattern = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/;
  return values.find((value) => (
    typeof value === 'string' && value.trim() && !coordinatesPattern.test(value)
  ))?.trim() || '';
}

function buildFieldRow(label, value, fullWidth = false) {
  if (!hasDisplayValue(value)) return '';
  const displayValue = typeof value === 'string' ? value.trim() : value;
  return `<div class="${fullWidth ? 'full' : ''}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(displayValue)}</span></div>`;
}

function buildAddressRow(label, values) {
  const displayValues = (Array.isArray(values) ? values : [values]).filter((value) => hasDisplayValue(value));
  if (!displayValues.length) return '';
  return `<div class="full"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(displayValues.map((value) => typeof value === 'string' ? value.trim() : value).join(', '))}</span></div>`;
}

function renderContactIcon(name) {
  const paths = {
    user: '<circle cx="12" cy="8" r="3.5"></circle><path d="M5 20c.5-3.2 2.8-5 7-5s6.5 1.8 7 5"></path>',
    location: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"></path><circle cx="12" cy="10" r="2"></circle>',
    phone: '<path d="M7 3h3l1.4 4-2 1.5a15 15 0 0 0 6.1 6.1l1.5-2L21 14v3c0 1.1-.9 2-2 2C10 19 5 14 5 5c0-1.1.9-2 2-2Z"></path>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m4 7 8 6 8-6"></path>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"></path><path d="m9 12 2 2 4-4"></path>'
  };
  return `<svg class="shipment-inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}

function renderPartyField(icon, label, value) {
  if (!hasDisplayValue(value)) return '';
  return `<div class="shipment-contact-field">${renderContactIcon(icon)}<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div></div>`;
}

function renderPartyCard(kind, party, fallbackName, fallbackAddress) {
  const name = party?.name || fallbackName;
  const address = [party?.address, party?.city, party?.state, party?.postalCode, party?.country]
    .filter(hasDisplayValue).join(', ') || fallbackAddress;
  const fields = [
    renderPartyField('user', 'Company', party?.company),
    renderPartyField('location', 'Address', address),
    renderPartyField('phone', 'Phone', party?.phone),
    renderPartyField('email', 'Email', party?.email)
  ].filter(Boolean).join('');

  return `
    <section class="shipment-party-card">
      <div class="shipment-party-heading">${renderContactIcon('user')}<div><span>${kind} information</span><h2>${escapeHtml(name || `${kind} details unavailable`)}</h2></div></div>
      <div class="shipment-contact-list">${fields || '<p class="shipment-no-data">No contact details provided.</p>'}</div>
    </section>
  `;
}

function formatLastUpdated(shipment, latestUpdate) {
  const dateTime = [latestUpdate?.date, latestUpdate?.time].filter(hasDisplayValue).join(' ');
  if (dateTime) return dateTime;
  const updatedAt = shipment.updatedAt || latestUpdate?.timestamp;
  if (!updatedAt) return 'Not available';
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function renderCustomSections(sections) {
  if (!Array.isArray(sections)) return '';
  return sections.map((section) => {
    const fields = Array.isArray(section?.fields) ? section.fields : [];
    const rows = fields.map((field) => buildFieldRow(field?.label || 'Detail', field?.value)).filter(Boolean).join('');
    if (!rows) return '';
    return `<section class="tracking-card shipment-custom-card"><div class="tracking-card-header"><h2>${escapeHtml(section.title || 'Additional details')}</h2></div><div class="shipment-details-grid">${rows}</div></section>`;
  }).join('');
}

function getStatusMeta(status) {
  const normalized = String(status || 'In Transit').trim().toLowerCase();
  if (normalized.includes('delivered')) return { className: 'status-delivered', label: 'Delivered', icon: 'check' };
  if (normalized.includes('out for delivery')) return { className: 'status-out-for-delivery', label: 'Out for Delivery', icon: 'truck' };
  if (normalized.includes('hold')) return { className: 'status-on-hold', label: 'On Hold', icon: 'warning' };
  if (normalized.includes('exception') || normalized.includes('delayed') || normalized.includes('returned') || normalized.includes('cancel')) {
    return { className: 'status-exception', label: status || 'Exception', icon: 'warning' };
  }
  if (normalized.includes('processing')) return { className: 'status-processing', label: 'Processing', icon: 'spinner' };
  if (normalized.includes('pending') || normalized.includes('order received') || normalized.includes('label')) {
    return { className: 'status-pending', label: normalized.includes('label') ? 'Label Created' : 'Pending', icon: 'dot' };
  }
  if (normalized.includes('accepted')) return { className: 'status-accepted', label: 'Shipment Accepted', icon: 'check' };
  if (normalized.includes('arrived at facility')) return { className: 'status-facility', label: 'Arrived at Facility', icon: 'pin' };
  if (normalized.includes('enroute') || normalized.includes('in transit') || normalized.includes('shipped')) return { className: 'status-in-transit', label: 'In Transit', icon: 'route' };
  if (normalized.includes('picked up')) return { className: 'status-in-transit', label: 'Picked Up', icon: 'route' };
  if (normalized.includes('arriving soon')) return { className: 'status-in-transit', label: 'Arriving Soon', icon: 'route' };
  return { className: 'status-in-transit', label: status || 'In Transit', icon: 'route' };
}

function renderStatusPill(status) {
  const meta = getStatusMeta(status);
  return `<span class="tracking-pill ${meta.className}"><span class="status-indicator status-indicator--${meta.icon}" aria-hidden="true"></span>${escapeHtml(meta.label)}</span>`;
}

function timelineStateClass(status, index, currentIndex) {
  const meta = getStatusMeta(status);
  const isUpcoming = currentIndex < 0 || index > currentIndex;
  const progressClass = isUpcoming ? 'is-upcoming' : index === currentIndex ? 'is-current' : 'is-completed';
  return `${meta.className} ${progressClass}`;
}

function renderTrackingError(message) {
  const statusBox = document.getElementById('statusBox');
  if (!statusBox) return;
  statusBox.classList.remove('is-loading');
  statusBox.classList.add('tracking-results-card-wrapper');
  statusBox.innerHTML = `<div class="tracking-state tracking-state--error"><strong>Unable to display shipment</strong><p>${escapeHtml(message)}</p></div>`;
}

async function copyTrackingNumber(trackingNumber, button) {
  try {
    await navigator.clipboard.writeText(trackingNumber);
    if (button) {
      button.textContent = 'Copied';
      window.setTimeout(() => { button.textContent = 'Copy'; }, 1400);
    }
  } catch (error) {
    console.warn('Copy unavailable', error);
  }
}

function renderStatusContext(status, shipment, latestUpdate) {
  const normalized = String(status || '').toLowerCase();
  const location = getLocationName(
    latestUpdate.location,
    shipment.currentLocationName,
    shipment.currentPackageLocation,
    shipment.currentLocation,
    shipment.deliveryLocation
  );
  const description = latestUpdate.description || latestUpdate.remarks || '';
  let title = 'Shipment in progress';
  if (normalized.includes('delivered')) title = 'Delivery confirmed';
  else if (normalized.includes('out for delivery')) title = 'Out for delivery';
  else if (normalized.includes('arriving soon')) title = 'Shipment arriving soon';
  else if (normalized.includes('hold')) title = 'Shipment on hold';
  else if (normalized.includes('exception')) title = 'Shipment exception';
  else if (normalized.includes('label')) title = 'Shipping label created';
  else if (normalized.includes('accepted')) title = 'Shipment accepted';
  else if (normalized.includes('returned')) title = 'Shipment returned';
  else if (normalized.includes('cancel')) title = 'Shipment cancelled';
  return `<div class="tracking-status-context"><div><span class="tracking-highlight__label">Latest Update</span><strong>${escapeHtml(latestUpdate.title || title)}</strong><p>${escapeHtml(description || 'No latest update is available yet.')}</p></div>${location ? `<div><span class="tracking-highlight__label">Location</span><strong>${escapeHtml(location)}</strong></div>` : ''}${latestUpdate.date || latestUpdate.time ? `<time>${escapeHtml([latestUpdate.date, latestUpdate.time].filter(Boolean).join(' · '))}</time>` : ''}</div>`;
}

function resolveLatestUpdate(shipment, timelineItems) {
  const storedUpdate = shipment.latestUpdate;
  const hasStoredUpdate = storedUpdate && Object.values(storedUpdate).some((value) => hasDisplayValue(value));
  return hasStoredUpdate ? storedUpdate : (timelineItems[0] || {});
}

function timelineSortValue(event) {
  const value = new Date(event.timestamp || `${event.date || ''}T${event.time || '00:00'}`).getTime();
  return Number.isFinite(value) ? value : 0;
}

// Function to handle tracking lookup
async function trackShipment(trackingNumber) {
  try {
    const response = await fetch(`${API_URL}/${encodeURIComponent(trackingNumber)}`);
    const result = await response.json();

    if (!result.success || !result.data) {
      renderTrackingError(result.message || 'Tracking number not found.');
      return;
    }

    const shipment = result.data;
    activeTrackingNumber = shipment.trackingNumber || trackingNumber;
    if (!trackingRefreshTimer) {
      trackingRefreshTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible' && activeTrackingNumber) {
          trackShipment(activeTrackingNumber);
        }
      }, 60000);
    }

    const statusBox = document.getElementById('statusBox');
    if (statusBox) {
      const originName = getLocationName(shipment.originName, shipment.origin) || 'Not Available';
      const destinationName = getLocationName(shipment.destinationName, shipment.destination) || 'Not Available';
      const currentStatus = shipment.status || 'In Transit';
      const timelineItems = Array.isArray(shipment.timeline)
        ? [...shipment.timeline].sort((a, b) => timelineSortValue(a) - timelineSortValue(b))
        : [];
      const currentTimelineIndex = timelineItems.reduce((latestIndex, item, index) => (
        timelineSortValue(item) <= Date.now() ? index : latestIndex
      ), -1);
      const timelineHtml = timelineItems.length > 0 ? timelineItems.map((item, index) => {
        const displayDate = item.date || (item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'Not Available');
        const displayTime = item.time || (item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not Available');
        const displayRemarks = item.remarks || item.description || 'No remarks provided.';
        const displayLocation = getLocationName(item.location, item.currentLocationName) || 'Not Available';
        const isCurrent = index === currentTimelineIndex;
        return `
          <li class="timeline-item ${timelineStateClass(item.status || item.title || currentStatus, index, currentTimelineIndex)} ${isCurrent ? 'current-step' : ''}">
            <div class="timeline-marker" aria-hidden="true"><span></span></div>
            <div class="timeline-content">
              <div class="timeline-top">
                <span class="timeline-status">${escapeHtml(item.title || item.status || currentStatus)}</span>
                <span class="timeline-date">${escapeHtml(displayDate)}</span>
              </div>
              <div class="timeline-meta">
                <span>${escapeHtml(displayLocation)}</span>
                <span>${escapeHtml(displayTime)}</span>
              </div>
              <p>${escapeHtml(displayRemarks)}</p>
              ${item.title && item.status ? `<small>${escapeHtml(item.status)}</small>` : ''}
            </div>
          </li>
        `;
      }).join('') : '<li class="timeline-item"><div class="timeline-marker"></div><div class="timeline-content"><p>No timeline entries available.</p></div></li>';

      const pickupDateTime = [shipment.pickupDate, shipment.pickupTime].filter(Boolean).join(' ');
      const deliveryDateTime = [shipment.deliveryDate, shipment.deliveryTime].filter(Boolean).join(' ');
      const packageWeight = shipment.packageWeight != null ? `${shipment.packageWeight} kg` : (shipment.weight != null ? `${shipment.weight} kg` : 'Not available');
      const estimatedDelivery = shipment.estimatedDelivery || 'Not available';
      const description = shipment.packageDescription || shipment.description || 'No description provided.';
      const latestUpdate = resolveLatestUpdate(shipment, timelineItems);
      const currentLocationText = getLocationName(
        shipment.currentLocationName,
        shipment.currentPackageLocation,
        shipment.currentLocation,
        latestUpdate.location,
        shipment.deliveryLocation
      ) || 'Not Available';

      const shipmentDetailsRows = [
        ['Origin', originName],
        ['Destination', destinationName],
        ['Shipment Type', shipment.shipmentType],
        ['Shipping Method', shipment.deliveryMethod || shipment.modeOfShipment || shipment.serviceType],
        ['Carrier', shipment.carrier],
        ['Package Weight', packageWeight],
        ['Total Freight', shipment.totalFreight != null ? `$${Number(shipment.totalFreight).toFixed(2)}` : ''],
        ['Estimated Delivery', estimatedDelivery],
        ['Expected Delivery Time', shipment.expectedDeliveryTime],
        ['Current Location', currentLocationText],
        ['Pickup', pickupDateTime],
        ['Delivery', deliveryDateTime],
        ['Departure Airport/Port', shipment.departureAirportPort],
        ['Arrival Airport/Port', shipment.arrivalAirportPort],
        ['Quantity', shipment.quantity != null ? shipment.quantity : ''],
        ['Service Type', shipment.serviceType],
        ['Payment Status', shipment.paymentStatus],
        ['Reference Number', shipment.referenceNumber],
        ['Package Dimensions', shipment.packageDimensions || shipment.cargo?.dimensions],
        ['Insurance', shipment.insurance],
        ['Weight', shipment.weight != null ? `${shipment.weight} kg` : ''],
        ['Package Description', shipment.packageDescription || shipment.description],
        ['Description', shipment.description],
        ['Special Instructions', shipment.specialInstructions],
        ['Cargo Type', shipment.cargo?.type],
        ['Cargo Description', shipment.cargo?.description],
        ['Cargo Pieces', shipment.cargo?.pieces],
        ['Cargo Weight', shipment.cargo?.weight != null ? `${shipment.cargo.weight} kg` : ''],
        ['Cargo Volume', shipment.cargo?.volume != null ? `${shipment.cargo.volume}` : ''],
        ['Cargo Value', shipment.cargo?.value != null ? `$${shipment.cargo.value.toFixed(2)}` : ''],
        ['Cargo Dimensions', shipment.cargo?.dimensions],
        ['Incoterms', shipment.cargo?.incoterms],
        ['Dangerous Goods', shipment.cargo?.dangerousGoods != null ? (shipment.cargo.dangerousGoods ? 'Yes' : 'No') : ''],
        ['Cargo Special Instructions', shipment.cargo?.specialInstructions]
      ].map(([label, value]) => buildFieldRow(label, value)).filter(Boolean).join('');

      const lastUpdated = formatLastUpdated(shipment, latestUpdate);
      const routeDistance = originName !== 'Not Available' || destinationName !== 'Not Available'
        ? `<div class="shipment-route-summary"><div><span>Origin</span><strong>${escapeHtml(originName)}</strong></div><span class="shipment-route-arrow" aria-hidden="true">→</span><div><span>Destination</span><strong>${escapeHtml(destinationName)}</strong></div></div>`
        : '';
      const recentHistoryHtml = timelineItems.length
        ? `<ol class="timeline-list shipment-timeline">${timelineHtml}</ol>`
        : '<div class="tracking-empty-history">No tracking history is available for this shipment yet.</div>';

      const shipmentInfoHtml = `
        <div class="tracking-results-grid shipment-results">
          <section class="shipment-header-card">
            <div class="shipment-header-topline"><span>Global Movement <span aria-hidden="true">/</span> Shipment record</span><span class="shipment-verified">${renderContactIcon('shield')} Verified</span></div>
            <div class="shipment-header-main">
              <div class="shipment-number-block"><span>Tracking number</span><h2 class="tracking-number-heading">${escapeHtml(shipment.trackingNumber || trackingNumber)}</h2></div>
              <button type="button" class="copy-button shipment-copy-button" data-copy-tracking>Copy number</button>
            </div>
            <div class="shipment-header-meta">
              <div><span>Current status</span>${renderStatusPill(currentStatus)}</div>
              <div class="shipment-updated">${renderContactIcon('calendar')}<span><small>Last updated</small><strong>${escapeHtml(lastUpdated)}</strong></span></div>
            </div>
          </section>

          <div class="shipment-parties">
            ${renderPartyCard('Sender', shipment.shipper, shipment.senderName, shipment.senderLocation)}
            ${renderPartyCard('Receiver', shipment.receiver, shipment.receiverName, shipment.receiverLocation)}
          </div>

          <section class="tracking-card shipment-details-card">
            <div class="tracking-card-header"><div><p class="eyebrow">Shipment profile</p><h2>Shipment details</h2></div></div>
            ${routeDistance}
            <div class="shipment-details-grid">${shipmentDetailsRows}</div>
            ${shipment.description && shipment.packageDescription && shipment.description !== shipment.packageDescription ? `<p class="shipment-description">${escapeHtml(shipment.description)}</p>` : ''}
          </section>

          ${renderCustomSections(shipment.customSections)}

          <section class="tracking-card timeline-card shipment-history-card">
            <div class="tracking-card-header"><div><p class="eyebrow">Milestone history</p><h2>Tracking timeline</h2></div><span class="shipment-event-count">${timelineItems.length} ${timelineItems.length === 1 ? 'event' : 'events'}</span></div>
            ${recentHistoryHtml}
          </section>
        </div>
      `;
      statusBox.innerHTML = shipmentInfoHtml;
      statusBox.classList.add('tracking-results-card-wrapper');
      statusBox.querySelector('[data-copy-tracking]')?.addEventListener('click', (event) => copyTrackingNumber(shipment.trackingNumber || trackingNumber, event.currentTarget));
    }

    const mapSection = document.getElementById('trackingMapSection');
    const hasMapCoordinates = [shipment.coordinates?.origin, shipment.coordinates?.currentLocation, shipment.coordinates?.destination]
      .some((point) => point && point.lat != null && point.lng != null && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)));
    if (mapSection) {
      mapSection.classList.toggle('hidden', !hasMapCoordinates);
      mapSection.setAttribute('aria-hidden', String(!hasMapCoordinates));
    }

    if (window.GM && typeof window.GM.updateMapFromShipment === 'function') {
      window.GM.updateMapFromShipment(shipment);
      window.setTimeout(() => window.GM.map?.invalidateSize(), 100);
      return;
    }

    if (window.map && shipment.coordinates && shipment.coordinates.currentLocation) {
      const { lat, lng } = shipment.coordinates.currentLocation;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        window.map.setView([lat, lng], 8);
        L.marker([lat, lng]).addTo(window.map).bindPopup(`<b>Status:</b> ${shipment.status || ''}`).openPopup();
      }
    }

  } catch (error) {
    console.error('Error fetching shipment data:', error);
    renderTrackingError('The tracking service is unavailable. Please try again later.');
  }
}

// Track form submission (track.html uses `trackingForm` and `trackingInput`)
document.getElementById('trackingForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const inputVal = document.getElementById('trackingInput')?.value.trim();
  if (inputVal) trackShipment(inputVal);
  else renderTrackingError('Enter a tracking number to search for a shipment.');
});

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.reveal').forEach((element) => element.classList.add('is-visible'));
  const tracking = new URLSearchParams(window.location.search).get('tracking')?.trim();
  const input = document.getElementById('trackingInput');
  if (tracking && input) {
    input.value = tracking;
    trackShipment(tracking);
  }
});

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}