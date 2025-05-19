const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Deal = require('../models/Deal');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/role');

// Получить статистику по категориям
router.get('/categories', authenticateToken, authorizeRole('admin', 'moderator'), async (req, res) => {
    try {
        // Агрегация по категориям, считаем только одобренные продукты
        const categoryStats = await Product.aggregate([
            { $match: { status: 'approved' } },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    totalPrice: { $sum: '$price' },
                    avgPrice: { $avg: '$price' },
                },
            },
            {
                $project: {
                    category: '$_id',
                    count: 1,
                    totalPrice: 1,
                    avgPrice: 1,
                    _id: 0,
                },
            },
            { $sort: { count: -1 } },
        ]);

        res.json({
            totalCategories: categoryStats.length,
            categories: categoryStats,
        });
    } catch (error) {
        console.error('Ошибка при получении статистики по категориям:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Получить статистику по пользователям (топ по количеству одобренных объявлений)
router.get('/users', authenticateToken, authorizeRole('admin', 'moderator'), async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        // Агрегация по пользователям, считаем только одобренные продукты
        const userStats = await Product.aggregate([
            { $match: { status: 'approved' } },
            {
                $group: {
                    _id: '$creatorId',
                    totalProducts: { $sum: 1 },
                    totalPrice: { $sum: '$price' },
                    avgPrice: { $avg: '$price' },
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'userInfo',
                },
            },
            { $unwind: '$userInfo' },
            {
                $project: {
                    userId: '$_id',
                    name: '$userInfo.name',
                    email: '$userInfo.email',
                    totalProducts: 1,
                    totalPrice: 1,
                    avgPrice: 1,
                    _id: 0,
                },
            },
            { $sort: { totalProducts: -1 } },
            { $limit: parseInt(limit) },
        ]);

        res.json({
            totalUsers: userStats.length,
            users: userStats,
        });
    } catch (error) {
        console.error('Ошибка при получении статистики по пользователям:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Получить статистику по сделкам
router.get('/deals', authenticateToken, authorizeRole('admin', 'moderator'), async (req, res) => {
    try {
        // Агрегация по статусам сделок
        const dealStats = await Deal.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    avgAmount: { $avg: '$amount' },
                },
            },
            {
                $project: {
                    status: '$_id',
                    count: 1,
                    totalAmount: 1,
                    avgAmount: 1,
                    _id: 0,
                },
            },
            { $sort: { count: -1 } },
        ]);

        // Получаем общую статистику по сделкам
        const totalStats = await Deal.aggregate([
            {
                $group: {
                    _id: null,
                    totalDeals: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    avgAmount: { $avg: '$amount' },
                },
            },
            {
                $project: {
                    _id: 0,
                    totalDeals: 1,
                    totalAmount: 1,
                    avgAmount: 1,
                },
            },
        ]);

        res.json({
            totalStats: totalStats[0] || {
                totalDeals: 0,
                totalAmount: 0,
                avgAmount: 0,
            },
            statusStats: dealStats,
        });
    } catch (error) {
        console.error('Ошибка при получении статистики по сделкам:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

module.exports = router;
