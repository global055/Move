const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

function waitForServer(url, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryFetch = () => {
      fetch(url)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() - started > timeoutMs) {
            reject(new Error(`Server did not become ready at ${url}`));
            return;
          }
          setTimeout(tryFetch, 250);
        });
    };
    tryFetch();
  });
}

test('shipment details survive create, update, and lookup', async () => {
  const projectRoot = path.join(__dirname, '..');
  const server = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: { ...process.env, PORT: '3111', ALLOW_ALL_ORIGINS: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverOutput = '';
  server.stdout.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });

  try {
    await waitForServer('http://127.0.0.1:3111/api/admin/check');

    const loginResponse = await fetch('http://127.0.0.1:3111/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'globalmovement05@gmail.com', password: 'Global100' })
    });
    const loginPayload = await loginResponse.json();
    assert.equal(loginPayload.success, true);

    const trackingNumbersResponse = await fetch('http://127.0.0.1:3111/api/shipments/tracking-numbers');
    const trackingNumbersPayload = await trackingNumbersResponse.json();
    assert.equal(trackingNumbersPayload.success, true);
    assert.ok(Array.isArray(trackingNumbersPayload.data));

    const createResponse = await fetch('http://127.0.0.1:3111/api/shipments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginPayload.token}`
      },
      body: JSON.stringify({
        trackingNumber: 'TEST-DETAILS-001',
        status: 'In Transit',
        senderName: 'Apex Shipper',
        receiverName: 'Northwind Retail',
        originName: 'Dubai',
        destinationName: 'London',
        estimatedDelivery: '2026-08-10',
        expectedDeliveryTime: '16:30',
        pickupDate: '2026-08-03',
        pickupTime: '08:00',
        deliveryTime: '17:00',
        shipmentType: 'Air Freight',
        carrier: 'DHL',
        modeOfShipment: 'Air',
        packageDescription: 'Medical equipment',
        packageWeight: 18.5,
        totalFreight: 2200,
        currentLocationName: 'Frankfurt Hub',
        shipper: {
          name: 'Apex Shipper',
          phone: '+9711234567',
          email: 'shipper@example.com',
          address: 'Dubai Marina'
        },
        receiver: {
          name: 'Northwind Retail',
          phone: '+447700000000',
          email: 'receiver@example.com',
          address: 'London Docklands'
        },
        origin: 'Dubai',
        destination: 'London',
        departureAirportPort: 'DXB',
        arrivalAirportPort: 'LHR',
        quantity: 3,
        serviceType: 'Express',
        paymentStatus: 'Paid',
        referenceNumber: 'REF-1001',
        specialInstructions: 'Handle with care',
        packageDimensions: '60x40x20 cm',
        insurance: 'Covered',
        timeline: [
          { date: '2026-08-03', time: '08:00', status: 'Picked Up', location: 'Dubai', remarks: 'Collected from shipper' }
        ]
      })
    });
    const createPayload = await createResponse.json();
    assert.equal(createPayload.success, true);
    assert.equal(createPayload.data.shipmentType, 'Air Freight');
    assert.equal(createPayload.data.modeOfShipment, 'Air');
    assert.equal(createPayload.data.timeline[0].remarks, 'Collected from shipper');

    const updateResponse = await fetch('http://127.0.0.1:3111/api/shipments/TEST-DETAILS-001', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginPayload.token}`
      },
      body: JSON.stringify({
        status: 'Arriving Soon',
        currentLocationName: 'Amsterdam Hub',
        timeline: [
          { date: '2026-08-03', time: '08:00', status: 'Picked Up', location: 'Dubai', remarks: 'Collected from shipper' },
          { date: '2026-08-04', time: '14:30', status: 'In Transit', location: 'Amsterdam Hub', remarks: 'Transferred to air corridor' }
        ]
      })
    });
    const updatePayload = await updateResponse.json();
    assert.equal(updatePayload.success, true);
    assert.equal(updatePayload.data.status, 'Arriving Soon');
    assert.equal(updatePayload.data.timeline.length, 2);

    const lookupResponse = await fetch('http://127.0.0.1:3111/api/shipments/TEST-DETAILS-001');
    const lookupPayload = await lookupResponse.json();
    assert.equal(lookupPayload.success, true);
    assert.equal(lookupPayload.data.currentLocationName, 'Amsterdam Hub');
    assert.equal(lookupPayload.data.referenceNumber, 'REF-1001');
    assert.equal(lookupPayload.data.timeline[1].remarks, 'Transferred to air corridor');
  } finally {
    server.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!server.killed) {
      server.kill('SIGKILL');
    }
  }
});
