const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const { authenticateToken } = require('../middleware/auth');

// 1. Получить список чатов для пользователя (НЕЭФФЕКТИВНЫЙ СПОСОБ)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Шаг 1: Получаем основной список чатов с populated полями
        const chats = await Chat.find({
            $or: [{ participant1Id: userId }, { participant2Id: userId }],
        })
            .populate('participant1Id participant2Id', 'name profilePhoto _id') // Populating user details
            .populate('productId', 'title photo _id') // Populating product details
            .sort({ updatedAt: -1 })
            .lean(); // Используем .lean() для получения простых JS объектов, а не Mongoose документов

        // Шаг 2: Для каждого чата находим последнее сообщение (N+1 запросов!)
        // Используем Promise.all для параллельного выполнения запросов (но это все равно много запросов)
        const chatsWithLastMessage = await Promise.all(
            chats.map(async (chat) => {
                // Шаг 3: Выполняем отдельный запрос для каждого чата
                const lastMessage = await Message.findOne({ chatId: chat._id })
                    .sort({ createdAt: -1 }) // Находим самое новое
                    .select('_id text createdAt senderId status') // Выбираем нужные поля
                    .lean(); // Тоже используем lean()

                // Шаг 4: Добавляем найденное сообщение (или null) к объекту чата
                return {
                    ...chat, // Копируем все существующие поля чата
                    lastMessage: lastMessage, // Добавляем новое поле
                };
            })
        );

        res.json(chatsWithLastMessage); // Отправляем модифицированный массив
    } catch (err) {
        console.error('Ошибка получения чатов (метод N+1):', err.message);
        res.status(500).send('Server Error');
    }
});
// 2. Получить конкретный чат
router.get('/:chatId', authenticateToken, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId)
            .populate('participant1Id participant2Id', 'name profilePhoto')
            .populate('productId', 'title photo');
        if (!chat) {
            return res.status(404).json({ msg: 'Chat not found' });
        }

        if (chat.participant1Id.toString() !== req.user.id && chat.participant2Id.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        res.json(chat);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Chat not found' });
        }
        res.status(500).send('Server Error');
    }
});

// 3. Создать новый чат
router.post('/', authenticateToken, async (req, res) => {
    const { participant2Id, productId } = req.body;

    try {
        const userId = req.user.id;

        // Проверяем, что чат между этими пользователями и по этому продукту еще не существует
        let chat = await Chat.findOne({
            participant1Id: userId,
            participant2Id: participant2Id,
            productId: productId,
        });

        if (chat) {
            return res.status(400).json({ msg: 'Chat already exists' });
        }

        chat = new Chat({
            participant1Id: userId,
            participant2Id: participant2Id,
            productId: productId,
        });

        await chat.save();
        res.json(chat);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
