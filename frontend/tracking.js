const API_BASE_URL = '';
const API_URL = `${API_BASE_URL}/api/public/shipments`;
const TRACKING_NUMBERS_URL = `${API_BASE_URL}/api/public/shipments/tracking-numbers`;

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

function getStatusMeta(status) {
  const normalized = String(status || 'In Transit').trim().toLowerCase();
  if (normalized.includes('delivered')) {
    return { className: 'status-delivered', label: 'Delivered', icon: '🟢' };
  }
  if (normalized.includes('arriving soon')) {
    return { className: 'status-arriving', label: 'Arriving Soon', icon: '🟠' };
  }
  if (normalized.includes('out for delivery')) {
    return { className: 'status-arriving', label: 'Out for Delivery', icon: '🟠' };
  }
  if (normalized.includes('arrived at facility')) {
    return { className: 'status-in-transit', label: 'Arrived at Facility', icon: '🔵' };
  }
  if (normalized.includes('shipment accepted')) {
    return { className: 'status-in-transit', label: 'Shipment Accepted', icon: '🔵' };
  }
  if (normalized.includes('delayed')) {
    return { className: 'status-delayed', label: 'Delayed', icon: '🔴' };
  }
  if (normalized.includes('pending') || normalized.includes('order received') || normalized.includes('processing')) {
    return { className: 'status-pending', label: 'Pending', icon: '⚪' };
  }
  if (normalized.includes('label')) {
    return { className: 'status-pending', label: 'Label Created', icon: '⚪' };
  }
  if (normalized.includes('hold')) {
    return { className: 'status-delayed', label: 'On Hold', icon: '🔴' };
  }
  if (normalized.includes('exception')) {
    return { className: 'status-delayed', label: 'Exception', icon: '🔴' };
  }
  if (normalized.includes('returned')) {
    return { className: 'status-delayed', label: 'Returned', icon: '🔴' };
  }
  if (normalized.includes('cancel')) {
    return { className: 'status-delayed', label: 'Cancelled', icon: '🔴' };
  }
  return { className: 'status-in-transit', label: 'In Transit', icon: '🔵' };
}

function renderStatusPill(status) {
  const meta = getStatusMeta(status);
  return `<span class="tracking-pill ${meta.className}">${meta.icon} ${escapeHtml(meta.label)}</span>`;
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
  const location = latestUpdate.location || shipment.deliveryLocation || shipment.currentLocationName || shipment.currentPackageLocation || '';
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

    const statusBox = document.getElementById('statusBox');
    if (statusBox) {
      const currentLocation = shipment.coordinates?.currentLocation;
      const originCoords = shipment.coordinates?.origin;
      const destinationCoords = shipment.coordinates?.destination;
      const currentLocationText = currentLocation?.lat != null && currentLocation?.lng != null
        ? `${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}`
        : (shipment.currentLocationName || shipment.currentPackageLocation || shipment.currentLocation || 'Not Available');
      const originText = originCoords?.lat != null && originCoords?.lng != null
        ? `${originCoords.lat.toFixed(4)}, ${originCoords.lng.toFixed(4)}`
        : shipment.originName || shipment.origin || 'Not Available';
      const destinationText = destinationCoords?.lat != null && destinationCoords?.lng != null
        ? `${destinationCoords.lat.toFixed(4)}, ${destinationCoords.lng.toFixed(4)}`
        : shipment.destinationName || shipment.destination || 'Not Available';
      const originName = shipment.origin || shipment.originName || 'Not Available';
      const destinationName = shipment.destination || shipment.destinationName || 'Not Available';
      const currentStatus = shipment.status || 'In Transit';
      const timelineItems = Array.isArray(shipment.timeline)
        ? [...shipment.timeline].sort((a, b) => timelineSortValue(b) - timelineSortValue(a))
        : [];
      const timelineHtml = timelineItems.length > 0 ? timelineItems.map((item, index) => {
        const displayDate = item.date || (item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'Not Available');
        const displayTime = item.time || (item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not Available');
        const displayRemarks = item.remarks || item.description || 'No remarks provided.';
        const displayLocation = item.location || item.currentLocationName || 'Not Available';
        const isCurrent = index === 0;
        return `
          <li class="timeline-item ${isCurrent ? 'current-step' : ''}">
            <div class="timeline-marker"></div>
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
              ${item.updatedBy ? `<small>Updated by ${escapeHtml(item.updatedBy)}</small>` : ''}
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

      const summaryCards = `
        <div class="tracking-overview">
          <div class="tracking-highlight">
            <span class="tracking-highlight__label">Package Weight</span>
            <strong class="tracking-highlight__value">${escapeHtml(packageWeight)}</strong>
          </div>
          <div class="tracking-highlight">
            <span class="tracking-highlight__label">Estimated Delivery</span>
            <strong class="tracking-highlight__value">${escapeHtml(estimatedDelivery)}</strong>
          </div>
          <div class="tracking-highlight tracking-highlight--wide">
            <span class="tracking-highlight__label">Description</span>
            <strong class="tracking-highlight__value">${escapeHtml(description)}</strong>
          </div>
          <div class="tracking-highlight tracking-highlight--wide">
            <span class="tracking-highlight__label">Latest Update</span>
            <strong class="tracking-highlight__value">${escapeHtml(latestUpdate.title || latestUpdate.status || 'No latest update available')}</strong>
            <span>${escapeHtml([latestUpdate.location, latestUpdate.date, latestUpdate.time].filter(Boolean).join(' · '))}</span>
          </div>
          <div class="tracking-highlight">
            <span class="tracking-highlight__label">Shipment Status</span>
            <strong class="tracking-highlight__value">${renderStatusPill(currentStatus)}</strong>
          </div>
          <div class="tracking-highlight">
            <span class="tracking-highlight__label">Current Location</span>
            <strong class="tracking-highlight__value">${escapeHtml(currentLocationText || 'Not available')}</strong>
          </div>
          <div class="tracking-highlight">
            <span class="tracking-highlight__label">Tracking Number</span>
            <strong class="tracking-highlight__value">${escapeHtml(shipment.trackingNumber || trackingNumber)}</strong>
          </div>
        </div>
      `;

      const summaryRows = [
        ['Tracking Number', shipment.trackingNumber],
        ['Sender', shipment.senderName],
        ['Receiver', shipment.receiverName],
        ['Current Status', currentStatus],
        ['Shipment Type', shipment.shipmentType],
        ['Courier/Carrier', shipment.carrier],
        ['Mode of Shipment', shipment.modeOfShipment || shipment.cargo?.type],
        ['Package Weight', packageWeight],
        ['Total Freight', shipment.totalFreight != null ? `$${shipment.totalFreight.toFixed(2)}` : ''],
        ['Estimated Delivery Date', shipment.estimatedDelivery],
        ['Expected Delivery Time', shipment.expectedDeliveryTime],
        ['Pickup', pickupDateTime],
        ['Delivery', deliveryDateTime],
        ['Current Package Location', currentLocationText]
      ].map(([label, value]) => buildFieldRow(label, value)).filter(Boolean).join('');

      const shipperRows = [
        ['Shipper Name', shipment.shipper?.name || shipment.senderName],
        ['Shipper Phone', shipment.shipper?.phone],
        ['Shipper Email', shipment.shipper?.email],
        ['Shipper Company', shipment.shipper?.company],
        ['Shipper Address', [shipment.shipper?.address, shipment.shipper?.city, shipment.shipper?.state, shipment.shipper?.postalCode, shipment.shipper?.country]]
      ].map(([label, value]) => Array.isArray(value) ? buildAddressRow(label, value) : buildFieldRow(label, value)).filter(Boolean).join('');

      const receiverRows = [
        ['Receiver Name', shipment.receiver?.name || shipment.receiverName],
        ['Receiver Phone', shipment.receiver?.phone],
        ['Receiver Email', shipment.receiver?.email],
        ['Receiver Company', shipment.receiver?.company],
        ['Receiver Address', [shipment.receiver?.address, shipment.receiver?.city, shipment.receiver?.state, shipment.receiver?.postalCode, shipment.receiver?.country]]
      ].map(([label, value]) => Array.isArray(value) ? buildAddressRow(label, value) : buildFieldRow(label, value)).filter(Boolean).join('');

      const shipmentDetailsRows = [
        ['Origin', originName],
        ['Destination', destinationName],
        ['Origin coordinates', originCoords?.lat != null && originCoords?.lng != null ? `${originCoords.lat.toFixed(4)}, ${originCoords.lng.toFixed(4)}` : ''],
        ['Destination coordinates', destinationCoords?.lat != null && destinationCoords?.lng != null ? `${destinationCoords.lat.toFixed(4)}, ${destinationCoords.lng.toFixed(4)}` : ''],
        ['Departure Airport/Port', shipment.departureAirportPort],
        ['Arrival Airport/Port', shipment.arrivalAirportPort],
        ['Pickup Date', shipment.pickupDate],
        ['Pickup Time', shipment.pickupTime],
        ['Delivery Date', shipment.deliveryDate],
        ['Delivery Time', shipment.deliveryTime],
        ['Quantity', shipment.quantity != null ? shipment.quantity : ''],
        ['Service Type', shipment.serviceType],
        ['Payment Status', shipment.paymentStatus],
        ['Reference Number', shipment.referenceNumber],
        ['Package Dimensions', shipment.packageDimensions || shipment.cargo?.dimensions],
        ['Insurance', shipment.insurance],
        ['Weight', shipment.weight != null ? `${shipment.weight} kg` : ''],
        ['Package Description', shipment.packageDescription || shipment.description],
        ['Description', shipment.description],
        ['Current Location', shipment.currentLocationName || shipment.currentPackageLocation || shipment.currentLocation],
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

      const recentHistoryHtml = timelineItems.length
        ? `<ul class="timeline-list">${timelineHtml}</ul>`
        : '<div class="tracking-empty-history">No tracking history is available yet.</div>';

      const shipmentInfoHtml = `
        <div class="tracking-results-grid">
          <section class="tracking-card tracking-summary-card">
            <div class="tracking-card-header">
              <div>
                <p class="eyebrow">Shipment summary</p>
                <h2 class="tracking-number-heading">${escapeHtml(shipment.trackingNumber || 'Tracking details')}</h2>
                <p class="tracking-summary-subtitle">${escapeHtml(originName)} → ${escapeHtml(destinationName)}</p>
              </div>
              <div class="tracking-summary-actions">${currentStatus ? renderStatusPill(currentStatus) : ''}<button type="button" class="copy-button" data-copy-tracking>Copy</button></div>
            </div>
            <a class="tracking-details-link" href="tracking-details.html?tracking=${encodeURIComponent(shipment.trackingNumber || trackingNumber)}">See All Tracking Details <span aria-hidden="true">→</span></a>
            ${renderStatusContext(currentStatus, shipment, latestUpdate)}
            ${summaryCards}
            <div class="tracking-confirmation">Tracking confirmed for ${escapeHtml(shipment.trackingNumber || trackingNumber)}</div>
            <a class="more-details-button" href="tracking-details.html?tracking=${encodeURIComponent(shipment.trackingNumber || trackingNumber)}">More Details <span aria-hidden="true">→</span></a>
            <div class="tracking-result-grid">
              ${summaryRows}
            </div>
          </section>

          ${shipperRows ? `
            <section class="tracking-card">
              <div class="tracking-card-header"><h3>Shipper information</h3></div>
              <div class="tracking-result-grid">
                ${shipperRows}
              </div>
            </section>
          ` : ''}

          ${receiverRows ? `
            <section class="tracking-card">
              <div class="tracking-card-header"><h3>Receiver information</h3></div>
              <div class="tracking-result-grid">
                ${receiverRows}
              </div>
            </section>
          ` : ''}

          ${shipmentDetailsRows ? `
            <section class="tracking-card">
              <div class="tracking-card-header"><h3>Shipment details</h3></div>
              <div class="tracking-result-grid">
                ${shipmentDetailsRows}
              </div>
            </section>
          ` : ''}

          <section class="tracking-card timeline-card">
            <div class="tracking-card-header"><h3>Recent Tracking Events</h3></div>
            ${recentHistoryHtml}
          </section>

          ${hasDisplayValue(currentLocationText) ? `
            <section class="tracking-card">
              <div class="tracking-card-header"><h3>Live package map</h3></div>
              <div class="tracking-map-placeholder">
                <p>${escapeHtml(currentLocationText)}</p>
              </div>
            </section>
          ` : ''}
        </div>
      `;
      statusBox.innerHTML = shipmentInfoHtml;
      statusBox.classList.add('tracking-results-card-wrapper');
      statusBox.querySelector('[data-copy-tracking]')?.addEventListener('click', (event) => copyTrackingNumber(shipment.trackingNumber || trackingNumber, event.currentTarget));
    }

    if (window.GM && typeof window.GM.updateMapFromShipment === 'function') {
      window.GM.updateMapFromShipment(shipment);
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