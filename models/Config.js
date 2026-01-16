const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
  refAmount: { type: Number, default: 100 },
  requiredChannels: { type: [String], default: [] } // cheksiz kanal array
});

module.exports = mongoose.model('Config', ConfigSchema);
