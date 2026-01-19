const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
  // Referal uchun beriladigan pul
  refAmount: { type: Number, default: 100 },

  // Kunlik bonus summasi
  bonusAmount: { type: Number, default: 50 },

  // Minimal yechib olish summasi
  minWithdraw: { type: Number, default: 10000 },

  // Majburiy obuna kanallari
  requiredChannels: { type: [String], default: [] }
});

module.exports = mongoose.model('Config', ConfigSchema);
