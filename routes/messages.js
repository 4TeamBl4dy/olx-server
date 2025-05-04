const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const { authenticateToken } = require('../middleware/auth');

// Экспортируем функцию, которая принимает io и возвращает роутер
module.exports = (io) => {
    // 1. Получить сообщения для чата (без изменений)
    router.get('/:chatId', authenticateToken, async (req, res) => {
        try {
            const messages = await Message.find({ chatId: req.params.chatId })
                .populate('senderId', '_id username avatarUrl name email profilePhoto phoneNumber createdAt') // Добавьте нужные поля
                .sort({ createdAt: 1 });
            res.json(messages);
        } catch (err) {
            console.error('Ошибка получения сообщений:', err.message);
            res.status(500).send('Server Error');
        }
    });

    // 2. Отправить новое сообщение (с интеграцией WebSocket)
    router.post('/:chatId', authenticateToken, async (req, res) => {
        const { text } = req.body;
        const chatId = req.params.chatId;
        const senderId = req.user.id; // ID пользователя из токена

        if (!text || !text.trim()) {
            return res.status(400).json({ msg: 'Текст сообщения не может быть пустым' });
        }

        try {
            let newMessage = new Message({
                chatId: chatId,
                senderId: senderId,
                text: text.trim(),
                // status по умолчанию 'sent' (если определен в схеме)
            });

            await newMessage.save();

            // Получаем полную информацию об отправителе для отправки клиентам
            // Важно: Убедитесь, что populate возвращает ВСЕ поля, нужные на клиенте (_id обязательно)
            newMessage = await Message.findById(newMessage._id)
                .populate('senderId', '_id username avatarUrl name email profilePhoto phoneNumber createdAt')
                .exec();

            if (!newMessage) {
                throw new Error('Сообщение не найдено после сохранения и populate');
            }

            console.log(`Сообщение сохранено: ${newMessage._id}, отправляем в комнату ${chatId}`);

            // *** Отправка сообщения через WebSocket ВСЕМ в комнате chatId ***
            io.to(chatId).emit('newMessage', newMessage);
            // io.to(chatId) - выбирает всех клиентов в комнате chatId
            // .emit('newMessage', newMessage) - отправляет событие 'newMessage' с данными сообщения

            // Отвечаем на HTTP запрос успешно сохраненным сообщением
            res.status(201).json(newMessage);
        } catch (err) {
            console.error('Ошибка отправки сообщения:', err.message);
            res.status(500).send('Server Error');
        }
    });

    return router; // Возвращаем настроенный роутер
};
