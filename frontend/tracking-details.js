const DETAILS_API_URL = '/api/public/shipments';

const escapeDetailsHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const statusMeta = (status) => {
  const value = String(status || '').toLowerCase();
  if (value.includes('delivered')) return ['Delivered', 'status-delivered', '✓'];
  if (value.includes('out for delivery')) return ['Out for Delivery', 'status-arriving', '→'];
  if (value.includes('hold')) return ['On Hold', 'status-delayed', '!'];
  if (value.includes('exception')) return ['Exception', 'status-delayed', '!'];
  if (value.includes('label')) return ['Label Created', 'status-pending', '○'];
  if (value.includes('cancel')) return ['Cancelled', 'status-delayed', '×'];
  return [status || 'In Transit', 'status-in-transit', '•'];
};

const statusContext = (status, shipment, latest) => {
  const value = String(status || '').toLowerCase();
  const location = latest.location || shipment.currentLocationName || shipment.currentPackageLocation || '';
  const detail = latest.description || latest.remarks || '';
  if (value.includes('delivered')) return ['Delivery confirmed', detail || location, location];
  if (value.includes('out for delivery')) return ['Delivery is scheduled for today', detail || location, location];
  if (value.includes('hold')) return ['Shipment on hold', detail || location, location];
  if (value.includes('exception')) return ['Shipment exception', detail || location, location];
  if (value.includes('label')) return ['Shipping label created', detail || location, location];
  if (value.includes('accepted')) return ['Shipment accepted', detail || location, location];
  return ['Shipment in progress', detail || 'No latest update is available yet.', location];
};

const getEvents = (shipment) => (Array.isArray(shipment.timeline) ? shipment.timeline : [])
  .map((event, index) => ({ ...event, _index: index }))
  .sort((a, b) => {
    const dateDiff = new Date(b.timestamp || `${b.date || ''}T${b.time || '00:00'}`) - new Date(a.timestamp || `${a.date || ''}T${a.time || '00:00'}`);
    return Number.isNaN(dateDiff) || dateDiff === 0 ? b._index - a._index : dateDiff;
  });

const resolveLatestUpdate = (shipment, events) => {
  const storedUpdate = shipment.latestUpdate;
  const hasStoredUpdate = storedUpdate && Object.values(storedUpdate).some((value) => String(value ?? '').trim() !== '');
  return hasStoredUpdate ? storedUpdate : (events[0] || {});
};

const formatDate = (event) => event.date || (event.timestamp ? new Date(event.timestamp).toLocaleDateString() : '');
const formatTime = (event) => event.time || (event.timestamp ? new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
const copyTracking = async (tracking) => {
  try { await navigator.clipboard.writeText(tracking); } catch (error) { console.warn('Copy unavailable', error); }
  const button = document.querySelector('[data-copy-tracking]');
  if (button) { button.textContent = 'Copied'; setTimeout(() => { button.textContent = 'Copy'; }, 1400); }
};

function renderDetails(shipment) {
  const status = statusMeta(shipment.status);
  const events = getEvents(shipment);
  const latest = resolveLatestUpdate(shipment, events);
  const currentLocation = shipment.currentLocationName || shipment.currentPackageLocation || shipment.currentLocation || '';
  const context = statusContext(shipment.status, shipment, latest);
  const rows = [
    ['Latest update', latest.title || latest.status, latest.description || latest.remarks],
    ['Current location', currentLocation], ['Origin', shipment.originName || shipment.origin],
    ['Destination', shipment.destinationName || shipment.destination], ['Expected delivery', shipment.estimatedDelivery],
    ['Carrier', shipment.carrier], ['Service', shipment.serviceType], ['Shipment type', shipment.shipmentType],
    ['Pickup date', shipment.pickupDate], ['Delivery', [shipment.deliveryDate, shipment.deliveryTime, shipment.deliveryLocation, shipment.deliveryMethod].filter(Boolean).join(' ')], ['Delivery description', shipment.deliveryDescription]
  ].filter(([, value]) => value);
  const history = events.length ? events.map((event, index) => {
    const eventStatus = statusMeta(event.status || shipment.status);
    return `<li class="details-timeline-item ${index === 0 ? 'is-current' : ''}"><span class="details-timeline-icon ${eventStatus[1]}">${eventStatus[2]}</span><div><div class="details-timeline-top"><strong>${escapeDetailsHtml(event.title || event.status || shipment.status || 'Update')}</strong><time>${escapeDetailsHtml(formatDate(event))}${formatTime(event) ? ` · ${escapeDetailsHtml(formatTime(event))}` : ''}</time></div>${event.title && event.status ? `<span class="details-timeline-status">${escapeDetailsHtml(event.status)}</span>` : ''}<p>${escapeDetailsHtml(event.description || event.remarks || 'Shipment update')}</p>${event.location ? `<span class="details-timeline-location">${escapeDetailsHtml(event.location)}</span>` : ''}</div></li>`;
  }).join('') : '<li class="details-empty">No tracking history is available yet.</li>';
  document.getElementById('detailsContent').innerHTML = `<section class="details-hero tracking-card"><div><p class="eyebrow">Tracking details</p><h1>${escapeDetailsHtml(shipment.trackingNumber || 'Shipment')}</h1><p class="tracking-summary-subtitle">${escapeDetailsHtml(shipment.originName || shipment.origin || 'Origin')} → ${escapeDetailsHtml(shipment.destinationName || shipment.destination || 'Destination')}</p></div><div class="details-hero-actions"><span class="tracking-pill ${status[1]}">${status[2]} ${escapeDetailsHtml(status[0])}</span><button class="copy-button" data-copy-tracking>Copy</button></div></section><section class="tracking-card status-context ${status[1]}"><p class="eyebrow">Current update</p><h2>${escapeDetailsHtml(context[0])}</h2>${context[1] ? `<p>${escapeDetailsHtml(context[1])}</p>` : ''}${context[2] ? `<span>${escapeDetailsHtml(context[2])}</span>` : ''}${latest.date || latest.time ? `<small>${escapeDetailsHtml([latest.date, latest.time].filter(Boolean).join(' · '))}</small>` : ''}</section><section class="tracking-card"><div class="tracking-card-header"><h2>Shipment summary</h2></div><div class="details-summary-grid">${rows.map(([label, value, description]) => `<div class="details-summary-item"><span>${escapeDetailsHtml(label)}</span><strong>${escapeDetailsHtml(value)}</strong>${description ? `<small>${escapeDetailsHtml(description)}</small>` : ''}</div>`).join('')}</div></section><section class="tracking-card"><div class="tracking-card-header"><h2>Complete tracking history</h2><span class="history-count">${events.length} ${events.length === 1 ? 'event' : 'events'}</span></div><ol class="details-timeline">${history}</ol></section>`;
  document.querySelector('[data-copy-tracking]')?.addEventListener('click', () => copyTracking(shipment.trackingNumber));
}

async function loadDetails() {
  const statusBox = document.getElementById('detailsStatus');
  const content = document.getElementById('detailsContent');
  const tracking = new URLSearchParams(window.location.search).get('tracking')?.trim();
  if (!tracking) { statusBox.textContent = 'Enter a tracking number to view shipment details.'; return; }
  try {
    const response = await fetch(`${DETAILS_API_URL}/${encodeURIComponent(tracking)}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || !result.success || !result.data) { statusBox.textContent = response.status === 404 ? 'Tracking number not found.' : (result.message || 'Unable to load tracking details.'); return; }
    renderDetails(result.data); statusBox.classList.add('hidden'); content.classList.remove('hidden');
  } catch (error) { console.error('Tracking details error:', error); statusBox.textContent = 'The tracking service is unavailable. Please try again later.'; }
}

document.addEventListener('DOMContentLoaded', loadDetails);
