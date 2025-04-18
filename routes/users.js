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

// Получение данных пользователя (защищённый маршрут)
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }
        res.json(user);
    } catch (error) {
        console.error('Server error in /me:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

router.patch('/:id', upload.single('profilePhoto'), async (req, res) => {
    try {
        const userId = req.params.id;
        let updates = req.body;

        // Проверяем, что email в теле запроса соответствует пользователю с данным ID
        const userCheck = await User.findById(userId);
        if (!userCheck) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }
        if (updates.email && updates.email !== userCheck.email) {
            return res.status(403).json({ message: 'Нельзя обновлять данные другого пользователя' });
        }

        // Исключаем email из обновлений
        const { email, ...allowedUpdates } = updates;

        // Если пришло изображение, обрабатываем его через Cloudflare
        if (req.file) {
            const userDataWithFile = {
                ...allowedUpdates,
                photo: [req.file], // Передаем файл в массиве для совместимости
            };

            // Загружаем изображение в Cloudflare
            const [processedUserData] = await uploadImagesToCloudflare([userDataWithFile]);
            allowedUpdates.profilePhoto = processedUserData.profilePhoto; // Обновляем ссылку
        }

        // Обновляем данные пользователя в базе
        const user = await User.findByIdAndUpdate(
            userId,
            { $set: allowedUpdates },
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Ошибка при обновлении пользователя:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

module.exports = router;
