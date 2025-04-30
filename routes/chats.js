const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const { authenticateToken } = require('../middleware/auth');

// 1. Получить список чатов для пользователя
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const chats = await Chat.find({
      $or: [
        { participant1Id: userId },
        { participant2Id: userId }
      ]
    })
    .populate('participant1Id participant2Id', 'username avatarUrl')
    .sort({ updatedAt: -1 }); // Сортируем по последнему обновлению

    res.json(chats);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// 2. Получить конкретный чат
router.get('/:chatId', authenticateToken, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId)
      .populate('participant1Id participant2Id', 'username avatarUrl');

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
      productId: productId
    });

    if (chat) {
      return res.status(400).json({ msg: 'Chat already exists' });
    }

    chat = new Chat({
      participant1Id: userId,
      participant2Id: participant2Id,
      productId: productId
    });

    await chat.save();
    res.json(chat);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;