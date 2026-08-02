const API_BASE_URL = '';
const API_URL = '/api/shipments';

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

      const originName = shipment.origin || shipment.originName || 'N/A';
      const destinationName = shipment.destination || shipment.destinationName || 'N/A';
      const cargoType = shipment.cargoType || shipment.cargo?.type || 'N/A';

      const shipmentInfoHtml = `
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
              <div><strong>Cargo type</strong><span>${escapeHtml(cargoType)}</span></div>
              <div><strong>Origin</strong><span>${escapeHtml(originName)}</span></div>
              <div><strong>Destination</strong><span>${escapeHtml(destinationName)}</span></div>
              <div><strong>Pickup date</strong><span>${escapeHtml(shipment.pickupDate || 'N/A')}</span></div>
              <div><strong>Pickup time</strong><span>${escapeHtml(shipment.pickupTime || 'N/A')}</span></div>
              <div><strong>Expected delivery</strong><span>${escapeHtml(shipment.expectedDeliveryTime || 'N/A')}</span></div>
              <div><strong>Delivery time</strong><span>${escapeHtml(shipment.deliveryTime || 'N/A')}</span></div>
              <div><strong>Current location</strong><span>${escapeHtml(currentLocationText)}</span></div>
              <div><strong>Route</strong><span>${escapeHtml(originName)} → ${escapeHtml(destinationName)}</span></div>
              <div><strong>Current coordinates</strong><span>${currentLocation?.lat != null && currentLocation?.lng != null ? `${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}` : 'N/A'}</span></div>
              <div><strong>Origin coordinates</strong><span>${originText}</span></div>
              <div><strong>Destination coordinates</strong><span>${destinationText}</span></div>
              <div class="full"><strong>Description</strong><span>${escapeHtml(shipment.description || 'N/A')}</span></div>
            </div>
          </section>

          <section class="tracking-card">
            <div class="tracking-card-header"><h3>Sender & receiver</h3></div>
            <div class="tracking-result-grid">
              <div><strong>Sender</strong><span>${escapeHtml(shipment.senderName || 'N/A')}</span></div>
              <div><strong>Receiver</strong><span>${escapeHtml(shipment.receiverName || 'N/A')}</span></div>
              <div><strong>Shipper company</strong><span>${escapeHtml(shipment.shipper?.company || 'N/A')}</span></div>
              <div><strong>Receiver company</strong><span>${escapeHtml(shipment.receiver?.company || 'N/A')}</span></div>
              <div><strong>Shipper phone</strong><span>${escapeHtml(shipment.shipper?.phone || 'N/A')}</span></div>
              <div><strong>Receiver phone</strong><span>${escapeHtml(shipment.receiver?.phone || 'N/A')}</span></div>
              <div><strong>Shipper email</strong><span>${escapeHtml(shipment.shipper?.email || 'N/A')}</span></div>
              <div><strong>Receiver email</strong><span>${escapeHtml(shipment.receiver?.email || 'N/A')}</span></div>
              <div class="full"><strong>Shipper address</strong><span>${escapeHtml(shipment.shipper?.address || 'N/A')}</span></div>
              <div class="full"><strong>Receiver address</strong><span>${escapeHtml(shipment.receiver?.address || 'N/A')}</span></div>
              <div><strong>Shipper city</strong><span>${escapeHtml(shipment.shipper?.city || 'N/A')}</span></div>
              <div><strong>Receiver city</strong><span>${escapeHtml(shipment.receiver?.city || 'N/A')}</span></div>
              <div><strong>Shipper state</strong><span>${escapeHtml(shipment.shipper?.state || 'N/A')}</span></div>
              <div><strong>Receiver state</strong><span>${escapeHtml(shipment.receiver?.state || 'N/A')}</span></div>
              <div><strong>Shipper postal code</strong><span>${escapeHtml(shipment.shipper?.postalCode || 'N/A')}</span></div>
              <div><strong>Receiver postal code</strong><span>${escapeHtml(shipment.receiver?.postalCode || 'N/A')}</span></div>
              <div><strong>Shipper country</strong><span>${escapeHtml(shipment.shipper?.country || 'N/A')}</span></div>
              <div><strong>Receiver country</strong><span>${escapeHtml(shipment.receiver?.country || 'N/A')}</span></div>
            </div>
          </section>

          <section class="tracking-card">
            <div class="tracking-card-header"><h3>Cargo details</h3></div>
            <div class="tracking-result-grid">
              <div><strong>Cargo type</strong><span>${escapeHtml(typeof shipment.cargo === 'string' ? shipment.cargo : shipment.cargo?.type || 'N/A')}</span></div>
              <div><strong>Pieces</strong><span>${shipment.cargo?.pieces != null ? escapeHtml(String(shipment.cargo.pieces)) : 'N/A'}</span></div>
              <div><strong>Cargo weight</strong><span>${shipment.cargo?.weight != null ? `${shipment.cargo.weight} kg` : 'N/A'}</span></div>
              <div><strong>Volume</strong><span>${shipment.cargo?.volume != null ? `${escapeHtml(String(shipment.cargo.volume))} m³` : 'N/A'}</span></div>
              <div><strong>Dimensions</strong><span>${escapeHtml(shipment.cargo?.dimensions || 'N/A')}</span></div>
              <div><strong>Declared value</strong><span>${shipment.cargo?.value != null ? `$${shipment.cargo.value}` : 'N/A'}</span></div>
              <div><strong>Incoterms</strong><span>${escapeHtml(shipment.cargo?.incoterms || 'N/A')}</span></div>
              <div><strong>Dangerous goods</strong><span>${shipment.cargo?.dangerousGoods != null ? (shipment.cargo.dangerousGoods ? 'Yes' : 'No') : 'N/A'}</span></div>
              <div class="full"><strong>Cargo description</strong><span>${escapeHtml(shipment.cargo?.description || 'N/A')}</span></div>
              <div class="full"><strong>Special instructions</strong><span>${escapeHtml(shipment.cargo?.specialInstructions || 'N/A')}</span></div>
            </div>
          </section>

          <section class="tracking-card timeline-card">
            <div class="tracking-card-header"><h3>Timeline</h3></div>
            <ul class="timeline-list">${timelineHtml}</ul>
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