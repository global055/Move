const API_BASE_URL = 'https://move-2.onrender.com';
const API_URL = `${API_BASE_URL}/api/shipments`;

// Load shipments and populate datalist on page load
window.addEventListener('DOMContentLoaded', () => {
  loadTrackingDatalist();
});

async function loadTrackingDatalist() {
  try {
    const response = await fetch(API_URL);
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

  datalist.innerHTML = shipments
    .filter((shipment) => shipment.trackingNumber)
    .map((shipment) => `<option value="${escapeHtml(shipment.trackingNumber)}"></option>`)
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
        : (shipment.currentLocationName || shipment.currentLocation || 'N/A');
      const originText = originCoords?.lat != null && originCoords?.lng != null
        ? `${originCoords.lat.toFixed(4)}, ${originCoords.lng.toFixed(4)}`
        : shipment.originName || 'N/A';
      const destinationText = destinationCoords?.lat != null && destinationCoords?.lng != null
        ? `${destinationCoords.lat.toFixed(4)}, ${destinationCoords.lng.toFixed(4)}`
        : shipment.destinationName || 'N/A';

      const timelineItems = Array.isArray(shipment.timeline) ? [...shipment.timeline].reverse() : [];
      const timelineHtml = timelineItems.length > 0 ? timelineItems.map((item, index) => {
        const date = item.timestamp ? new Date(item.timestamp) : null;
        const isCurrent = index === 0;
        return `
          <li class="timeline-item ${isCurrent ? 'current-step' : ''}">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
              <div class="timeline-top">
                <span class="timeline-status">${escapeHtml(item.status || 'Unknown')}</span>
                <span class="timeline-date">${date ? date.toLocaleDateString() : 'N/A'}</span>
              </div>
              <div class="timeline-meta">
                <span>${escapeHtml(item.location || 'Unknown location')}</span>
                <span>${date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
              </div>
              <p>${escapeHtml(item.description || 'No details available.')}</p>
              ${item.updatedBy ? `<small>Updated by ${escapeHtml(item.updatedBy)}</small>` : ''}
            </div>
          </li>
        `;
      }).join('') : '<li class="timeline-item"><div class="timeline-marker"></div><div class="timeline-content"><p>No timeline entries available.</p></div></li>';

      statusBox.innerHTML = `
        <div class="tracking-results-grid">
          <section class="tracking-card tracking-summary-card">
            <div class="tracking-card-header">
              <div>
                <p class="eyebrow">Shipment summary</p>
                <h2>${escapeHtml(shipment.trackingNumber || 'Tracking details')}</h2>
              </div>
              <span class="tracking-pill">${escapeHtml(shipment.status || 'Unknown')}</span>
            </div>
            <div class="tracking-result-grid">
              <div><strong>Shipment type</strong><span>${escapeHtml(shipment.shipmentType || 'N/A')}</span></div>
              <div><strong>Carrier</strong><span>${escapeHtml(shipment.carrier || 'N/A')}</span></div>
              <div><strong>Total freight</strong><span>${shipment.totalFreight != null ? `$${shipment.totalFreight.toFixed(2)}` : 'N/A'}</span></div>
              <div><strong>Weight</strong><span>${shipment.weight != null ? `${shipment.weight} kg` : 'N/A'}</span></div>
              <div><strong>Origin</strong><span>${escapeHtml(shipment.originName || 'N/A')}</span></div>
              <div><strong>Destination</strong><span>${escapeHtml(shipment.destinationName || 'N/A')}</span></div>
              <div><strong>Current location</strong><span>${escapeHtml(currentLocationText)}</span></div>
              <div class="full"><strong>Description</strong><span>${escapeHtml(shipment.description || 'N/A')}</span></div>
            </div>
          </section>

          <section class="tracking-card">
            <div class="tracking-card-header"><h3>Shipping information</h3></div>
            <div class="tracking-result-grid">
              <div><strong>Pickup date</strong><span>${escapeHtml(shipment.pickupDate || 'N/A')}</span></div>
              <div><strong>Pickup time</strong><span>${escapeHtml(shipment.pickupTime || 'N/A')}</span></div>
              <div><strong>Estimated delivery</strong><span>${escapeHtml(shipment.estimatedDelivery || 'N/A')}</span></div>
              <div><strong>Expected delivery</strong><span>${escapeHtml(shipment.expectedDeliveryTime || 'N/A')}</span></div>
              <div><strong>Delivery time</strong><span>${escapeHtml(shipment.deliveryTime || 'N/A')}</span></div>
              <div><strong>Origin coordinates</strong><span>${escapeHtml(originText)}</span></div>
              <div><strong>Destination coordinates</strong><span>${escapeHtml(destinationText)}</span></div>
              <div class="full"><strong>Route</strong><span>${escapeHtml(shipment.originName || 'N/A')} → ${escapeHtml(shipment.destinationName || 'N/A')}</span></div>
            </div>
          </section>

          <section class="tracking-card">
            <div class="tracking-card-header"><h3>Package information</h3></div>
            <div class="tracking-result-grid">
              <div><strong>Cargo type</strong><span>${escapeHtml(typeof shipment.cargo === 'string' ? shipment.cargo : shipment.cargo?.type || 'N/A')}</span></div>
              <div><strong>Pieces</strong><span>${shipment.cargo?.pieces != null ? escapeHtml(String(shipment.cargo.pieces)) : 'N/A'}</span></div>
              <div><strong>Volume</strong><span>${shipment.cargo?.volume != null ? `${escapeHtml(String(shipment.cargo.volume))} m³` : 'N/A'}</span></div>
              <div><strong>Dimensions</strong><span>${escapeHtml(shipment.cargo?.dimensions || 'N/A')}</span></div>
              <div><strong>Cargo value</strong><span>${shipment.cargo?.value != null ? `$${shipment.cargo.value}` : 'N/A'}</span></div>
              <div><strong>Incoterms</strong><span>${escapeHtml(shipment.cargo?.incoterms || 'N/A')}</span></div>
              <div><strong>Dangerous goods</strong><span>${shipment.cargo?.dangerousGoods != null ? (shipment.cargo.dangerousGoods ? 'Yes' : 'No') : 'N/A'}</span></div>
              <div class="full"><strong>Cargo description</strong><span>${escapeHtml(shipment.cargo?.description || 'N/A')}</span></div>
              <div class="full"><strong>Instructions</strong><span>${escapeHtml(shipment.cargo?.specialInstructions || 'N/A')}</span></div>
            </div>
          </section>

          <section class="tracking-card">
            <div class="tracking-card-header"><h3>Contacts</h3></div>
            <div class="tracking-result-grid">
              <div><strong>Shipper</strong><span>${escapeHtml(shipment.shipper?.company || shipment.shipper?.name || 'N/A')}</span></div>
              <div><strong>Receiver</strong><span>${escapeHtml(shipment.receiver?.company || shipment.receiver?.name || 'N/A')}</span></div>
              <div><strong>Shipper phone</strong><span>${escapeHtml(shipment.shipper?.phone || 'N/A')}</span></div>
              <div><strong>Receiver phone</strong><span>${escapeHtml(shipment.receiver?.phone || 'N/A')}</span></div>
              <div><strong>Shipper location</strong><span>${escapeHtml(shipment.senderLocation || 'N/A')}</span></div>
              <div><strong>Receiver location</strong><span>${escapeHtml(shipment.receiverLocation || 'N/A')}</span></div>
              <div class="full"><strong>Shipper address</strong><span>${escapeHtml(shipment.shipper?.address || 'N/A')}</span></div>
              <div class="full"><strong>Receiver address</strong><span>${escapeHtml(shipment.receiver?.address || 'N/A')}</span></div>
            </div>
          </section>

          <section class="tracking-card timeline-card">
            <div class="tracking-card-header"><h3>Timeline</h3></div>
            <ul class="timeline-list">${timelineHtml}</ul>
          </section>
        </div>
      `;
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