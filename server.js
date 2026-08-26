const fs = require('fs');
const path = require('path');
const dns = require('dns');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: true });

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
  deliveryLocation: String,
  latestUpdate: {
    title: String,
    description: String,
    location: String,
    date: String,
    time: String
  },
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
  deliveryMethod: String,
  deliveryDescription: String,
  expectedDeliveryTime: { type: String },
  timeline: [{
    title: String,
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

const adminSessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  adminEmail: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) }
});
adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const AdminSession = mongoose.model('AdminSession', adminSessionSchema, 'admin_sessions');

const isMongoAvailable = () => mongoose.connection.readyState === 1;

const normalizeTrackingNumber = (trackingNumber) => String(trackingNumber || '').trim();
const isValidTrackingNumber = (trackingNumber) => /^[A-Za-z0-9][A-Za-z0-9#._/-]{0,127}$/.test(trackingNumber);

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

const createAdminSession = async (admin) => {
  const token = crypto.randomBytes(32).toString('hex');
  await AdminSession.create({
    token,
    adminId: admin._id,
    adminEmail: admin.email,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });
  return token;
};

const getAuthenticatedAdmin = async (req) => {
  const token = getRequestToken(req);
  if (!token) return null;
  if (!isMongoAvailable()) {
    return null;
  }

  const session = await AdminSession.findOne({ token }).lean();
  if (!session) return null;
  if (session.expiresAt && session.expiresAt < new Date()) {
    await AdminSession.deleteOne({ token }).catch(() => {});
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
  if (!DEFAULT_ADMIN_EMAIL || !DEFAULT_ADMIN_PASSWORD) {
    console.warn('ADMIN_EMAIL and ADMIN_PASSWORD must be configured to create admin user.');
    return;
  }

  const defaultAdminEmail = String(DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const defaultAdminPassword = String(DEFAULT_ADMIN_PASSWORD);
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
    deliveryLocation: payload.deliveryLocation || existingShipment?.deliveryLocation || '',
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
    },
    latestUpdate: {
      ...(existingShipment?.latestUpdate || {}),
      ...(payload.latestUpdate || {})
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

  const existingTimeline = Array.isArray(existingShipment?.timeline) ? existingShipment.timeline : [];

  if (isCreate) {
    normalizedPayload.timeline = Array.isArray(payload.timeline) && payload.timeline.length > 0
      ? payload.timeline.map((entry) => ({ ...entry }))
      : [buildTimelineEntry(normalizedPayload, null)];
    return normalizedPayload;
  }

  if (Array.isArray(payload.timeline)) {
    normalizedPayload.timeline = payload.timeline.map((entry) => ({ ...entry }));
    return normalizedPayload;
  }

  const nextTimeline = [buildTimelineEntry(normalizedPayload, existingShipment), ...existingTimeline];
  normalizedPayload.timeline = nextTimeline;
  return normalizedPayload;
};

// Admin auth routes
const setNoStoreHeaders = (res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
};

app.post('/api/admin/login', async (req, res) => {
  try {
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

    setNoStoreHeaders(res);
    const token = await createAdminSession(admin);
    res.cookie('gm_session', token, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production',
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
    await AdminSession.deleteOne({ token }).catch(() => {});
  }
  res.cookie('gm_session', '', {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(0)
  });
  res.json({ success: true });
});

app.get('/api/public/shipments/tracking-numbers', async (req, res) => {
  try {
    setNoStoreHeaders(res);
    if (!isMongoAvailable()) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const shipments = await Shipment.find({}, { trackingNumber: 1, _id: 0 }).limit(500).lean();
    const trackingNumbers = shipments
      .map((shipment) => shipment.trackingNumber)
      .filter(Boolean);
    return res.json({ success: true, data: trackingNumbers });
  } catch (err) {
    console.error('TRACKING_NUMBERS_ERR', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

//  API Route: Get Shipment by Tracking Number
app.get('/api/public/shipments/:trackingNumber', async (req, res) => {
  try {
    setNoStoreHeaders(res);
    if (!isMongoAvailable()) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const trackingNumber = normalizeTrackingNumber(req.params.trackingNumber);
    if (!isValidTrackingNumber(trackingNumber)) {
      return res.status(400).json({ success: false, message: 'Invalid tracking number' });
    }
    const shipment = await Shipment.findOne({ trackingNumber });

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Tracking number not found' });
    }

    res.json({ success: true, data: shipment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. API Route: Create a new shipment (Admin action)
app.post('/api/shipments', authenticateAdmin, async (req, res) => {
  try {
    setNoStoreHeaders(res);
    if (!isMongoAvailable()) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const shipmentPayload = normalizeShipmentPayload(req.body, null, true);
    if (!isValidTrackingNumber(shipmentPayload.trackingNumber)) {
      return res.status(400).json({ success: false, message: 'Invalid tracking number' });
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
    setNoStoreHeaders(res);
    if (!isMongoAvailable()) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const existingShipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
    const shipmentPayload = normalizeShipmentPayload(req.body, existingShipment, false);
    if (!isValidTrackingNumber(shipmentPayload.trackingNumber)) {
      return res.status(400).json({ success: false, message: 'Invalid tracking number' });
    }
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

    const shipments = await Shipment.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: shipments });
  } catch (err) {
    console.error('SHIPMENTS_ERR', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get a single shipment by tracking number (Admin)
app.get('/api/shipments/:trackingNumber', authenticateAdmin, async (req, res) => {
  try {
    setNoStoreHeaders(res);
    if (!isMongoAvailable()) {
      return res.status(503).json({ success: false, message: 'Database unavailable. Try again later.' });
    }

    const { trackingNumber } = req.params;
    const shipment = await Shipment.findOne({ trackingNumber }).lean();

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    res.json({ success: true, data: shipment });
  } catch (err) {
    console.error('SHIPMENT_FETCH_ERR', err);
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
    console.error('MongoDB is required. Exiting startup to avoid running with volatile in-memory fallback.');
    process.exit(1);
  }
};

startServer();

