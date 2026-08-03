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

      const detailRows = [
        ['Tracking Number', shipment.trackingNumber],
        ['Current Status', currentStatus],
        ['Shipment Type', shipment.shipmentType],
        ['Courier/Carrier', shipment.carrier],
        ['Mode of Shipment', shipment.modeOfShipment || shipment.cargo?.type || 'Not Available'],
        ['Package Description', shipment.packageDescription || shipment.description || 'Not Available'],
        ['Package Weight', shipment.packageWeight != null ? `${shipment.packageWeight} kg` : (shipment.weight != null ? `${shipment.weight} kg` : 'Not Available')],
        ['Total Freight', shipment.totalFreight != null ? `$${shipment.totalFreight.toFixed(2)}` : 'Not Available'],
        ['Pickup Date', shipment.pickupDate || 'Not Available'],
        ['Pickup Time', shipment.pickupTime || 'Not Available'],
        ['Estimated Delivery Date', shipment.estimatedDelivery || 'Not Available'],
        ['Expected Delivery Time', shipment.expectedDeliveryTime || shipment.deliveryTime || 'Not Available'],
        ['Current Package Location', currentLocationText],
        ['Shipper Name', shipment.shipper?.name || shipment.senderName || 'Not Available'],
        ['Shipper Phone', shipment.shipper?.phone || 'Not Available'],
        ['Shipper Email', shipment.shipper?.email || 'Not Available'],
        ['Shipper Address', [shipment.shipper?.address, shipment.shipper?.city, shipment.shipper?.state, shipment.shipper?.postalCode, shipment.shipper?.country].filter(Boolean).join(', ') || 'Not Available'],
        ['Receiver Name', shipment.receiver?.name || shipment.receiverName || 'Not Available'],
        ['Receiver Phone', shipment.receiver?.phone || 'Not Available'],
        ['Receiver Email', shipment.receiver?.email || 'Not Available'],
        ['Receiver Address', [shipment.receiver?.address, shipment.receiver?.city, shipment.receiver?.state, shipment.receiver?.postalCode, shipment.receiver?.country].filter(Boolean).join(', ') || 'Not Available'],
        ['Origin', originName],
        ['Destination', destinationName],
        ['Departure Airport/Port', shipment.departureAirportPort || 'Not Available'],
        ['Arrival Airport/Port', shipment.arrivalAirportPort || 'Not Available'],
        ['Quantity', shipment.quantity != null ? shipment.quantity : 'Not Available'],
        ['Service Type', shipment.serviceType || 'Not Available'],
        ['Payment Status', shipment.paymentStatus || 'Not Available'],
        ['Reference Number', shipment.referenceNumber || 'Not Available'],
        ['Special Instructions', shipment.specialInstructions || 'Not Available'],
        ['Package Dimensions', shipment.packageDimensions || (shipment.cargo?.dimensions || 'Not Available')],
        ['Insurance', shipment.insurance || 'Not Available']
      ];

      const shipmentInfoHtml = `
        <div class="tracking-results-grid">
          <section class="tracking-card tracking-summary-card">
            <div class="tracking-card-header">
              <div>
                <p class="eyebrow">Shipment summary</p>
                <h2>${escapeHtml(shipment.trackingNumber || 'Tracking details')}</h2>
                <p class="tracking-summary-subtitle">${escapeHtml(originName)} → ${escapeHtml(destinationName)}</p>
              </div>
              <span class="tracking-pill">${escapeHtml(currentStatus)}</span>
            </div>
            <div class="tracking-result-grid">
              <div><strong>Tracking Number</strong><span>${escapeHtml(shipment.trackingNumber || 'Not Available')}</span></div>
              <div><strong>Current Status</strong><span>${escapeHtml(currentStatus)}</span></div>
              <div><strong>Shipment Type</strong><span>${escapeHtml(shipment.shipmentType || 'Not Available')}</span></div>
              <div><strong>Courier/Carrier</strong><span>${escapeHtml(shipment.carrier || 'Not Available')}</span></div>
              <div><strong>Mode of Shipment</strong><span>${escapeHtml(shipment.modeOfShipment || 'Not Available')}</span></div>
              <div><strong>Package Weight</strong><span>${shipment.packageWeight != null ? `${shipment.packageWeight} kg` : (shipment.weight != null ? `${shipment.weight} kg` : 'Not Available')}</span></div>
              <div><strong>Total Freight</strong><span>${shipment.totalFreight != null ? `$${shipment.totalFreight.toFixed(2)}` : 'Not Available'}</span></div>
              <div><strong>Estimated Delivery Date</strong><span>${escapeHtml(shipment.estimatedDelivery || 'Not Available')}</span></div>
              <div><strong>Expected Delivery Time</strong><span>${escapeHtml(shipment.expectedDeliveryTime || shipment.deliveryTime || 'Not Available')}</span></div>
              <div><strong>Current Package Location</strong><span>${escapeHtml(currentLocationText)}</span></div>
              <div><strong>Pickup Date</strong><span>${escapeHtml(shipment.pickupDate || 'Not Available')}</span></div>
              <div><strong>Pickup Time</strong><span>${escapeHtml(shipment.pickupTime || 'Not Available')}</span></div>
              <div class="full"><strong>Package Description</strong><span>${escapeHtml(shipment.packageDescription || shipment.description || 'Not Available')}</span></div>
            </div>
          </section>

          <section class="tracking-card">
            <div class="tracking-card-header"><h3>Shipper information</h3></div>
            <div class="tracking-result-grid">
              <div><strong>Shipper Name</strong><span>${escapeHtml(shipment.shipper?.name || shipment.senderName || 'Not Available')}</span></div>
              <div><strong>Shipper Phone</strong><span>${escapeHtml(shipment.shipper?.phone || 'Not Available')}</span></div>
              <div><strong>Shipper Email</strong><span>${escapeHtml(shipment.shipper?.email || 'Not Available')}</span></div>
              <div><strong>Shipper Company</strong><span>${escapeHtml(shipment.shipper?.company || 'Not Available')}</span></div>
              <div class="full"><strong>Shipper Address</strong><span>${escapeHtml([shipment.shipper?.address, shipment.shipper?.city, shipment.shipper?.state, shipment.shipper?.postalCode, shipment.shipper?.country].filter(Boolean).join(', ') || 'Not Available')}</span></div>
            </div>
          </section>

          <section class="tracking-card">
            <div class="tracking-card-header"><h3>Receiver information</h3></div>
            <div class="tracking-result-grid">
              <div><strong>Receiver Name</strong><span>${escapeHtml(shipment.receiver?.name || shipment.receiverName || 'Not Available')}</span></div>
              <div><strong>Receiver Phone</strong><span>${escapeHtml(shipment.receiver?.phone || 'Not Available')}</span></div>
              <div><strong>Receiver Email</strong><span>${escapeHtml(shipment.receiver?.email || 'Not Available')}</span></div>
              <div><strong>Receiver Company</strong><span>${escapeHtml(shipment.receiver?.company || 'Not Available')}</span></div>
              <div class="full"><strong>Receiver Address</strong><span>${escapeHtml([shipment.receiver?.address, shipment.receiver?.city, shipment.receiver?.state, shipment.receiver?.postalCode, shipment.receiver?.country].filter(Boolean).join(', ') || 'Not Available')}</span></div>
            </div>
          </section>

          <section class="tracking-card">
            <div class="tracking-card-header"><h3>Shipment details</h3></div>
            <div class="tracking-result-grid">
              <div><strong>Origin</strong><span>${escapeHtml(originName)}</span></div>
              <div><strong>Destination</strong><span>${escapeHtml(destinationName)}</span></div>
              <div><strong>Departure Airport/Port</strong><span>${escapeHtml(shipment.departureAirportPort || 'Not Available')}</span></div>
              <div><strong>Arrival Airport/Port</strong><span>${escapeHtml(shipment.arrivalAirportPort || 'Not Available')}</span></div>
              <div><strong>Quantity</strong><span>${escapeHtml(shipment.quantity != null ? String(shipment.quantity) : 'Not Available')}</span></div>
              <div><strong>Service Type</strong><span>${escapeHtml(shipment.serviceType || 'Not Available')}</span></div>
              <div><strong>Payment Status</strong><span>${escapeHtml(shipment.paymentStatus || 'Not Available')}</span></div>
              <div><strong>Reference Number</strong><span>${escapeHtml(shipment.referenceNumber || 'Not Available')}</span></div>
              <div><strong>Package Dimensions</strong><span>${escapeHtml(shipment.packageDimensions || shipment.cargo?.dimensions || 'Not Available')}</span></div>
              <div><strong>Insurance</strong><span>${escapeHtml(shipment.insurance || 'Not Available')}</span></div>
              <div class="full"><strong>Special Instructions</strong><span>${escapeHtml(shipment.specialInstructions || 'Not Available')}</span></div>
            </div>
          </section>

          <section class="tracking-card timeline-card">
            <div class="tracking-card-header"><h3>Shipment timeline</h3></div>
            <ul class="timeline-list">${timelineHtml}</ul>
          </section>

          <section class="tracking-card">
            <div class="tracking-card-header"><h3>Live package map</h3></div>
            <div class="tracking-map-placeholder">
              <p>${escapeHtml(currentLocationText)}</p>
            </div>
          </section>
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