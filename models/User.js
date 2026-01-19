const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  userId: { type: Number, unique: true, required: true }, // Telegram user ID

  // ================= REFERAL =================
  refBy: { type: Number, default: null },      // Kim refer qildi
  refCount: { type: Number, default: 0 },      // Referallar soni

  refBonusTaken: { type: Boolean, default: false }, // 🔒 Kirgan user bonus oldimi
  refBonusGiven: { type: Boolean, default: false }, // 🔒 Refer qilganga bonus berildimi

  // ================= BALANS =================
  balance: { type: Number, default: 0 },       // Joriy balans
  totalEarned: { type: Number, default: 0 },   // Umumiy ishlab topilgan summa
  lastBonus: { type: Date, default: null },    // Oxirgi bonus vaqti

  // ================= SYSTEM =================
  createdAt: { type: Date, default: Date.now },// Qo‘shilgan sana

  // ================= YECHIB OLISH =================
  cardNumber: { type: String, default: null }, // Karta raqami
  fullName: { type: String, default: null },   // Ism Familiya
  lastWithdrawalRequest: { type: Date, default: null } // Oxirgi yechish so‘rovi
});

module.exports = mongoose.model('User', UserSchema);
