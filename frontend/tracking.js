const API_BASE_URL = 'https://move-638e.onrender.com';
const API_URL = `${API_BASE_URL}/api/shipments`;
const TRACKING_NUMBERS_URL = `${API_BASE_URL}/api/shipments/tracking-numbers`;

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

// Function to handle tracking lookup
async function trackShipment(trackingNumber) {
  try {
    const response = await fetch(`${API_URL}/${trackingNumber}`);
    const result = await response.json();

    if (!result.success) {
      alert(result.message || 'Shipment not found!');
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
      const timelineItems = Array.isArray(shipment.timeline) ? [...shipment.timeline].reverse() : [];
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
                <span class="timeline-status">${escapeHtml(item.status || currentStatus)}</span>
                <span class="timeline-date">${escapeHtml(displayDate)}</span>
              </div>
              <div class="timeline-meta">
                <span>${escapeHtml(displayLocation)}</span>
                <span>${escapeHtml(displayTime)}</span>
              </div>
              <p>${escapeHtml(displayRemarks)}</p>
              ${item.updatedBy ? `<small>Updated by ${escapeHtml(item.updatedBy)}</small>` : ''}
            </div>
          </li>
        `;
      }).join('') : '<li class="timeline-item"><div class="timeline-marker"></div><div class="timeline-content"><p>No timeline entries available.</p></div></li>';

      const summaryRows = [
        ['Tracking Number', shipment.trackingNumber],
        ['Sender', shipment.senderName],
        ['Receiver', shipment.receiverName],
        ['Current Status', currentStatus],
        ['Shipment Type', shipment.shipmentType],
        ['Courier/Carrier', shipment.carrier],
        ['Mode of Shipment', shipment.modeOfShipment || shipment.cargo?.type],
        ['Package Weight', shipment.packageWeight != null ? `${shipment.packageWeight} kg` : (shipment.weight != null ? `${shipment.weight} kg` : '')],
        ['Total Freight', shipment.totalFreight != null ? `$${shipment.totalFreight.toFixed(2)}` : ''],
        ['Estimated Delivery Date', shipment.estimatedDelivery],
        ['Expected Delivery Time', shipment.expectedDeliveryTime],
        ['Pickup Date', shipment.pickupDate],
        ['Pickup Time', shipment.pickupTime],
        ['Delivery Date', shipment.deliveryDate],
        ['Delivery Time', shipment.deliveryTime],
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

      const shipmentInfoHtml = `
        <div class="tracking-results-grid">
          <section class="tracking-card tracking-summary-card">
            <div class="tracking-card-header">
              <div>
                <p class="eyebrow">Shipment summary</p>
                <h2>${escapeHtml(shipment.trackingNumber || 'Tracking details')}</h2>
                <p class="tracking-summary-subtitle">${escapeHtml(originName)} → ${escapeHtml(destinationName)}</p>
              </div>
              ${currentStatus ? `<span class="tracking-pill">${escapeHtml(currentStatus)}</span>` : ''}
            </div>
            <div class="tracking-result-grid">
              ${summaryRows}
            </div>
            <div style="margin-top: 12px; color: #0b7a3b; font-weight: 700;">Tracking confirmed for ${escapeHtml(shipment.trackingNumber || trackingNumber)}</div>
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

          ${timelineItems.length > 0 ? `
            <section class="tracking-card timeline-card">
              <div class="tracking-card-header"><h3>Shipment timeline</h3></div>
              <ul class="timeline-list">${timelineHtml}</ul>
            </section>
          ` : ''}

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
    alert('Unable to connect to the backend server.');
  }
}

// Track form submission (track.html uses `trackingForm` and `trackingInput`)
document.getElementById('trackingForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const inputVal = document.getElementById('trackingInput')?.value.trim();
  if (inputVal) trackShipment(inputVal);
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