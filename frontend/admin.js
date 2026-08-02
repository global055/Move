const API_BASE_URL = '';
const API_URL = '/api/shipments';
const ADMIN_CHECK_URL = '/api/admin/check';
const ADMIN_LOGOUT_URL = '/api/admin/logout';
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
  setVal('senderName', shipment.senderName || shipment.shipper?.name || '');
  setVal('receiverName', shipment.receiverName || shipment.receiver?.name || '');
  setVal('origin', shipment.originName);
  setVal('destination', shipment.destinationName);
  setVal('estimatedDelivery', shipment.estimatedDelivery);
  setVal('expectedDeliveryTime', shipment.expectedDeliveryTime || '');
  setVal('pickupDate', shipment.pickupDate || '');
  setVal('pickupTime', shipment.pickupTime || '');
  setVal('deliveryTime', shipment.deliveryTime || '');
  setVal('shipmentType', shipment.shipmentType || 'Land Freight');
  setVal('carrier', shipment.carrier || 'ISC');
  setVal('totalFreight', shipment.totalFreight ?? '');
  setVal('status', shipment.status || 'In Transit');
  setVal('weight', shipment.weight);
  setVal('description', shipment.description);
  setVal('currentLocation', shipment.currentLocationName || shipment.currentLocation || '');

  setVal('shipperCompany', shipment.shipper?.company || '');
  setVal('shipperName', shipment.shipper?.name || shipment.senderName || '');
  setVal('shipperPhone', shipment.shipper?.phone || '');
  setVal('shipperEmail', shipment.shipper?.email || '');
  setVal('shipperAddress', shipment.shipper?.address || '');
  setVal('shipperCity', shipment.shipper?.city || '');
  setVal('shipperState', shipment.shipper?.state || '');
  setVal('shipperPostalCode', shipment.shipper?.postalCode || '');
  setVal('shipperCountry', shipment.shipper?.country || '');

  setVal('receiverCompany', shipment.receiver?.company || '');
  setVal('receiverPhone', shipment.receiver?.phone || '');
  setVal('receiverEmail', shipment.receiver?.email || '');
  setVal('receiverAddress', shipment.receiver?.address || '');
  setVal('receiverCity', shipment.receiver?.city || '');
  setVal('receiverState', shipment.receiver?.state || '');
  setVal('receiverPostalCode', shipment.receiver?.postalCode || '');
  setVal('receiverCountry', shipment.receiver?.country || '');

  setVal('cargoType', shipment.cargo?.type || '');
  setVal('cargoDescription', shipment.cargo?.description || '');
  setVal('cargoPieces', shipment.cargo?.pieces ?? '');
  setVal('cargoWeight', shipment.cargo?.weight ?? '');
  setVal('cargoVolume', shipment.cargo?.volume ?? '');
  setVal('cargoDimensions', shipment.cargo?.dimensions || '');
  setVal('cargoValue', shipment.cargo?.value ?? '');
  setVal('cargoIncoterms', shipment.cargo?.incoterms || '');
  setVal('cargoDangerousGoods', shipment.cargo?.dangerousGoods == null ? '' : String(shipment.cargo.dangerousGoods));
  setVal('cargoInstructions', shipment.cargo?.specialInstructions || '');

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
        : shipment.currentLocationName || shipment.currentLocation || ''
    );
  } else {
    setVal('currentLocation', shipment.currentLocationName || shipment.currentLocation || '');
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
      populateShipmentForm(result.data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (error) {
    console.error('Error fetching shipment:', error);
  }
}

function buildShipmentPayload() {
  const weightValue = parseFloat(getVal('weight'));
  const cargoWeightValue = parseFloat(getVal('cargoWeight'));
  const cargoVolumeValue = parseFloat(getVal('cargoVolume'));
  const cargoValueValue = parseFloat(getVal('cargoValue'));
  const cargoPiecesValue = parseInt(getVal('cargoPieces'), 10);
  const totalFreightValue = parseFloat(getVal('totalFreight'));
  const dangerousGoodsValue = getVal('cargoDangerousGoods');

  return {
    trackingNumber: getVal('trackingNumber'),
    senderName: getVal('senderName'),
    receiverName: getVal('receiverName'),
    originName: getVal('origin'),
    destinationName: getVal('destination'),
    estimatedDelivery: getVal('estimatedDelivery'),
    expectedDeliveryTime: getVal('expectedDeliveryTime'),
    pickupDate: getVal('pickupDate'),
    pickupTime: getVal('pickupTime'),
    deliveryTime: getVal('deliveryTime'),
    shipmentType: getVal('shipmentType'),
    carrier: getVal('carrier'),
    totalFreight: Number.isFinite(totalFreightValue) ? totalFreightValue : null,
    status: getVal('status') || 'In Transit',
    weight: Number.isFinite(weightValue) ? weightValue : null,
    description: getVal('description'),
    currentLocationName: getVal('currentLocation'),
    coordinates: {
      origin: getCoords('originLat', 'originLng'),
      destination: getCoords('destLat', 'destLng'),
      currentLocation: getCoords('currentLat', 'currentLng')
    },
    shipper: {
      company: getVal('shipperCompany'),
      name: getVal('shipperName'),
      phone: getVal('shipperPhone'),
      email: getVal('shipperEmail'),
      address: getVal('shipperAddress'),
      city: getVal('shipperCity'),
      state: getVal('shipperState'),
      postalCode: getVal('shipperPostalCode'),
      country: getVal('shipperCountry')
    },
    receiver: {
      company: getVal('receiverCompany'),
      phone: getVal('receiverPhone'),
      email: getVal('receiverEmail'),
      address: getVal('receiverAddress'),
      city: getVal('receiverCity'),
      state: getVal('receiverState'),
      postalCode: getVal('receiverPostalCode'),
      country: getVal('receiverCountry')
    },
    cargo: {
      type: getVal('cargoType'),
      description: getVal('cargoDescription'),
      pieces: Number.isFinite(cargoPiecesValue) ? cargoPiecesValue : null,
      weight: Number.isFinite(cargoWeightValue) ? cargoWeightValue : null,
      volume: Number.isFinite(cargoVolumeValue) ? cargoVolumeValue : null,
      dimensions: getVal('cargoDimensions'),
      value: Number.isFinite(cargoValueValue) ? cargoValueValue : null,
      incoterms: getVal('cargoIncoterms'),
      dangerousGoods: dangerousGoodsValue === 'true',
      specialInstructions: getVal('cargoInstructions')
    }
  };
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

  const payload = buildShipmentPayload();
  payload.trackingNumber = trackingNumber;

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
  const originCoords = shipment.coordinates?.origin;
  const destinationCoords = shipment.coordinates?.destination;

  const buildRows = (rows) => rows.map(([label, value]) => `
    <div class="details-row"><strong>${label}</strong><span>${escapeHtml(value || 'N/A')}</span></div>
  `).join('');

  const mainRows = buildRows([
    ['Tracking', shipment.trackingNumber],
    ['Status', shipment.status],
    ['Shipment type', shipment.shipmentType],
    ['Carrier', shipment.carrier],
    ['Total freight', shipment.totalFreight != null ? `$${shipment.totalFreight.toFixed(2)}` : ''],
    ['Weight', shipment.weight != null ? `${shipment.weight} kg` : ''],
    ['Origin', shipment.originName],
    ['Destination', shipment.destinationName],
    ['Origin coordinates', originCoords ? `${originCoords.lat}, ${originCoords.lng}` : ''],
    ['Destination coordinates', destinationCoords ? `${destinationCoords.lat}, ${destinationCoords.lng}` : ''],
    ['Current location', currentLocation ? `${currentLocation.lat}, ${currentLocation.lng}` : shipment.currentLocationName || shipment.currentLocation],
    ['Pickup date', shipment.pickupDate],
    ['Pickup time', shipment.pickupTime],
    ['Estimated delivery', shipment.estimatedDelivery],
    ['Expected delivery', shipment.expectedDeliveryTime],
    ['Delivery time', shipment.deliveryTime],
    ['Description', shipment.description]
  ]);

  const shipperRows = buildRows([
    ['Shipper company', shipment.shipper?.company],
    ['Shipper name', shipment.shipper?.name || shipment.senderName],
    ['Shipper phone', shipment.shipper?.phone],
    ['Shipper email', shipment.shipper?.email],
    ['Shipper address', shipment.shipper?.address],
    ['Shipper city', shipment.shipper?.city],
    ['Shipper state', shipment.shipper?.state],
    ['Shipper postal code', shipment.shipper?.postalCode],
    ['Shipper country', shipment.shipper?.country]
  ]);

  const receiverRows = buildRows([
    ['Receiver company', shipment.receiver?.company],
    ['Receiver name', shipment.receiverName],
    ['Receiver phone', shipment.receiver?.phone],
    ['Receiver email', shipment.receiver?.email],
    ['Receiver address', shipment.receiver?.address],
    ['Receiver city', shipment.receiver?.city],
    ['Receiver state', shipment.receiver?.state],
    ['Receiver postal code', shipment.receiver?.postalCode],
    ['Receiver country', shipment.receiver?.country]
  ]);

  const cargoRows = buildRows([
    ['Cargo type', shipment.cargo?.type],
    ['Cargo description', shipment.cargo?.description],
    ['Pieces', shipment.cargo?.pieces != null ? String(shipment.cargo.pieces) : ''],
    ['Cargo weight', shipment.cargo?.weight != null ? `${shipment.cargo.weight} kg` : ''],
    ['Volume', shipment.cargo?.volume != null ? `${shipment.cargo.volume} m³` : ''],
    ['Dimensions', shipment.cargo?.dimensions],
    ['Declared value', shipment.cargo?.value != null ? `$${shipment.cargo.value}` : ''],
    ['Incoterms', shipment.cargo?.incoterms],
    ['Dangerous goods', shipment.cargo?.dangerousGoods != null ? (shipment.cargo.dangerousGoods ? 'Yes' : 'No') : ''],
    ['Special instructions', shipment.cargo?.specialInstructions]
  ]);

  const timeline = Array.isArray(shipment.timeline) && shipment.timeline.length
    ? shipment.timeline.map((entry) => `
        <div class="details-row timeline-entry"><strong>${escapeHtml(entry.status || 'Update')}</strong>
          <span>${escapeHtml(entry.description || 'No details')}</span>
          <small>${escapeHtml(entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '')}</small>
        </div>
      `).join('')
    : '<div class="details-row">No tracking timeline yet.</div>';

  detailsEl.innerHTML = `
    <div class="details-section">
      <h3>Shipment details</h3>
      <div class="details-grid">${mainRows}</div>
    </div>
    <div class="details-section">
      <h3>Shipper information</h3>
      <div class="details-grid">${shipperRows}</div>
    </div>
    <div class="details-section">
      <h3>Receiver information</h3>
      <div class="details-grid">${receiverRows}</div>
    </div>
    <div class="details-section">
      <h3>Cargo details</h3>
      <div class="details-grid">${cargoRows}</div>
    </div>
    <div class="details-section">
      <h3>Tracking timeline</h3>
      <div class="details-grid timeline-grid">${timeline}</div>
    </div>
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

function isShipmentMovingStatus(status) {
  if (!status) return false;
  const normalized = status.toLowerCase();
  const movingKeywords = ['in transit', 'out for delivery', 'enroute', 'arriving soon', 'picked up', 'on the way', 'moving', 'departed', 'shipped'];
  return movingKeywords.some((keyword) => normalized.includes(keyword));
}

function buildPackageMarkerHtml(status) {
  const statusClass = isShipmentMovingStatus(status) ? 'is-active' : 'is-paused';
  return `
    <div class="package-map-marker ${statusClass} is-current-location">
      <div class="package-map-marker__body"></div>
      <div class="package-map-marker__wheel wheel-left"></div>
      <div class="package-map-marker__wheel wheel-right"></div>
      <div class="package-map-marker__tick"></div>
    </div>
  `;
}

function animatePackageMarker(marker, homePoint, status) {
  const moving = isShipmentMovingStatus(status);
  if (!marker || !homePoint) return;
  if (!moving) {
    marker.setLatLng(homePoint);
    return;
  }

  const update = (timestamp) => {
    if (!marker || !shipmentMap?.hasLayer(marker)) return;
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
    'origin', 'destination', 'estimatedDelivery', 'expectedDeliveryTime', 'pickupDate', 'pickupTime', 'deliveryTime', 'shipmentType', 'carrier', 'totalFreight', 'status',
    'originLat', 'originLng', 'destLat', 'destLng',
    'currentLat', 'currentLng', 'currentLocation', 'weight', 'description',
    'shipperCompany', 'shipperName', 'shipperPhone', 'shipperEmail', 'shipperAddress', 'shipperCity', 'shipperState', 'shipperPostalCode', 'shipperCountry',
    'receiverCompany', 'receiverPhone', 'receiverEmail', 'receiverAddress', 'receiverCity', 'receiverState', 'receiverPostalCode', 'receiverCountry',
    'cargoType', 'cargoDescription', 'cargoPieces', 'cargoWeight', 'cargoVolume', 'cargoDimensions', 'cargoValue', 'cargoIncoterms', 'cargoDangerousGoods', 'cargoInstructions'
  ];
  fields.forEach((id) => setVal(id, ''));
  setVal('status', 'Order Received');
  setVal('shipmentType', 'Land Freight');
  setVal('carrier', 'ISC');
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
