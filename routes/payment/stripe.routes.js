const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { authenticateToken } = require('../../middleware/auth');
const Balance = require('../../models/payment/Balance');
const BalanceHistory = require('../../models/payment/BalanceHistory');

// Middleware для обработки raw body для webhook
const rawBodyMiddleware = express.raw({ type: 'application/json' });

// Создание Payment Intent для пополнения баланса
router.post('/create-payment-intent', authenticateToken, async (req, res) => {
    try {
        const { amount } = req.body;

        // Валидация входных данных
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Неверная сумма' });
        }

        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'Пользователь не авторизован' });
        }

        // Создаем Payment Intent в Stripe
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // Stripe работает в тиын (1 тенге = 100 тиын)
            currency: 'kzt',
            metadata: {
                userId: req.user._id.toString(),
            },
        });

        // Создаем запись в истории баланса
        const balanceHistory = await BalanceHistory.create({
            user: req.user._id,
            type: 'topup',
            amount: amount * 100, // Конвертируем в тиын
            currency: 'KZT',
            status: 'pending',
            source: 'stripe',
            source_id: paymentIntent.id,
            description: 'Пополнение баланса через Stripe',
            metadata: {
                paymentIntentId: paymentIntent.id,
            },
        });

        res.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            balanceHistoryId: balanceHistory._id,
        });
    } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).json({ error: 'Ошибка при создании платежа' });
    }
});

// Webhook для обработки событий Stripe
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // Проверяем подпись webhook
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        console.log('Webhook event type:', event.type);
        console.log('Webhook event data:', JSON.stringify(event.data.object, null, 2));
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        // Обработка события
        switch (event.type) {
            case 'payment_intent.succeeded':
                console.log('Processing payment_intent.succeeded');
                await handlePaymentSuccess(event.data.object);
                break;
            case 'payment_intent.payment_failed':
                console.log('Processing payment_intent.payment_failed');
                await handlePaymentFailure(event.data.object);
                break;
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Ошибка при обработке webhook' });
    }
});

// Тестовый эндпоинт для проверки webhook'а
router.post('/webhook-test', express.raw({ type: 'application/json' }), (req, res) => {
    console.log('Test webhook received!');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    res.json({ received: true });
});

// Обработчик успешного платежа
async function handlePaymentSuccess(paymentIntent) {
    console.log('Processing successful payment:', paymentIntent.id);
    const { id: paymentIntentId, metadata } = paymentIntent;
    const { userId } = metadata;

    if (!userId) {
        console.error('No userId in payment intent metadata');
        return;
    }

    // Начинаем транзакцию MongoDB
    const session = await BalanceHistory.startSession();
    session.startTransaction();

    try {
        // Находим запись в истории баланса
        const balanceHistory = await BalanceHistory.findOne({
            source_id: paymentIntentId,
            status: 'pending',
        }).session(session);

        if (!balanceHistory) {
            console.error('No pending balance history found for payment:', paymentIntentId);
            await session.abortTransaction();
            return;
        }

        // Находим или создаем баланс пользователя
        let balance = await Balance.findOne({
            user: userId,
            currency: balanceHistory.currency,
        }).session(session);

        if (!balance) {
            balance = await Balance.create(
                [
                    {
                        user: userId,
                        currency: balanceHistory.currency,
                        balance: 0,
                    },
                ],
                { session }
            );
            balance = balance[0];
        }

        // Обновляем баланс
        balance.balance += balanceHistory.amount;
        await balance.save({ session });

        // Обновляем историю баланса
        balanceHistory.status = 'completed';
        balanceHistory.completed_at = new Date();
        await balanceHistory.save({ session });

        // Фиксируем транзакцию
        await session.commitTransaction();
        console.log('Successfully processed payment:', paymentIntentId);
    } catch (error) {
        console.error('Error in handlePaymentSuccess:', error);
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
}

// Обработчик неудачного платежа
async function handlePaymentFailure(paymentIntent) {
    console.log('Processing failed payment:', paymentIntent.id);
    const { id: paymentIntentId } = paymentIntent;

    try {
        const result = await BalanceHistory.findOneAndUpdate(
            {
                source_id: paymentIntentId,
                status: 'pending',
            },
            {
                status: 'failed',
                completed_at: new Date(),
            },
            { new: true }
        );

        if (!result) {
            console.error('No pending balance history found for failed payment:', paymentIntentId);
        } else {
            console.log('Successfully marked payment as failed:', paymentIntentId);
        }
    } catch (error) {
        console.error('Error handling payment failure:', error);
        throw error;
    }
}

// Получение баланса пользователя
router.get('/balance', authenticateToken, async (req, res) => {
    try {
        const balance = await Balance.findOne({
            user: req.user._id,
            currency: 'KZT',
        });

        // Если у пользователя нет баланса, создаем его с нулевым значением
        if (!balance) {
            const defaultBalance = await Balance.createBalance(req.user._id, 'KZT');
            return res.json(defaultBalance);
        }

        res.json(balance);
    } catch (error) {
        console.error('Error getting balance:', error);
        res.status(500).json({ error: 'Ошибка при получении баланса' });
    }
});

// Получение истории баланса пользователя
router.get('/balance/history', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 10, type, status } = req.query;
        const query = {
            user: req.user._id,
            currency: 'KZT',
        };

        // Добавляем фильтры, если они указаны
        if (type) query.type = type;
        if (status) query.status = status;

        const history = await BalanceHistory.find(query)
            .sort({ created_at: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await BalanceHistory.countDocuments(query);

        res.json({
            history,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit),
        });
    } catch (error) {
        console.error('Error getting balance history:', error);
        res.status(500).json({ error: 'Ошибка при получении истории баланса' });
    }
});

// Универсальный маршрут для операций с балансом
router.post('/balance/operation', authenticateToken, async (req, res) => {
    try {
        const { amount, type, description, metadata } = req.body;

        if (!amount || !type || !description) {
            return res.status(400).json({ error: 'Необходимо указать сумму, тип операции и описание' });
        }

        // Начинаем транзакцию MongoDB
        const session = await BalanceHistory.startSession();
        session.startTransaction();

        try {
            // Находим или создаем баланс пользователя
            let balance = await Balance.findOne({
                user: req.user._id,
                currency: 'KZT',
            }).session(session);

            if (!balance) {
                balance = await Balance.create({
                    user: req.user._id,
                    currency: 'KZT',
                    balance: 0,
                });
            }

            // Проверяем достаточность средств для операций, уменьшающих баланс
            const isDecreasingOperation = ['withdrawal', 'payment', 'fee'].includes(type);
            if (isDecreasingOperation && balance.balance < amount * 100) {
                await session.abortTransaction();
                return res.status(400).json({ error: 'Недостаточно средств на балансе' });
            }

            // Создаем запись в истории баланса
            const balanceHistory = await BalanceHistory.create(
                [
                    {
                        user: req.user._id,
                        type,
                        amount: amount * 100, // Конвертируем в тиын
                        currency: 'KZT',
                        status: 'completed',
                        source: 'manual',
                        description,
                        metadata: metadata || {},
                        completed_at: new Date(),
                    },
                ],
                { session }
            );

            // Обновляем баланс в зависимости от типа операции
            switch (type) {
                case 'topup':
                case 'refund':
                    balance.balance += amount * 100;
                    break;
                case 'withdrawal':
                case 'payment':
                case 'fee':
                    balance.balance -= amount * 100;
                    break;
                default:
                    await session.abortTransaction();
                    return res.status(400).json({ error: 'Недопустимый тип операции' });
            }

            await balance.save({ session });

            // Фиксируем транзакцию
            await session.commitTransaction();

            res.json({
                balance,
                history: balanceHistory[0],
            });
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    } catch (error) {
        console.error('Error processing balance operation:', error);
        res.status(500).json({ error: 'Ошибка при обработке операции с балансом' });
    }
});

module.exports = router;
