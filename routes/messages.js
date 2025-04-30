const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const { authenticateToken } = require('../middleware/auth');

// 1. Получить сообщения для чата
router.get('/:chatId', authenticateToken, async (req, res) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId })
      .populate('senderId', 'username avatarUrl')
      .sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// 2. Отправить новое сообщение
router.post('/:chatId', authenticateToken, async (req, res) => {
  const { text } = req.body;

  try {
    const newMessage = new Message({
      chatId: req.params.chatId,
      senderId: req.user.id,
      text: text
    });

    await newMessage.save();
    await newMessage.populate('senderId', 'username avatarUrl');


    // TODO: Отправить сообщение через WebSocket (Socket.IO)

    res.json(newMessage);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;