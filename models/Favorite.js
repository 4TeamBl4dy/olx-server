const mongoose = require('mongoose');


const favoriteSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId, // Ссылка на пользователя
            ref: 'User', // Ссылаемся на коллекцию пользователей
            required: true,
        },
        productId: {
            type: mongoose.Schema.Types.ObjectId, // Ссылка на объявление
            ref: 'Product', // Ссылаемся на коллекцию объявлений
            required: true,
        },
    },
    { timestamps: true } // Автоматически добавляет createdAt и updatedAt
);

// Индекс для уникальности пары userId-productId (чтобы пользователь не мог добавить одно и то же объявление в избранное несколько раз)
favoriteSchema.index({ userId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', favoriteSchema);