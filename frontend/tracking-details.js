const DETAILS_API_URL = '/api/public/shipments';
let detailsRefreshTimer = null;

const escapeDetailsHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const statusMeta = (status) => {
  const value = String(status || '').toLowerCase();
  if (value.includes('delivered')) return ['Delivered', 'status-delivered', 'check'];
  if (value.includes('out for delivery')) return ['Out for Delivery', 'status-out-for-delivery', 'truck'];
  if (value.includes('hold')) return ['On Hold', 'status-on-hold', 'warning'];
  if (value.includes('exception') || value.includes('delayed') || value.includes('returned') || value.includes('cancel')) return [status || 'Exception', 'status-exception', 'warning'];
  if (value.includes('processing')) return ['Processing', 'status-processing', 'spinner'];
  if (value.includes('pending') || value.includes('order received') || value.includes('label')) return [value.includes('label') ? 'Label Created' : 'Pending', 'status-pending', 'dot'];
  if (value.includes('accepted')) return ['Shipment Accepted', 'status-accepted', 'check'];
  if (value.includes('arrived at facility')) return ['Arrived at Facility', 'status-facility', 'pin'];
  if (value.includes('enroute') || value.includes('in transit') || value.includes('shipped')) return ['In Transit', 'status-in-transit', 'route'];
  if (value.includes('picked up')) return ['Picked Up', 'status-in-transit', 'route'];
  if (value.includes('arriving soon')) return ['Arriving Soon', 'status-in-transit', 'route'];
  return [status || 'In Transit', 'status-in-transit', 'route'];
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
    const dateDiff = timelineSortValue(b) - timelineSortValue(a);
    return dateDiff === 0 ? b._index - a._index : dateDiff;
  });

const timelineSortValue = (event) => {
  const value = new Date(event.timestamp || `${event.date || ''}T${event.time || '00:00'}`).getTime();
  return Number.isFinite(value) ? value : 0;
};

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
  const currentEventIndex = events.findIndex((event) => timelineSortValue(event) <= Date.now());
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
    const progressClass = currentEventIndex < 0 || index < currentEventIndex ? 'is-upcoming' : index === currentEventIndex ? 'is-current' : 'is-completed';
    return `<li class="details-timeline-item ${eventStatus[1]} ${progressClass}"><span class="details-timeline-icon status-indicator--${eventStatus[2]}" aria-hidden="true"></span><div><div class="details-timeline-top"><strong>${escapeDetailsHtml(event.title || event.status || shipment.status || 'Update')}</strong><time>${escapeDetailsHtml(formatDate(event))}${formatTime(event) ? ` · ${escapeDetailsHtml(formatTime(event))}` : ''}</time></div>${event.title && event.status ? `<span class="details-timeline-status">${escapeDetailsHtml(event.status)}</span>` : ''}<p>${escapeDetailsHtml(event.description || event.remarks || 'Shipment update')}</p>${event.location ? `<span class="details-timeline-location">${escapeDetailsHtml(event.location)}</span>` : ''}</div></li>`;
  }).join('') : '<li class="details-empty">No tracking history is available yet.</li>';
  document.getElementById('detailsContent').innerHTML = `<section class="details-hero tracking-card"><div><p class="eyebrow">Tracking details</p><h1>${escapeDetailsHtml(shipment.trackingNumber || 'Shipment')}</h1><p class="tracking-summary-subtitle">${escapeDetailsHtml(shipment.originName || shipment.origin || 'Origin')} → ${escapeDetailsHtml(shipment.destinationName || shipment.destination || 'Destination')}</p></div><div class="details-hero-actions"><span class="tracking-pill ${status[1]}"><span class="status-indicator status-indicator--${status[2]}" aria-hidden="true"></span>${escapeDetailsHtml(status[0])}</span><button class="copy-button" data-copy-tracking>Copy</button></div></section><section class="tracking-card status-context ${status[1]}"><p class="eyebrow">Current update</p><h2>${escapeDetailsHtml(context[0])}</h2>${context[1] ? `<p>${escapeDetailsHtml(context[1])}</p>` : ''}${context[2] ? `<span>${escapeDetailsHtml(context[2])}</span>` : ''}${latest.date || latest.time ? `<small>${escapeDetailsHtml([latest.date, latest.time].filter(Boolean).join(' · '))}</small>` : ''}</section><section class="tracking-card"><div class="tracking-card-header"><h2>Shipment summary</h2></div><div class="details-summary-grid">${rows.map(([label, value, description]) => `<div class="details-summary-item"><span>${escapeDetailsHtml(label)}</span><strong>${escapeDetailsHtml(value)}</strong>${description ? `<small>${escapeDetailsHtml(description)}</small>` : ''}</div>`).join('')}</div></section><section class="tracking-card"><div class="tracking-card-header"><h2>Complete tracking history</h2><span class="history-count">${events.length} ${events.length === 1 ? 'event' : 'events'}</span></div><ol class="details-timeline">${history}</ol></section>`;
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
    if (!detailsRefreshTimer) {
      detailsRefreshTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') loadDetails();
      }, 60000);
    }
  } catch (error) { console.error('Tracking details error:', error); statusBox.textContent = 'The tracking service is unavailable. Please try again later.'; }
}

document.addEventListener('DOMContentLoaded', loadDetails);
