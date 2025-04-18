const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const User = require('../models/User');
const { uploadImagesToCloudflare } = require('../cloudflareHandler');

const upload = multer({ storage: multer.memoryStorage() });

// Проверка JWT_SECRET при запуске
if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET не определен в переменных окружения');
}

// Middleware для проверки токена
const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ message: 'Токен отсутствует' });
    }
 
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(401).json({ message: 'Недействительный токен' });
    }
};

// Регистрация пользователя
router.post('/register', async (req, res) => {
    const { email, password, name, profilePhoto, phoneNumber } = req.body;

    try {
        // Проверка, существует ли пользователь
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
        }

        // Создание нового пользователя
        user = new User({
            email,
            password, // Пароль будет автоматически хеширован в pre('save')
            name: name || undefined,
            profilePhoto: profilePhoto || undefined,
            phoneNumber: phoneNumber || undefined,
        });

        await user.save();

        // Генерация JWT-токена
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.status(201).json({
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                profilePhoto: user.profilePhoto,
                phoneNumber: user.phoneNumber,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        console.error('Server error in /register:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Вход пользователя
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Проверка, существует ли пользователь
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Неверный email или пароль' });
        }

        // Проверка пароля
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Неверный email или пароль' });
        }

        // Генерация JWT-токена
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.json({
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                profilePhoto: user.profilePhoto,
                phoneNumber: user.phoneNumber,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        console.error('Server error in /login:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Получение данных пользователя по ID
router.get('/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }
        res.json({ user });
    } catch (error) {
        console.error('Server error in /users/:id:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Обновление данных пользователя по ID
router.put('/:id', upload.any(), async (req, res) => {
    try {
        const userId = req.params.id;
        let userData = req.body;

        // Парсим JSON, если он пришел как строка
        if (typeof userData === 'string') {
            userData = JSON.parse(userData);
        }

        // Проверяем существование пользователя
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Формируем объект с данными для обновления
        const updates = {
            name: userData.name || user.name,
            phoneNumber: userData.phone || user.phoneNumber,
            photo: req.files?.filter((f) => f.fieldname.startsWith('photo[')) || [],
        };

        // Обрабатываем изображения через Cloudflare
        const [processedUser] = await uploadImagesToCloudflare([updates]);

        // Формируем финальные данные для обновления
        const updateFields = {
            name: processedUser.name,
            phoneNumber: processedUser.phoneNumber,
        };

        if (processedUser.photo && processedUser.photo.length > 0) {
            updateFields.profilePhoto = processedUser.photo[0]; // Берем первое фото
        }

        // Обновляем пользователя в базе данных
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updateFields },
            { new: true, runValidators: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ message: 'Пользователь не найден при обновлении' });
        }

        res.status(200).json({ user: updatedUser });
    } catch (error) {
        console.error('Ошибка при обновлении пользователя:', error);
        res.status(400).json({ message: 'Ошибка в данных или на сервере' });
    }
});



module.exports = router;
