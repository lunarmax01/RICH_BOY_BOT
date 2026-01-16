const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  userId: { type: Number, unique: true },      // Telegram user ID
  refBy: { type: Number, default: null },      // Referal kimdan
  balance: { type: Number, default: 0 },       // Balans
  lastBonus: { type: Date, default: null },    // Bonus olgan sana
  createdAt: { type: Date, default: Date.now },// Foydalanuvchi qachon qo‘shilgan

  // ================= YECHIB OLISH MAYDONLARI =================
  cardNumber: { type: String, default: null },// Karta raqami
  fullName: { type: String, default: null },  // Ism Familiya
  lastWithdrawalRequest: { type: Date, default: null } // So‘nggi yechib olish so‘rovi vaqti
});

module.exports = mongoose.model('User', UserSchema);
