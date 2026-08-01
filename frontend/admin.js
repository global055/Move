const API_BASE_URL = 'https://move-2.onrender.com';
const API_URL = `${API_BASE_URL}/api/shipments`;
const ADMIN_CHECK_URL = `${API_BASE_URL}/api/admin/check`;
const ADMIN_LOGOUT_URL = `${API_BASE_URL}/api/admin/logout`;
const SESSION_TOKEN_KEY = 'gm_admin_token';

let shipmentsCache = [];
let shipmentMap = null;
let mapLayerGroup = null;
let selectedMarker = null;
let activePackageAnimationFrame = null;

window.addEventListener('DOMContentLoaded', async () => {
  const admin = await verifyAdminSession();
  if (!admin) return;
  const adminUserBadge = document.getElementById('adminUserBadge');
  if (adminUserBadge) {
    adminUserBadge.textContent = admin.email;
  }
  initAdminDashboard();
});

function initAdminDashboard() {
  hideMapSection();
  attachUiHandlers();
  loadShipments();
}

function attachUiHandlers() {
  const shipmentForm = document.getElementById('shipmentForm');
  if (shipmentForm) {
    shipmentForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveShipment();
    });
  }

  document.getElementById('cancelEditBtn')?.addEventListener('click', resetShipmentForm);
  document.getElementById('resetFormBtn')?.addEventListener('click', resetShipmentForm);
  document.getElementById('seedSampleBtn')?.addEventListener('click', seedSampleShipments);
  document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

  const trackingNumberInput = document.getElementById('trackingNumber');
  trackingNumberInput?.addEventListener('blur', handleTrackingNumberBlur);

  document.getElementById('searchInput')?.addEventListener('input', applyFilters);
  document.getElementById('statusFilter')?.addEventListener('change', applyFilters);
}

async function loadShipments() {
  try {
    const response = await fetch(API_URL, { headers: getAuthHeaders() });
    const result = await response.json();

    if (result.success && Array.isArray(result.data)) {
      shipmentsCache = result.data;
      renderTrackingDatalist(shipmentsCache);
      renderTable(shipmentsCache);
      renderStats(shipmentsCache);
      renderShipmentDetails(null);
    } else if (result && result.message) {
      redirectIfUnauthorized(result);
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

function handleTrackingNumberBlur(event) {
  const trackingNumber = event.target.value.trim();
  if (!trackingNumber) return;

  const shipment = shipmentsCache.find((entry) => entry.trackingNumber === trackingNumber);
  if (shipment) {
    populateShipmentForm(shipment);
  }
}

function populateShipmentForm(shipment) {
  setVal('shipmentId', shipment._id);
  setVal('trackingNumber', shipment.trackingNumber);
  setVal('senderName', shipment.senderName);
  setVal('receiverName', shipment.receiverName);
  setVal('origin', shipment.originName);
  setVal('destination', shipment.destinationName);
  setVal('estimatedDelivery', shipment.estimatedDelivery);
  setVal('status', shipment.status);
  setVal('weight', shipment.weight);
  setVal('description', shipment.description);

  if (shipment.coordinates) {
    setVal('originLat', shipment.coordinates.origin?.lat);
    setVal('originLng', shipment.coordinates.origin?.lng);
    setVal('destLat', shipment.coordinates.destination?.lat);
    setVal('destLng', shipment.coordinates.destination?.lng);
    setVal('currentLat', shipment.coordinates.currentLocation?.lat);
    setVal('currentLng', shipment.coordinates.currentLocation?.lng);
    setVal(
      'currentLocation',
      shipment.coordinates.currentLocation
        ? `${shipment.coordinates.currentLocation.lat}, ${shipment.coordinates.currentLocation.lng}`
        : shipment.currentLocation || ''
    );
  } else {
    setVal('currentLocation', shipment.currentLocation || '');
  }

  renderShipmentDetails(shipment);
  showShipmentOnMap(shipment);
}

function validateShipmentPayload(payload) {
  if (!payload.trackingNumber) return 'Tracking number is required.';
  if (!payload.senderName) return 'Sender name is required.';
  if (!payload.receiverName) return 'Receiver name is required.';
  if (!payload.originName) return 'Origin is required.';
  if (!payload.destinationName) return 'Destination is required.';
  if (!payload.estimatedDelivery) return 'Estimated delivery date is required.';
  if (!payload.status) return 'Status is required.';

  const originLat = getVal('originLat');
  const originLng = getVal('originLng');
  if ((originLat && !originLng) || (!originLat && originLng)) {
    return 'Origin latitude and longitude must both be provided or both left blank.';
  }

  const destLat = getVal('destLat');
  const destLng = getVal('destLng');
  if ((destLat && !destLng) || (!destLat && destLng)) {
    return 'Destination latitude and longitude must both be provided or both left blank.';
  }

  const currentLat = getVal('currentLat');
  const currentLng = getVal('currentLng');
  if ((currentLat && !currentLng) || (!currentLat && currentLng)) {
    return 'Current latitude and longitude must both be provided or both left blank.';
  }

  return null;
}

function renderTable(shipments) {
  const tableBody = document.getElementById('shipmentsTableBody');
  if (!tableBody) return;

  if (!shipments.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding: 24px; color: #666;">No shipments found.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = shipments.map((s) => `
    <tr onclick="selectShipment('${escapeHtml(s.trackingNumber)}')" style="cursor:pointer;">
      <td><strong>${escapeHtml(s.trackingNumber || 'N/A')}</strong></td>
      <td>${escapeHtml(s.senderName || 'N/A')}</td>
      <td>${escapeHtml(s.originName || 'N/A')} → ${escapeHtml(s.destinationName || 'N/A')}</td>
      <td><span style="color: #28a745; font-weight: bold;">${escapeHtml(s.status || 'In Transit')}</span></td>
      <td>${escapeHtml(s.estimatedDelivery || 'N/A')}</td>
      <td>
        <button type="button" onclick="event.stopPropagation(); editShipment('${escapeHtml(s.trackingNumber)}');">Edit</button>
        <button type="button" onclick="event.stopPropagation(); deleteShipment('${escapeHtml(s.trackingNumber)}');" style="color: red;">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function editShipment(trackingNumber) {
  try {
    const response = await fetch(`${API_URL}/${encodeURIComponent(trackingNumber)}`, { headers: getAuthHeaders() });
    const result = await response.json();

    if (result.success) {
      const s = result.data;

      setVal('shipmentId', s._id);
      setVal('trackingNumber', s.trackingNumber);
      setVal('senderName', s.senderName);
      setVal('receiverName', s.receiverName);
      setVal('origin', s.originName);
      setVal('destination', s.destinationName);
      setVal('estimatedDelivery', s.estimatedDelivery);
      setVal('status', s.status);
      setVal('weight', s.weight);
      setVal('description', s.description);

      if (s.coordinates) {
        setVal('originLat', s.coordinates.origin?.lat);
        setVal('originLng', s.coordinates.origin?.lng);
        setVal('destLat', s.coordinates.destination?.lat);
        setVal('destLng', s.coordinates.destination?.lng);
        setVal('currentLat', s.coordinates.currentLocation?.lat);
        setVal('currentLng', s.coordinates.currentLocation?.lng);
        setVal(
          'currentLocation',
          s.coordinates.currentLocation
            ? `${s.coordinates.currentLocation.lat}, ${s.coordinates.currentLocation.lng}`
            : s.currentLocation || ''
        );
      } else {
        setVal('currentLocation', s.currentLocation || '');
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (error) {
    console.error('Error fetching shipment:', error);
  }
}

async function saveShipment() {
  const trackingNumber = getVal('trackingNumber');
  if (!trackingNumber) {
    alert('Please provide a tracking number.');
    return;
  }

  const existingShipment = shipmentsCache.find((shipment) => shipment.trackingNumber === trackingNumber);
  const method = existingShipment ? 'PUT' : 'POST';
  const endpoint = existingShipment ? `${API_URL}/${encodeURIComponent(trackingNumber)}` : API_URL;

  const payload = {
    trackingNumber,
    senderName: getVal('senderName'),
    receiverName: getVal('receiverName'),
    originName: getVal('origin'),
    destinationName: getVal('destination'),
    estimatedDelivery: getVal('estimatedDelivery'),
    status: getVal('status') || 'In Transit',
    weight: parseFloat(getVal('weight')) || null,
    description: getVal('description'),
    coordinates: {
      origin: getCoords('originLat', 'originLng'),
      destination: getCoords('destLat', 'destLng'),
      currentLocation: getCoords('currentLat', 'currentLng')
    }
  };

  const validationError = validateShipmentPayload(payload);
  if (validationError) {
    alert(validationError);
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (result.success) {
      alert('Shipment saved successfully!');
      resetShipmentForm();
      await loadShipments();
      if (result.data) {
        renderShipmentDetails(result.data);
        showShipmentOnMap(result.data);
      }
    } else {
      alert('Error saving shipment: ' + (result.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Save error:', error);
    alert('Unable to connect to server.');
  }
}

async function deleteShipment(trackingNumber) {
  if (!confirm(`Are you sure you want to delete shipment ${trackingNumber}?`)) return;

  try {
    const response = await fetch(`${API_URL}/${encodeURIComponent(trackingNumber)}`, { method: 'DELETE', headers: getAuthHeaders() });
    const result = await response.json();

    if (result.success) {
      loadShipments();
    }
  } catch (error) {
    console.error('Delete error:', error);
  }
}

function selectShipment(trackingNumber) {
  const shipment = shipmentsCache.find((entry) => entry.trackingNumber === trackingNumber);
  if (shipment) {
    renderShipmentDetails(shipment);
    showShipmentOnMap(shipment);
  }
}

function renderStats(shipments) {
  const total = shipments.length;
  const statusCounts = shipments.reduce((counts, shipment) => {
    const status = shipment.status || 'Unknown';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});

  setText('totalShipments', total);
  setText('pendingShipments', (statusCounts['Order Received'] || 0) + (statusCounts['Processing'] || 0));
  setText('inTransitShipments', (statusCounts['In Transit'] || 0) + (statusCounts['Arriving Soon'] || 0));
  setText('deliveredShipments', statusCounts['Delivered'] || 0);
  setText('cancelledShipments', statusCounts['Cancelled'] || 0);
}

function renderShipmentDetails(shipment) {
  const detailsEl = document.getElementById('shipmentDetails');
  if (!detailsEl) return;

  if (!shipment) {
    detailsEl.innerHTML = 'Select a shipment to view its tracking history.';
    return;
  }

  const currentLocation = shipment.coordinates?.currentLocation;
  detailsEl.innerHTML = `
    <div class="details-row"><strong>Tracking:</strong> ${escapeHtml(shipment.trackingNumber || 'N/A')}</div>
    <div class="details-row"><strong>Sender:</strong> ${escapeHtml(shipment.senderName || 'N/A')}</div>
    <div class="details-row"><strong>Receiver:</strong> ${escapeHtml(shipment.receiverName || 'N/A')}</div>
    <div class="details-row"><strong>Route:</strong> ${escapeHtml(shipment.originName || 'N/A')} → ${escapeHtml(shipment.destinationName || 'N/A')}</div>
    <div class="details-row"><strong>Status:</strong> ${escapeHtml(shipment.status || 'N/A')}</div>
    <div class="details-row"><strong>ETA:</strong> ${escapeHtml(shipment.estimatedDelivery || 'N/A')}</div>
    <div class="details-row"><strong>Current Location:</strong> ${currentLocation ? `${currentLocation.lat}, ${currentLocation.lng}` : 'N/A'}</div>
    <div class="details-row"><strong>Weight:</strong> ${shipment.weight != null ? `${shipment.weight} kg` : 'N/A'}</div>
    <div class="details-row"><strong>Description:</strong> ${escapeHtml(shipment.description || 'N/A')}</div>
  `;
}

function applyFilters() {
  const searchTerm = getVal('searchInput').toLowerCase();
  const statusFilter = getVal('statusFilter');

  const filtered = shipmentsCache.filter((shipment) => {
    const matchesSearch = !searchTerm || shipment.trackingNumber?.toLowerCase().includes(searchTerm);
    const matchesStatus = !statusFilter || shipment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  renderTable(filtered);
  renderStats(filtered);
}

function initMap() {
  const mapEl = document.getElementById('shipmentMap');
  if (!mapEl || typeof window.L === 'undefined') return;

  shipmentMap = window.L.map(mapEl, { attributionControl: false }).setView([20, 0], 2);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(shipmentMap);

  mapLayerGroup = window.L.layerGroup().addTo(shipmentMap);
  setTimeout(() => shipmentMap.invalidateSize(), 200);
}

function ensureMapSection() {
  const mapSection = document.getElementById('mapSection');
  if (mapSection) {
    mapSection.classList.remove('hidden');
  }
}

function hideMapSection() {
  const mapSection = document.getElementById('mapSection');
  if (mapSection) {
    mapSection.classList.add('hidden');
  }
}

function renderMapRoutes(shipments) {
  if (!shipmentMap || !mapLayerGroup) return;

  mapLayerGroup.clearLayers();
  const bounds = [];

  shipments.forEach((shipment) => {
    const origin = shipment.coordinates?.origin;
    const destination = shipment.coordinates?.destination;
    const current = shipment.coordinates?.currentLocation;

    if (origin && destination) {
      window.L.polyline([
        [origin.lat, origin.lng],
        [destination.lat, destination.lng]
      ], {
        color: '#007bff',
        weight: 2,
        opacity: 0.6
      }).addTo(mapLayerGroup);
      bounds.push([origin.lat, origin.lng], [destination.lat, destination.lng]);
    }

    if (current) {
      window.L.circleMarker([current.lat, current.lng], {
        radius: 6,
        color: '#28a745',
        fillColor: '#28a745',
        fillOpacity: 0.8
      }).bindPopup(`Tracking ${escapeHtml(shipment.trackingNumber || 'N/A')}: ${escapeHtml(shipment.status || 'Unknown')}`).addTo(mapLayerGroup);
      bounds.push([current.lat, current.lng]);
    }
  });

  if (bounds.length > 0) {
    shipmentMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
  }
}

function showShipmentOnMap(shipment) {
  if (!shipment) return;

  ensureMapSection();
  if (!shipmentMap) initMap();
  if (!shipmentMap) return;

  if (activePackageAnimationFrame) {
    cancelAnimationFrame(activePackageAnimationFrame);
    activePackageAnimationFrame = null;
  }

  if (selectedMarker && shipmentMap.hasLayer(selectedMarker)) {
    shipmentMap.removeLayer(selectedMarker);
    selectedMarker = null;
  }

  if (mapLayerGroup) {
    mapLayerGroup.clearLayers();
  }

  const origin = shipment.coordinates?.origin;
  const destination = shipment.coordinates?.destination;
  const current = shipment.coordinates?.currentLocation;
  const currentValid = Number.isFinite(current?.lat) && Number.isFinite(current?.lng);
  const bounds = [];

  if (origin && destination && mapLayerGroup) {
    const routeLine = window.L.polyline([
      [origin.lat, origin.lng],
      [destination.lat, destination.lng]
    ], {
      color: '#3b82f6',
      weight: 3,
      opacity: 0.75,
      dashArray: '8 6'
    }).addTo(mapLayerGroup);

    window.L.circleMarker([origin.lat, origin.lng], {
      radius: 7,
      color: '#38bdf8',
      fillColor: '#38bdf8',
      fillOpacity: 0.95,
      weight: 2
    }).bindPopup(`Origin: ${escapeHtml(shipment.originName || 'N/A')}`)
      .addTo(mapLayerGroup);

    window.L.circleMarker([destination.lat, destination.lng], {
      radius: 7,
      color: '#22c55e',
      fillColor: '#22c55e',
      fillOpacity: 0.95,
      weight: 2
    }).bindPopup(`Destination: ${escapeHtml(shipment.destinationName || 'N/A')}`)
      .addTo(mapLayerGroup);

    bounds.push([origin.lat, origin.lng], [destination.lat, destination.lng]);
  }

  if (currentValid && mapLayerGroup) {
    const icon = window.L.divIcon({
      html: buildPackageMarkerHtml(shipment.status, true),
      className: 'package-marker-wrapper',
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });

    selectedMarker = window.L.marker([current.lat, current.lng], { icon }).addTo(mapLayerGroup);
    const currentLabel = `${current.lat.toFixed(6)}, ${current.lng.toFixed(6)}`;
    selectedMarker.bindPopup(
      `<strong>${escapeHtml(shipment.trackingNumber || 'Package')}</strong><br>` +
      `Status: ${escapeHtml(shipment.status || 'Unknown')}<br>` +
      `Current Location: ${escapeHtml(currentLabel)}<br>` +
      `${shipment.updatedAt ? `Last updated: ${new Date(shipment.updatedAt).toLocaleString()}` : ''}`
    );

    bounds.push([current.lat, current.lng]);
    animatePackageMarker(selectedMarker, [current.lat, current.lng], shipment.status);
  }

  if (!currentValid) {
    const detailsEl = document.getElementById('shipmentDetails');
    if (detailsEl) {
      detailsEl.innerHTML += `
        <div class="details-row" style="color: #fbbf24; margin-top: 10px;">
          Current coordinates are missing or invalid. Update Current Latitude and Current Longitude to display the package marker.
        </div>
      `;
    }
  }

  if (bounds.length > 0) {
    shipmentMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  } else {
    shipmentMap.setView([20, 0], 2);
  }

  setTimeout(() => shipmentMap.invalidateSize(), 150);
}

function buildPackageMarkerHtml(status, isCurrent = false) {
  const statusClass = status === 'Delivered' ? 'is-delivered' : status === 'In Transit' ? 'is-active' : 'is-pending';
  const currentClass = isCurrent ? 'is-current-location' : '';
  return `
    <div class="package-map-marker ${statusClass} ${currentClass}">
      <span class="package-map-marker__body"></span>
      <span class="package-map-marker__wheel wheel-left"></span>
      <span class="package-map-marker__wheel wheel-right"></span>
      <span class="package-map-marker__tick"></span>
    </div>
  `;
}

function animatePackageMarker(marker, homePoint, status) {
  const isDelivered = status === 'Delivered';
  const update = (timestamp) => {
    if (!marker || !shipmentMap?.hasLayer(marker)) return;
    if (isDelivered) {
      marker.setLatLng(homePoint);
      return;
    }

    const wobble = Math.sin(timestamp / 450) * 0.00025;
    marker.setLatLng([homePoint[0] + wobble, homePoint[1] + wobble]);
    activePackageAnimationFrame = requestAnimationFrame(update);
  };

  activePackageAnimationFrame = requestAnimationFrame(update);
}

function easeInOutCubic(progress) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

async function seedSampleShipments() {
  const now = Date.now();
  const sampleData = [
    {
      trackingNumber: `GM-${now}-A`,
      senderName: 'Novak Logistics',
      receiverName: 'Urban Supply Co.',
      originName: 'Los Angeles',
      destinationName: 'Chicago',
      estimatedDelivery: '2026-08-05',
      status: 'In Transit',
      weight: 12.5,
      description: 'Electronics shipment',
      coordinates: {
        origin: { lat: 34.0522, lng: -118.2437 },
        destination: { lat: 41.8781, lng: -87.6298 },
        currentLocation: { lat: 39.0997, lng: -94.5786 }
      }
    },
    {
      trackingNumber: `GM-${now}-B`,
      senderName: 'Evergreen Trade',
      receiverName: 'Pacific Retail',
      originName: 'Miami',
      destinationName: 'New York',
      estimatedDelivery: '2026-08-03',
      status: 'Arriving Soon',
      weight: 8.3,
      description: 'Apparel and accessories',
      coordinates: {
        origin: { lat: 25.7617, lng: -80.1918 },
        destination: { lat: 40.7128, lng: -74.0060 },
        currentLocation: { lat: 37.7749, lng: -122.4194 }
      }
    }
  ];

  try {
    const results = await Promise.all(sampleData.map((item) =>
      fetch(API_URL, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(item)
      }).then((res) => res.json())
    ));

    const successful = results.filter((item) => item.success).length;
    alert(`${successful} sample shipment(s) seeded successfully.`);
    loadShipments();
  } catch (error) {
    console.error('Seed sample error:', error);
    alert('Unable to seed sample shipments.');
  }
}

async function handleLogout() {
  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  try {
    await fetch(ADMIN_LOGOUT_URL, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
  } catch (error) {
    console.warn('Logout request failed:', error);
  }
  localStorage.removeItem(SESSION_TOKEN_KEY);
  window.location.href = 'admin-login.html';
}

function redirectIfUnauthorized(result) {
  if (result && (result.message === 'Admin authentication required' || result.message === 'Not authenticated')) {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    window.location.href = 'admin-login.html';
  }
}

async function verifyAdminSession() {
  try {
    const response = await fetch(ADMIN_CHECK_URL, { headers: getAuthHeaders() });
    const result = await response.json();
    if (!result.success) {
      localStorage.removeItem(SESSION_TOKEN_KEY);
      window.location.href = 'admin-login.html';
      return null;
    }
    return result.data;
  } catch (error) {
    console.error('Admin session verification failed:', error);
    localStorage.removeItem(SESSION_TOKEN_KEY);
    window.location.href = 'admin-login.html';
    return null;
  }
}

function getAuthHeaders() {
  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function resetShipmentForm() {
  const fields = [
    'shipmentId', 'trackingNumber', 'senderName', 'receiverName',
    'origin', 'destination', 'estimatedDelivery', 'status',
    'originLat', 'originLng', 'destLat', 'destLng',
    'currentLat', 'currentLng', 'currentLocation', 'weight', 'description'
  ];
  fields.forEach((id) => setVal(id, ''));
  setVal('status', 'Order Received');
  hideMapSection();
  if (selectedMarker && shipmentMap) {
    shipmentMap.removeLayer(selectedMarker);
    selectedMarker = null;
  }
  if (mapLayerGroup && shipmentMap) {
    mapLayerGroup.clearLayers();
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function getCoords(latId, lngId) {
  const lat = parseFloat(getVal(latId));
  const lng = parseFloat(getVal(lngId));
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function ensureMapSection() {
  const mapSection = document.getElementById('mapSection');
  if (mapSection) {
    mapSection.classList.remove('hidden');
  }
}

function hideMapSection() {
  const mapSection = document.getElementById('mapSection');
  if (mapSection) {
    mapSection.classList.add('hidden');
  }
}

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
