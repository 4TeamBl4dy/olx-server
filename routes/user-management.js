const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/role');

// Получить список всех заблокированных пользователей
router.get('/blocked', authenticateToken, authorizeRole('admin', 'moderator'), async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        // Получаем заблокированных пользователей с пагинацией
        const blockedUsers = await User.find({ role: 'blocked' })
            .select('-password') // Исключаем пароли
            .sort({ updatedAt: -1 }) // Сортировка по дате блокировки (самые новые сверху)
            .skip(skip)
            .limit(parseInt(limit));

        // Получаем общее количество заблокированных пользователей
        const total = await User.countDocuments({ role: 'blocked' });

        res.json({
            users: blockedUsers,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Ошибка при получении списка заблокированных пользователей:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Заблокировать пользователя (только для админов и модераторов)
router.put('/block/:id', authenticateToken, authorizeRole('admin', 'moderator'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Нельзя заблокировать админа
        if (user.role === 'admin' || user.role === 'moderator') {
            return res.status(403).json({ message: 'Нельзя заблокировать администратора или модератора' });
        }

        user.role = 'blocked';
        await user.save();

        res.json({
            message: 'Пользователь заблокирован',
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Ошибка при блокировке пользователя:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Разблокировать пользователя (только для админов и модераторов)
router.put('/unblock/:id', authenticateToken, authorizeRole('admin', 'moderator'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Проверяем, что пользователь действительно заблокирован
        if (user.role !== 'blocked') {
            return res.status(400).json({ message: 'Пользователь не заблокирован' });
        }

        user.role = 'user';
        await user.save();

        res.json({
            message: 'Пользователь разблокирован',
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Ошибка при разблокировке пользователя:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

module.exports = router;
