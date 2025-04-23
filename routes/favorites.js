const express = require('express');
const Favorite = require('../models/Favorite');

const router = express.Router();

// GET /favorites - Получить все записи избранного
router.get('/', async (req, res) => {
    try {
        const favorites = await Favorite.find()
            .populate('userId', 'name email')
            .populate('productId', 'title price');
        res.status(200).json(favorites);
    } catch (error) {
        console.error('Ошибка при получении избранного:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// GET /favorites/user/:userId - Получить избранное пользователя по его ID
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const favorites = await Favorite.find({ userId })
            .populate('userId', 'name email')
            .populate('productId', 'title price');

        if (!favorites || favorites.length === 0) {
            return res.status(404).json({ message: 'Избранное не найдено для этого пользователя' });
        }

        res.status(200).json(favorites);
    } catch (error) {
        console.error('Ошибка при получении избранного пользователя:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// POST /favorites - Добавить новое избранное
router.post('/', async (req, res) => {
    try {
        const { userId, productId } = req.body;

        if (!userId || !productId) {
            return res.status(400).json({ message: 'userId и productId обязательны' });
        }

        const newFavorite = new Favorite({
            userId,
            productId,
        });

        await newFavorite.save();
        const populatedFavorite = await Favorite.findById(newFavorite._id)
            .populate('userId', 'name email')
            .populate('productId', 'title price');

        res.status(201).json(populatedFavorite);
    } catch (error) {
        console.error('Ошибка при добавлении в избранное:', error);
        // Если ошибка связана с уникальным индексом (дубликат), возвращаем 409
        if (error.code === 11000) {
            return res.status(409).json({ message: 'Этот товар уже в избранном' });
        }
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// DELETE /favorites/:id - Удалить запись избранного по её ID
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedFavorite = await Favorite.findByIdAndDelete(id);

        if (!deletedFavorite) {
            return res.status(404).json({ message: 'Запись избранного не найдена' });
        }

        res.status(200).json({ message: 'Запись избранного успешно удалена' });
    } catch (error) {
        console.error('Ошибка при удалении избранного:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

module.exports = router;