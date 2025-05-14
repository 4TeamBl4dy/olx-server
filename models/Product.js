const mongoose = require('mongoose');

const PRODUCT_STATUSES= {
    PENDING_REVIEW: 'pending_review',   // На рассмотрении
    APPROVED: 'approved',             // Одобрено
    REJECTED: 'rejected',             // Отклонено
    OUTDATED: 'outdated',             // Не актуально или устарело (или 'archived', 'expired')
};

const ProductSchema = new mongoose.Schema(
    {
        photo: { type: [String] }, // Фото товара
        title: { type: String, required: true }, // Заголовок объявления
        category: { type: String, required: true }, // Категория товара
        description: { type: String }, // Описание товара
        dealType: { type: String, required: true }, // Тип сделки
        price: { type: Number }, // Цена товара
        isNegotiable: { type: Boolean, default: false }, // Возможен торг
        condition: { type: String, required: true }, // Состояние товара
        address: { type: String, required: true }, // Адрес
        sellerName: { type: String, required: true }, // Имя продавца
        email: { type: String }, // Email продавца
        phone: { type: String }, // Телефон продавца
        creatorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        }, // ID создателя (пользователя)
        boostedUntil: {
            type: Date,
            default: null // по умолчанию буст не активен
        },
        status: {
            type: String,
            enum: Object.values(PRODUCT_STATUSES), // Используем английские значения для enum
            default: PRODUCT_STATUSES.PENDING_REVIEW, // По умолчанию 'pending_review'
            required: true,
        },
        rejectionReason: {
            type: String,
            default: '',
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Product', ProductSchema);