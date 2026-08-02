const fs = require('fs');
const path = require('path');
const dns = require('dns');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const FRONTEND_DIR = path.join(__dirname, 'frontend');
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || process.env.DB_NAME || 'globalmovement';
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'globalmovement05@gmail.com';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Global100';
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const ALLOW_ALL_ORIGINS = process.env.ALLOW_ALL_ORIGINS === 'true';

if (mongoUri && mongoUri.startsWith('mongodb+srv://')) {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const app = express();
const PORT = process.env.PORT || 5000;

mongoose.set('bufferCommands', false);
app.set('trust proxy', true);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (ALLOW_ALL_ORIGINS || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }

    if (origin.endsWith('.vercel.app') || origin.endsWith('.railway.app') || origin.endsWith('.onrender.com')) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(FRONTEND_DIR, { index: 'index.html' }));

const connectToDatabase = async () => {
  if (!mongoUri) {
    console.error('MongoDB connection failed: no MONGO_URI or MONGODB_URI was provided.');
    return;
  }

  console.log(`Attempting MongoDB Atlas connection to database "${dbName}"...`);
  console.log(`Using MongoDB URI: ${mongoUri.replace(/:[^:@]+@/, ':***@')}`);

  try {
    await mongoose.connect(mongoUri, {
      dbName,
      serverSelectionTimeoutMS: 20000,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 30000,
      maxPoolSize: 10,
      retryWrites: true,
      w: 'majority'
    });
    console.log(`MongoDB Connected Successfully to database "${dbName}".`);
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    if (err?.reason?.servers) {
      console.error('Atlas network check: your current IP may not be whitelisted. Add the current IP, or allow 0.0.0.0/0 for development, in Atlas Network Access.');
    }
    throw err;
  }
};

mongoose.connection.on('error', (err) => {
  console.error('MongoDB runtime connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected.');
});

//  Define Shipment Schema
const shipmentSchema = new mongoose.Schema({
  trackingNumber: { type: String, required: true, unique: true },
  status: { type: String, default: 'In Transit' },
  senderName: { type: String, default: 'N/A' },
  senderLocation: { type: String, default: 'N/A' },
  receiverName: { type: String, default: 'N/A' },
  receiverLocation: { type: String, default: 'N/A' },
  originName: String,
  destinationName: String,
  estimatedDelivery: { type: String, default: 'Pending' },
  currentLocationName: String,
  weight: Number,
  totalFreight: Number,
  description: String,
  shipper: {
    company: String,
    name: String,
    phone: String,
    email: String,
    address: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },
  receiver: {
    company: String,
    name: String,
    phone: String,
    email: String,
    address: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },
  // Allow `cargo` to be either an object (new payloads) or legacy string values.
  // Use a flexible Mixed type to accept both forms without casting errors.
  cargo: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // New scheduling and logistics fields
  pickupDate: { type: String },
  pickupTime: { type: String },
  deliveryTime: { type: String },
  expectedDeliveryTime: { type: String },
  shipmentType: {
    type: String,
    enum: ['Air Freight', 'Sea Freight', 'Land Freight'],
    default: 'Land Freight'
  },
  carrier: {
    type: String,
    enum: ['ISC','DHL','USPS','FedEx','WCF','UPS','Royal Mail','International Shipping Agency']
  },
  timeline: [{
    status: String,
    location: String,
    description: String,
    timestamp: { type: Date, default: Date.now },
    updatedBy: String
  }],
  coordinates: {
    origin: { lat: Number, lng: Number },
    currentLocation: { lat: Number, lng: Number },
    destination: { lat: Number, lng: Number }
  }
}, { timestamps: true });
const Shipment = mongoose.model('Shipment', shipmentSchema, 'shipments');

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'admin' }
}, { timestamps: true });
const Admin = mongoose.model('Admin', adminSchema, 'admins');

const inMemoryShipments = new Map();
const inMemoryAdmins = new Map();
const adminSessions = new Map();

const isMongoAvailable = () => mongoose.connection.readyState === 1;

const normalizeTrackingNumber = (trackingNumber) => String(trackingNumber || '').trim();

const parseCookies = (cookieHeader = '') =>
  cookieHeader.split(';').filter(Boolean).reduce((acc, cookie) => {
    const [name, ...rest] = cookie.split('=');
    acc[name.trim()] = decodeURIComponent(rest.join('=').trim());
    return acc;
  }, {});

const getRequestToken = (req) => {
  const cookies = parseCookies(req.headers.cookie || '');
  const bearer = (req.headers.authorization || '').split(' ')[1];
  return cookies.gm_session || bearer || null;
};

const createAdminSession = (admin) => {
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, {
    adminId: admin._id ? admin._id.toString() : admin.email,
    adminEmail: admin.email,
    createdAt: new Date()
  });
  return token;
};

const getAuthenticatedAdmin = async (req) => {
  const token = getRequestToken(req);
  if (!token) return null;
  const session = adminSessions.get(token);
  if (!session) return null;

  if (isMongoAvailable()) {
    const admin = await Admin.findById(session.adminId);
    return admin || null;
  }

  return inMemoryAdmins.get(session.adminEmail) || null;
};

const authenticateAdmin = async (req, res, next) => {
  const admin = await getAuthenticatedAdmin(req);
  if (!admin) {
    return res.status(401).json({ success: false, message: 'Admin authentication required' });
  }
  req.adminUser = admin;
  next();
};

const ensureDefaultAdmin = async () => {
  if (!DEFAULT_ADMIN_EMAIL || !DEFAULT_ADMIN_PASSWORD) {
    console.warn('ADMIN_EMAIL and ADMIN_PASSWORD must be configured to create admin user.');
    return;
  }

  const defaultAdminEmail = String(DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const defaultAdminPassword = String(DEFAULT_ADMIN_PASSWORD);
  const passwordHash = await bcrypt.hash(defaultAdminPassword, 10);

  if (isMongoAvailable()) {
    const count = await Admin.countDocuments({}).catch(() => 0);
    if (count === 0) {
      await Admin.create({ email: defaultAdminEmail, passwordHash });
      console.log(`Created default admin account: ${defaultAdminEmail}`);
    }
    return;
  }

  if (!inMemoryAdmins.has(defaultAdminEmail)) {
    inMemoryAdmins.set(defaultAdminEmail, { email: defaultAdminEmail, passwordHash });
    console.log(`Created fallback in-memory admin account: ${defaultAdminEmail}`);
  }
};

const lookupShipmentInMemory = (trackingNumber) => {
  const normalizedTrackingNumber = normalizeTrackingNumber(trackingNumber);
  if (!normalizedTrackingNumber) return null;
  return inMemoryShipments.get(normalizedTrackingNumber) || null;
};

const listShipmentsInMemory = () => Array.from(inMemoryShipments.values());

const saveShipmentToMemory = async (payload) => {
  const trackingNumber = normalizeTrackingNumber(payload?.trackingNumber);
  if (!trackingNumber) {
    throw new Error('Tracking number is required.');
  }

  if (inMemoryShipments.has(trackingNumber)) {
    throw new Error('Tracking number already exists.');
  }

  const shipment = {
    ...payload,
    trackingNumber,
    createdAt: new Date().toISOString()
  };

  inMemoryShipments.set(trackingNumber, shipment);
  return shipment;
};

const updateShipmentInMemory = async (trackingNumber, payload) => {
  const normalizedTrackingNumber = normalizeTrackingNumber(trackingNumber);
  if (!normalizedTrackingNumber) {
    throw new Error('Tracking number is required.');
  }

  const existingShipment = inMemoryShipments.get(normalizedTrackingNumber);
  if (!existingShipment) {
    return null;
  }

  const updatedShipment = {
    ...existingShipment,
    ...payload,
    trackingNumber: normalizedTrackingNumber,
    updatedAt: new Date().toISOString()
  };

  inMemoryShipments.set(normalizedTrackingNumber, updatedShipment);
  return updatedShipment;
};

const deleteShipmentInMemory = async (trackingNumber) => {
  const normalizedTrackingNumber = normalizeTrackingNumber(trackingNumber);
  if (!normalizedTrackingNumber) {
    return false;
  }

  return inMemoryShipments.delete(normalizedTrackingNumber);
};

const buildTimelineEntry = (payload = {}, existingShipment = null) => ({
  status: payload.status || existingShipment?.status || 'In Transit',
  location: payload.currentLocationName || existingShipment?.currentLocationName || payload.currentLocation || existingShipment?.currentLocation || '',
  description: payload.description || existingShipment?.description || 'Shipment updated',
  timestamp: new Date(),
  updatedBy: payload.updatedBy || 'admin'
});

const normalizeShipmentPayload = (payload = {}, existingShipment = null, isCreate = false) => {
  const normalizedPayload = {
    ...payload,
    senderName: payload.senderName || existingShipment?.senderName || payload.shipper?.name || '',
    receiverName: payload.receiverName || existingShipment?.receiverName || payload.receiver?.name || '',
    shipper: {
      ...(existingShipment?.shipper || {}),
      ...(payload.shipper || {})
    },
    receiver: {
      ...(existingShipment?.receiver || {}),
      ...(payload.receiver || {})
    },
    cargo: {
      ...(existingShipment?.cargo || {}),
      ...(payload.cargo || {})
    },
    coordinates: {
      ...(existingShipment?.coordinates || {}),
      ...(payload.coordinates || {})
    }
  };

  if (!normalizedPayload.originName && existingShipment?.originName) {
    normalizedPayload.originName = existingShipment.originName;
  }
  if (!normalizedPayload.destinationName && existingShipment?.destinationName) {
    normalizedPayload.destinationName = existingShipment.destinationName;
  }

  if (isCreate) {
    normalizedPayload.timeline = Array.isArray(payload.timeline) && payload.timeline.length > 0
      ? payload.timeline
      : [buildTimelineEntry(normalizedPayload, null)];
    return normalizedPayload;
  }

  const existingTimeline = Array.isArray(existingShipment?.timeline) ? existingShipment.timeline : [];
  const nextTimeline = [...existingTimeline, buildTimelineEntry(normalizedPayload, existingShipment)];
  normalizedPayload.timeline = nextTimeline;
  return normalizedPayload;
};

// Admin auth routes
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const admin = isMongoAvailable()
      ? await Admin.findOne({ email: normalizedEmail })
      : inMemoryAdmins.get(normalizedEmail);

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = createAdminSession(admin);
    res.cookie('gm_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 24 * 60 * 60 * 1000
    });
    return res.json({ success: true, data: { email: admin.email }, token });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/admin/check', async (req, res) => {
  try {
    const admin = await getAuthenticatedAdmin(req);
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    return res.json({ success: true, data: { email: admin.email } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/logout', async (req, res) => {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies.gm_session;
  if (token) {
    adminSessions.delete(token);
  }
  res.cookie('gm_session', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    expires: new Date(0)
  });
  res.json({ success: true });
});

//  API Route: Get Shipment by Tracking Number
app.get('/api/shipments/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const shipment = isMongoAvailable()
      ? await Shipment.findOne({ trackingNumber })
      : lookupShipmentInMemory(trackingNumber);

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Tracking number not found' });
    }

    res.json({ success: true, data: shipment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/shipments/tracking-numbers', async (req, res) => {
  try {
    if (isMongoAvailable()) {
      const shipments = await Shipment.find({}, { trackingNumber: 1, _id: 0 }).limit(500).lean();
      const trackingNumbers = shipments
        .map((shipment) => shipment.trackingNumber)
        .filter(Boolean);
      return res.json({ success: true, data: trackingNumbers });
    }

    return res.json({ success: true, data: Array.from(inMemoryShipments.keys()) });
  } catch (err) {
    console.error('TRACKING_NUMBERS_ERR', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. API Route: Create / Seed a New Shipment (Admin action)
app.post('/api/shipments', authenticateAdmin, async (req, res) => {
  try {
    const shipmentPayload = normalizeShipmentPayload(req.body, null, true);

    if (!isMongoAvailable()) {
      const shipment = await saveShipmentToMemory(shipmentPayload);
      return res.status(201).json({ success: true, data: shipment });
    }

    const shipment = new Shipment(shipmentPayload);
    await shipment.save();
    res.status(201).json({ success: true, data: shipment });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
// ==========================================
// 1. GET ROUTE: Search shipment by tracking number
// ==========================================
// (Duplicate route removed)

// ==========================================
// 2. PUT ROUTE: Update shipment details/status
// ==========================================
app.put('/api/shipments/:trackingNumber', authenticateAdmin, async (req, res) => {
  try {
    const existingShipment = isMongoAvailable()
      ? await Shipment.findOne({ trackingNumber: req.params.trackingNumber })
      : lookupShipmentInMemory(req.params.trackingNumber);

    const shipmentPayload = normalizeShipmentPayload(req.body, existingShipment, false);
    const updatedShipment = isMongoAvailable()
      ? await Shipment.findOneAndUpdate(
          { trackingNumber: req.params.trackingNumber },
          shipmentPayload,
          { new: true } // returns the updated document
        )
      : await updateShipmentInMemory(req.params.trackingNumber, shipmentPayload);

    if (!updatedShipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    res.json({ success: true, message: 'Shipment updated!', data: updatedShipment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// Get All Shipments (For Admin Dashboard)
app.get('/api/shipments', authenticateAdmin, async (req, res) => {
  try {
    console.log('/api/shipments called, mongoose.readyState=', mongoose.connection.readyState);
    if (!isMongoAvailable()) {
      return res.json({ success: true, data: listShipmentsInMemory() });
    }

    // Defensive: use the native DB handle to avoid Mongoose buffering issues
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Native DB handle not available');
    }
    console.log('Querying native collection via db.collection');
    const shipments = await db.collection('shipments').find({}).limit(100).toArray();
    res.json({ success: true, data: shipments });
  } catch (err) {
    console.error('SHIPMENTS_ERR', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete Shipment by Tracking Number
app.delete('/api/shipments/:trackingNumber', authenticateAdmin, async (req, res) => {
  try {
    const deleted = isMongoAvailable()
      ? await Shipment.deleteOne({ trackingNumber: req.params.trackingNumber })
      : await deleteShipmentInMemory(req.params.trackingNumber);

    res.json({ success: true, message: 'Shipment deleted', deleted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  if (req.method !== 'GET') {
    return res.status(404).send('Not found');
  }

  const requestedPath = req.path === '/'
    ? path.join(FRONTEND_DIR, 'index.html')
    : path.join(FRONTEND_DIR, `${req.path.slice(1)}.html`);

  if (fs.existsSync(requestedPath)) {
    return res.sendFile(requestedPath);
  }

  return res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('SERVER_ERROR', err);
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }

  return res.status(500).sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

const startServer = async () => {
  try {
    await connectToDatabase();
    await ensureDefaultAdmin();
    app.get('/_who', (req, res) => res.json({ pid: process.pid }));
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log('Process PID:', process.pid);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    console.warn('Falling back to the in-memory shipment store for API requests until MongoDB Atlas is reachable.');
    await ensureDefaultAdmin();
    app.get('/_who', (req, res) => res.json({ pid: process.pid }));
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log('Process PID:', process.pid);
    });
  }
};

startServer();