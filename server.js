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

if (mongoUri && mongoUri.startsWith('mongodb+srv://')) {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const app = express();
const PORT = process.env.PORT || 5000;

mongoose.set('bufferCommands', false);

// Middleware
app.use(cors({ origin: true, credentials: true, allowedHeaders: ['Content-Type', 'Authorization'] }));
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
  senderName: { type: String, default: 'N/A' },
  senderLocation: { type: String, default: 'N/A' },
  receiverName: { type: String, default: 'N/A' },
  receiverLocation: { type: String, default: 'N/A' },
  originName: String,
  destinationName: String,
  estimatedDelivery: { type: String, default: 'Pending' },
  weight: Number,
  description: String,
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
  const defaultAdminEmail = DEFAULT_ADMIN_EMAIL;
  const defaultAdminPassword = DEFAULT_ADMIN_PASSWORD;
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

// 4. API Route: Create / Seed a New Shipment (Admin action)
app.post('/api/shipments', authenticateAdmin, async (req, res) => {
  try {
    if (!isMongoAvailable()) {
      const shipment = await saveShipmentToMemory(req.body);
      return res.status(201).json({ success: true, data: shipment });
    }

    const shipment = new Shipment(req.body);
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
    const updatedShipment = isMongoAvailable()
      ? await Shipment.findOneAndUpdate(
          { trackingNumber: req.params.trackingNumber },
          req.body,
          { new: true } // returns the updated document
        )
      : await updateShipmentInMemory(req.params.trackingNumber, req.body);

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
    console.warn('Falling back to the in-memory shipment store for API requests until MongoDB Atlas is reachable.');
    await ensureDefaultAdmin();
    app.get('/_who', (req, res) => res.json({ pid: process.pid }));
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log('Process PID:', process.pid);
    });
  }
};

startServer();