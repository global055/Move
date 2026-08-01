const API_URL = 'http://localhost:5000/api/shipments';

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
    const response = await fetch(`http://localhost:5000/api/shipments/${trackingNumber}`);
    const result = await response.json();

    if (!result.success) {
      alert(result.message || 'Shipment not found!');
      return;
    }

    const shipment = result.data;

    // Update UI elements on your webpage (track.html uses these IDs)
    const statusBox = document.getElementById('statusBox');
    if (statusBox) {
      const currentLocation = shipment.coordinates?.currentLocation;
      const originCoords = shipment.coordinates?.origin;
      const destinationCoords = shipment.coordinates?.destination;
      const currentLocationText = currentLocation?.lat != null && currentLocation?.lng != null
        ? `${currentLocation.lat}, ${currentLocation.lng}`
        : (shipment.currentLocation || 'N/A');
      const originText = originCoords?.lat != null && originCoords?.lng != null
        ? `${originCoords.lat}, ${originCoords.lng}`
        : 'N/A';
      const destinationText = destinationCoords?.lat != null && destinationCoords?.lng != null
        ? `${destinationCoords.lat}, ${destinationCoords.lng}`
        : 'N/A';

      statusBox.innerHTML = `
        <div class="tracking-results-card">
          <h3>Shipment details</h3>
          <div class="tracking-result-row"><span>Tracking #:</span><span>${shipment.trackingNumber || 'N/A'}</span></div>
          <div class="tracking-result-row"><span>Status:</span><span>${shipment.status || 'N/A'}</span></div>
          <div class="tracking-result-row"><span>Origin:</span><span>${shipment.originName || 'N/A'}</span></div>
          <div class="tracking-result-row"><span>Destination:</span><span>${shipment.destinationName || 'N/A'}</span></div>
          <div class="tracking-result-row"><span>Sender:</span><span>${shipment.senderName || 'N/A'}</span></div>
          <div class="tracking-result-row"><span>Receiver:</span><span>${shipment.receiverName || 'N/A'}</span></div>
          <div class="tracking-result-row"><span>Sender location:</span><span>${shipment.senderLocation || 'N/A'}</span></div>
          <div class="tracking-result-row"><span>Receiver location:</span><span>${shipment.receiverLocation || 'N/A'}</span></div>
          <div class="tracking-result-row"><span>Estimated delivery:</span><span>${shipment.estimatedDelivery || 'Pending'}</span></div>
          <div class="tracking-result-row"><span>Origin coords:</span><span>${originText}</span></div>
          <div class="tracking-result-row"><span>Destination coords:</span><span>${destinationText}</span></div>
          <div class="tracking-result-row"><span>Current location:</span><span>${currentLocationText}</span></div>
          <div class="tracking-result-row"><span>Weight (kg):</span><span>${shipment.weight != null ? `${shipment.weight} kg` : 'N/A'}</span></div>
          <div class="tracking-result-row"><span>Description:</span><span>${shipment.description || 'N/A'}</span></div>
        </div>
      `;
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