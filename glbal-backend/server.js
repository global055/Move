const path = require('path');
const dns = require('dns');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Use public DNS for MongoDB Atlas SRV lookups when the default resolver fails.
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || process.env.DB_NAME || 'globalmovement';
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'globalmovement05@gmail.com';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Global100';

//if (mongoUri && mongoUri.startsWith('mongodb+srv://')) {
  //dns.setServers(['8.8.8.8', '1.1.1.1']);
//}

const app = express();
const PORT = process.env.PORT || 5000;
const setNoStoreHeaders = (res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
};
const allowedOrigins = [
  'https://move-2.onrender.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.CORS_ORIGIN,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
].filter(Boolean);

mongoose.set('bufferCommands', false);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
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
  senderName: { type: String, default: '' },
  senderLocation: { type: String, default: '' },
  receiverName: { type: String, default: '' },
  receiverLocation: { type: String, default: '' },
  originName: String,
  destinationName: String,
  origin: String,
  destination: String,
  departureAirportPort: String,
  arrivalAirportPort: String,
  estimatedDelivery: { type: String, default: 'Pending' },
  currentLocationName: String,
  currentPackageLocation: String,
  weight: Number,
  packageWeight: Number,
  totalFreight: Number,
  description: String,
  packageDescription: String,
  modeOfShipment: String,
  shipmentType: {
    type: String,
    enum: ['Air Freight', 'Sea Freight', 'Land Freight'],
    default: 'Land Freight'
  },
  carrier: {
    type: String,
    enum: ['ISC','DHL','USPS','FedEx','WCF','UPS','Royal Mail','International Shipping Agency']
  },
  quantity: Number,
  serviceType: String,
  paymentStatus: String,
  referenceNumber: String,
  specialInstructions: String,
  packageDimensions: String,
  insurance: String,
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
  cargo: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  pickupDate: { type: String },
  pickupTime: { type: String },
  deliveryDate: { type: String },
  deliveryTime: { type: String },
  expectedDeliveryTime: { type: String },
  timeline: [{
    date: String,
    time: String,
    status: String,
    location: String,
    remarks: String,
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

  if (!isMongoAvailable()) {
    return null;
  }

  const admin = await Admin.findById(session.adminId);
  return admin || null;
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
  const defaultAdminEmail = DEFAULT_ADMIN_EMAIL;
  const defaultAdminPassword = DEFAULT_ADMIN_PASSWORD;
  const passwordHash = await bcrypt.hash(defaultAdminPassword, 10);

  if (!isMongoAvailable()) {
    throw new Error('Database unavailable while ensuring default admin account');
  }

  const count = await Admin.countDocuments({}).catch(() => 0);
  if (count === 0) {
    await Admin.create({ email: defaultAdminEmail, passwordHash });
    console.log(`Created default admin account: ${defaultAdminEmail}`);
  }
};


const buildTimelineEntry = (payload = {}, existingShipment = null) => ({
  date: payload.date || payload.timelineDate || existingShipment?.timeline?.[0]?.date || new Date().toISOString().split('T')[0],
  time: payload.time || payload.timelineTime || existingShipment?.timeline?.[0]?.time || '',
  status: payload.status || existingShipment?.status || 'In Transit',
  location: payload.currentLocationName || existingShipment?.currentLocationName || payload.location || payload.currentLocation || '',
  remarks: payload.remarks || payload.description || existingShipment?.description || 'Shipment updated',
  description: payload.description || payload.remarks || existingShipment?.description || 'Shipment updated',
  timestamp: new Date(),
  updatedBy: payload.updatedBy || 'admin'
});

const normalizeShipmentPayload = (payload = {}, existingShipment = null, isCreate = false) => {
  const normalizedPayload = {
    ...payload,
    trackingNumber: normalizeTrackingNumber(payload.trackingNumber || existingShipment?.trackingNumber),
    senderName: payload.senderName || existingShipment?.senderName || payload.shipper?.name || '',
    receiverName: payload.receiverName || existingShipment?.receiverName || payload.receiver?.name || '',
    originName: payload.originName || payload.origin || existingShipment?.originName || '',
    destinationName: payload.destinationName || payload.destination || existingShipment?.destinationName || '',
    currentLocationName: payload.currentLocationName || payload.currentPackageLocation || existingShipment?.currentLocationName || '',
    currentPackageLocation: payload.currentPackageLocation || payload.currentLocationName || existingShipment?.currentPackageLocation || '',
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
  if (!normalizedPayload.currentLocationName && existingShipment?.currentLocationName) {
    normalizedPayload.currentLocationName = existingShipment.currentLocationName;
  }
  if (!normalizedPayload.currentPackageLocation && existingShipment?.currentPackageLocation) {
    normalizedPayload.currentPackageLocation = existingShipment.currentPackageLocation;
  }

  if (isCreate) {
    normalizedPayload.timeline = Array.isArray(payload.timeline) && payload.timeline.length > 0
      ? payload.timeline.map((entry) => ({ ...entry }))
      : [buildTimelineEntry(normalizedPayload, null)];
    return normalizedPayload;
  }

  if (Array.isArray(payload.timeline) && payload.timeline.length > 0) {
    normalizedPayload.timeline = payload.timeline.map((entry) => ({ ...entry }));
    return normalizedPayload;
  }

  const existingTimeline = Array.isArray(existingShipment?.timeline) ? existingShipment.timeline : [];
  normalizedPayload.timeline = [buildTimelineEntry(normalizedPayload, existingShipment), ...existingTimeline];
  return normalizedPayload;
};

// Admin auth routes
app.post('/api/admin/login', async (req, res) => {
  try {
    setNoStoreHeaders(res);
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!isMongoAvailable()) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const admin = await Admin.findOne({ email: normalizedEmail });
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
    setNoStoreHeaders(res);
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
  setNoStoreHeaders(res);
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
    setNoStoreHeaders(res);
    if (!isMongoAvailable()) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const { trackingNumber } = req.params;
    const shipment = await Shipment.findOne({ trackingNumber });

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Tracking number not found' });
    }

    res.json({ success: true, data: shipment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. API Route: Create / Seed a New Shipment (Admin action)
app.post('/api/shipments', authenticateAdmin, async (req, res) => {
  try {
    setNoStoreHeaders(res);
    if (!isMongoAvailable()) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const shipmentPayload = normalizeShipmentPayload(req.body, null, true);
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
    setNoStoreHeaders(res);
    if (!isMongoAvailable()) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const existingShipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
    const shipmentPayload = normalizeShipmentPayload(req.body, existingShipment, false);
    const updatedShipment = await Shipment.findOneAndUpdate(
      { trackingNumber: req.params.trackingNumber },
      shipmentPayload,
      { new: true }
    );

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
    setNoStoreHeaders(res);
    if (!isMongoAvailable()) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const shipments = await Shipment.find({}).limit(100).lean();
    res.json({ success: true, data: shipments });
  } catch (err) {
    console.error('SHIPMENTS_ERR', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete Shipment by Tracking Number
app.delete('/api/shipments/:trackingNumber', authenticateAdmin, async (req, res) => {
  try {
    setNoStoreHeaders(res);
    if (!isMongoAvailable()) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const deleted = await Shipment.deleteOne({ trackingNumber: req.params.trackingNumber });
    res.json({ success: true, message: 'Shipment deleted', deleted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const startServer = async () => {
  try {
    await connectToDatabase();
    await ensureDefaultAdmin();
    app.get('/_who', (req, res) => res.json({ pid: process.pid }));
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log('Process PID:', process.pid);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    console.error('MongoDB is required. Exiting startup to avoid running with volatile in-memory fallback.');
    process.exit(1);
  }
};

startServer();