const mongoose = require('mongoose');

const balanceHistorySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        account: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Balance',
            index: true,
        },
        type: {
            type: String,
            required: true,
            enum: ['topup', 'payment', 'withdrawal', 'refund', 'fee', 'adjustment'],
            index: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        currency: {
            type: String,
            required: true,
            uppercase: true,
            trim: true,
            minlength: 3,
            maxlength: 3,
        },
        status: {
            type: String,
            required: true,
            enum: ['pending', 'completed', 'failed', 'cancelled'],
            default: 'pending',
            index: true,
        },
        description: {
            type: String,
            trim: true,
        },
        source: {
            type: String,
            enum: ['stripe', 'manual', 'system', 'internal'],
            required: true,
        },
        source_id: {
            type: String,
            required: false,
        },
        metadata: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
        },
        idempotency_key: {
            type: String,
            sparse: true,
            index: true,
        },
        completed_at: {
            type: Date,
        },
    },
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        },
    }
);

// Индексы для оптимизации запросов
balanceHistorySchema.index({ user: 1, created_at: -1 });
balanceHistorySchema.index({ source: 1, source_id: 1 }, { unique: true, sparse: true });
balanceHistorySchema.index({ status: 1, created_at: 1 });

const BalanceHistory = mongoose.model('BalanceHistory', balanceHistorySchema);

module.exports = BalanceHistory;
