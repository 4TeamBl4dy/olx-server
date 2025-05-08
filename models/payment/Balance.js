const mongoose = require('mongoose');

const balanceSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        currency: {
            type: String,
            required: true,
            uppercase: true,
            trim: true,
            minlength: 3,
            maxlength: 3,
            validate: {
                validator: function (v) {
                    // Проверка на соответствие стандарту ISO 4217
                    return /^[A-Z]{3}$/.test(v);
                },
                message: (props) => `${props.value} не является допустимым кодом валюты ISO 4217`,
            },
        },
        balance: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
            get: (v) => v / 100, // Конвертация из минимальных единиц в основные
            set: (v) => Math.round(v * 100), // Конвертация из основных единиц в минимальные
        },
    },
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        },
        toJSON: { getters: true },
        toObject: { getters: true },
    }
);


const Balance = mongoose.model('Balance', balanceSchema);

module.exports = Balance;
