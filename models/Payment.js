const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId: Number,
    amount: Number,
    fileId: String,
    fileType: String, // photo | document | text
    caption: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Payment', paymentSchema);
