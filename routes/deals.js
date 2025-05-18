const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Deal = require('../models/Deal');
const Product = require('../models/Product');
const User = require('../models/User');
const Balance = require('../models/payment/Balance');
const BalanceHistory = require('../models/payment/BalanceHistory');

// Создание сделки и списание денег
router.post('/create', authenticateToken, async (req, res) => {
    const session = await Deal.startSession();
    session.startTransaction();

    try {
        const { productId, delivery } = req.body;
        const buyerId = req.user._id;

        // Получаем информацию о продукте
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ error: 'Товар не найден' });
        }

        // Проверяем баланс покупателя
        const buyerBalance = await Balance.findOne({ user: buyerId });
        if (!buyerBalance || buyerBalance.balance < product.price) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

        // Создаем сделку
        const deal = await Deal.create(
            [
                {
                    product: product.toObject(),
                    productId: product._id,
                    seller: product.creatorId,
                    buyer: buyerId,
                    amount: product.price,
                    delivery: {
                        method: delivery.delivery.method,
                        address: delivery.delivery.address,
                        note: delivery.delivery.note,
                    },
                    status: 'pending',
                },
            ],
            { session }
        );

        // Списываем деньги с баланса покупателя
        buyerBalance.balance -= product.price * 100;
        await buyerBalance.save({ session });

        // Добавляем запись в историю баланса покупателя
        await BalanceHistory.create(
            [
                {
                    user: buyerId,
                    type: 'payment',
                    amount: product.price * 100,
                    currency: 'KZT',
                    status: 'completed',
                    source: 'internal',
                    source_id: `deal_payment_${deal[0]._id}_buyer`,
                    description: `Оплата за товар: ${product.title}`,
                    metadata: {
                        dealId: deal[0]._id,
                    },
                },
            ],
            { session }
        );

        // Находим или создаем баланс админа
        const adminBalance =
            (await Balance.findOne({ user: process.env.ADMIN_USER_ID })) ||
            (await Balance.create(
                [
                    {
                        user: process.env.ADMIN_USER_ID,
                        currency: 'KZT',
                        balance: 0,
                    },
                ],
                { session }
            ));

        // Зачисляем деньги на баланс админа
        adminBalance.balance += product.price * 100;
        await adminBalance.save({ session });

        // Добавляем запись в историю баланса админа
        await BalanceHistory.create(
            [
                {
                    user: process.env.ADMIN_USER_ID,
                    type: 'payment',
                    amount: product.price * 100,
                    currency: 'KZT',
                    status: 'completed',
                    source: 'internal',
                    source_id: `deal_payment_${deal[0]._id}_admin`,
                    description: `Удержание средств по сделке: ${product.title}`,
                    metadata: {
                        dealId: deal[0]._id,
                    },
                },
            ],
            { session }
        );

        await session.commitTransaction();
        res.json(deal[0]);
    } catch (error) {
        await session.abortTransaction();
        console.error('Error creating deal:', error);
        res.status(500).json({ error: 'Ошибка при создании сделки' });
    } finally {
        session.endSession();
    }
});

// Подтверждение получения товара
router.post('/:dealId/confirm-receipt', authenticateToken, async (req, res) => {
    const session = await Deal.startSession();
    session.startTransaction();

    try {
        const deal = await Deal.findById(req.params.dealId);
        if (!deal) {
            return res.status(404).json({ error: 'Сделка не найдена' });
        }

        if (deal.status !== 'pending') {
            return res.status(400).json({ error: 'Неверный статус сделки' });
        }

        // Обновляем статус сделки
        deal.status = 'received';
        await deal.save({ session });

        // Находим баланс админа
        const adminBalance = await Balance.findOne({ user: process.env.ADMIN_USER_ID });
        if (!adminBalance) {
            throw new Error('Баланс админа не найден');
        }

        // Списываем деньги с баланса админа
        adminBalance.balance -= deal.amount * 100;
        await adminBalance.save({ session });

        // Находим баланс продавца
        const sellerBalance = await Balance.findOne({ user: deal.seller });
        if (!sellerBalance) {
            throw new Error('Баланс продавца не найден');
        }

        // Зачисляем деньги на баланс продавца
        sellerBalance.balance += deal.amount * 100;
        await sellerBalance.save({ session });

        // Добавляем записи в историю баланса
        await BalanceHistory.create(
            [
                {
                    user: process.env.ADMIN_USER_ID,
                    type: 'payment',
                    amount: deal.amount * 100,
                    currency: 'KZT',
                    status: 'completed',
                    source: 'internal',
                    source_id: `deal_release_${deal._id}_admin`,
                    description: `Перевод средств продавцу по сделке: ${deal.product.title}`,
                    metadata: { dealId: deal._id },
                },
                {
                    user: deal.seller,
                    type: 'topup',
                    amount: deal.amount * 100,
                    currency: 'KZT',
                    status: 'completed',
                    source: 'internal',
                    source_id: `deal_release_${deal._id}_seller`,
                    description: `Получение средств по сделке: ${deal.product.title}`,
                    metadata: { dealId: deal._id },
                },
            ],
            { session, ordered: true }
        );

        await session.commitTransaction();
        res.json(deal);
    } catch (error) {
        await session.abortTransaction();
        console.error('Error confirming receipt:', error);
        res.status(500).json({ error: 'Ошибка при подтверждении получения' });
    } finally {
        session.endSession();
    }
});

// Запрос на возврат
router.post('/:dealId/request-refund', authenticateToken, async (req, res) => {
    try {
        const deal = await Deal.findById(req.params.dealId);
        if (!deal) {
            return res.status(404).json({ error: 'Сделка не найдена' });
        }

        if (deal.buyer.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Нет доступа' });
        }

        if (deal.status !== 'received') {
            return res.status(400).json({ error: 'Неверный статус сделки' });
        }

        deal.status = 'refund_requested';
        await deal.save();

        res.json(deal);
    } catch (error) {
        console.error('Error requesting refund:', error);
        res.status(500).json({ error: 'Ошибка при запросе возврата' });
    }
});

// Одобрение возврата
router.post('/:dealId/approve-refund', authenticateToken, async (req, res) => {
    const session = await Deal.startSession();
    session.startTransaction();

    try {
        const deal = await Deal.findById(req.params.dealId);
        if (!deal) {
            return res.status(404).json({ error: 'Сделка не найдена' });
        }

        if (deal.status !== 'refund_requested') {
            return res.status(400).json({ error: 'Неверный статус сделки' });
        }

        // Обновляем статус сделки
        deal.status = 'refunded';
        await deal.save({ session });

        // Находим баланс продавца
        const sellerBalance = await Balance.findOne({ user: deal.seller });
        if (!sellerBalance) {
            throw new Error('Баланс продавца не найден');
        }

        // Списываем деньги с баланса продавца
        sellerBalance.balance -= deal.amount * 100;
        await sellerBalance.save({ session });

        // Находим баланс покупателя
        const buyerBalance = await Balance.findOne({ user: deal.buyer });
        if (!buyerBalance) {
            throw new Error('Баланс покупателя не найден');
        }

        // Возвращаем деньги покупателю
        buyerBalance.balance += deal.amount * 100;
        await buyerBalance.save({ session });

        // Добавляем записи в историю баланса
        await BalanceHistory.create(
            [
                {
                    user: deal.seller,
                    type: 'payment',
                    amount: deal.amount * 100,
                    currency: 'KZT',
                    status: 'completed',
                    source: 'internal',
                    source_id: `deal_refund_${deal._id}_seller`,
                    description: `Возврат средств покупателю: ${deal.product.title}`,
                    metadata: { dealId: deal._id },
                },
                {
                    user: deal.buyer,
                    type: 'topup',
                    amount: deal.amount * 100,
                    currency: 'KZT',
                    status: 'completed',
                    source: 'internal',
                    source_id: `deal_refund_${deal._id}_buyer`,
                    description: `Получение возврата средств: ${deal.product.title}`,
                    metadata: { dealId: deal._id },
                },
            ],
            { session, ordered: true }
        );

        await session.commitTransaction();
        res.json(deal);
    } catch (error) {
        await session.abortTransaction();
        console.error('Error approving refund:', error);
        res.status(500).json({ error: 'Ошибка при одобрении возврата' });
    } finally {
        session.endSession();
    }
});

// Отклонение возврата
router.post('/:dealId/reject-refund', authenticateToken, async (req, res) => {
    try {
        const deal = await Deal.findById(req.params.dealId);
        if (!deal) {
            return res.status(404).json({ error: 'Сделка не найдена' });
        }

        if (deal.status !== 'refund_requested') {
            return res.status(400).json({ error: 'Неверный статус сделки' });
        }

        deal.status = 'received';
        await deal.save();

        res.json(deal);
    } catch (error) {
        console.error('Error rejecting refund:', error);
        res.status(500).json({ error: 'Ошибка при отклонении возврата' });
    }
});

// Получение всех сделок пользователя
router.get('/user', authenticateToken, async (req, res) => {
    try {
        const { role, status } = req.query;
        const userId = req.user._id;

        // Базовый запрос
        const query = {
            $or: [{ buyer: userId }, { seller: userId }],
        };

        // Добавляем фильтр по роли если указана
        if (role === 'buyer') {
            query.$or = [{ buyer: userId }];
        } else if (role === 'seller') {
            query.$or = [{ seller: userId }];
        }

        // Добавляем фильтр по статусу если указан
        if (status) {
            query.status = status;
        }

        // Получаем сделки с пагинацией
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const deals = await Deal.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('buyer', 'name')
            .populate('seller', 'name')
            .populate('productId', 'title photo price');

        // Получаем общее количество сделок для пагинации
        const total = await Deal.countDocuments(query);

        res.json({
            deals,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Error getting user deals:', error);
        res.status(500).json({ error: 'Ошибка при получении сделок' });
    }
});

// Получение всех заявок на возврат (только для админов и модераторов)
router.get('/refund-requests', authenticateToken, async (req, res) => {
    try {
        // Проверяем роль пользователя
        const user = await User.findById(req.user._id);
        if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
            return res.status(403).json({ error: 'Нет доступа' });
        }

        // Получаем заявки на возврат с пагинацией
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const refundRequests = await Deal.find({ status: 'refund_requested' })
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('buyer', 'name email phoneNumber')
            .populate('seller', 'name email phoneNumber')
            .populate('productId', 'title photo price');

        // Получаем общее количество заявок для пагинации
        const total = await Deal.countDocuments({ status: 'refund_requested' });

        res.json({
            refundRequests,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Error getting refund requests:', error);
        res.status(500).json({ error: 'Ошибка при получении заявок на возврат' });
    }
});

module.exports = router;
