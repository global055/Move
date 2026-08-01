const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 20000,
      maxPoolSize: 10
    });

    console.log('state', mongoose.connection.readyState);
    const Shipment = mongoose.model('ShipmentProbe', new mongoose.Schema({ trackingNumber: String }, { strict: false }));
    const docs = await Shipment.find({}).limit(1).lean().exec();
    console.log('docs', docs);
  } catch (err) {
    console.error('query err', err);
  } finally {
    await mongoose.disconnect();
  }
})();
