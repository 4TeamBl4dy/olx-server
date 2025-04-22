const mongoose = require('mongoose');

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
    },
    { timestamps: true }
);

module.exports = mongoose.model('Product', ProductSchema);