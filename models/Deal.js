const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema({
    product: {
        type: Object,
        required: true,
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    buyer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    delivery: {
        method: {
            type: String,
            enum: ['pickup', 'delivery'], // pickup = самовывоз, delivery = доставка
            required: true,
        },
        address: {
            type: String,
            required: function () {
                return this.parent().method === 'delivery';
            },
        },
        note: {
            type: String,
        },
    },
    status: {
        type: String,
        enum: ['pending', 'received', 'refund_requested', 'refunded', 'cancelled'],
        default: 'pending',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: Date,
});

dealSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Deal', dealSchema);
