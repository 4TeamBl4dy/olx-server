const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const User = require('../models/User');
const Balance = require('../models/payment/Balance');
const { uploadImagesToCloudflare } = require('../cloudflareHandler');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/role');
const upload = multer({ storage: multer.memoryStorage() });

// Проверка JWT_SECRET при запуске
if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET не определен в переменных окружения');
}

// Функция для создания баланса пользователя
async function createUserBalance(userId) {
    try {
        const existingBalance = await Balance.findOne({
            user: userId,
            currency: 'KZT',
        });

        if (!existingBalance) {
            await Balance.create({
                user: userId,
                currency: 'KZT',
                balance: 0,
            });
        }
    } catch (error) {
        console.error('Error creating user balance:', error);
    }
}

// Регистрация пользователя
router.post('/register', async (req, res) => {
    const { email, password, name, profilePhoto, phoneNumber, role } = req.body;

    try {
        // Проверка, существует ли пользователь
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
        }

        // Создание нового пользователя
        user = new User({
            email,
            password, 
            name: name || undefined,
            profilePhoto: profilePhoto || undefined,
            phoneNumber: phoneNumber || undefined,
            role: role === 'admin' ? 'admin' : undefined,
        });

        await user.save();

        // Создаем баланс для нового пользователя
        await createUserBalance(user._id);

        // Генерация JWT-токена
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

        res.status(201).json({
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                profilePhoto: user.profilePhoto,
                phoneNumber: user.phoneNumber,
                createdAt: user.createdAt,
                role: user.role,
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

        // Создаем баланс, если его нет
        await createUserBalance(user._id);

        // Генерация JWT-токена
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

        res.json({
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                profilePhoto: user.profilePhoto,
                phoneNumber: user.phoneNumber,
                createdAt: user.createdAt,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Server error in /login:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Получение данных пользователя по ID
router.get('/:id', authenticateToken, async (req, res) => {
    // Применяем middleware
    try {
        const userId = req.params.id;
        if (!userId || userId === 'undefined') {
            return res.status(400).json({ message: 'Некорректный ID пользователя' });
        }

        const user = await User.findById(userId).select('-password');
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
router.put('/:id', authenticateToken, upload.any(), async (req, res) => {
    // Применяем middleware и multer
    try {
        const userId = req.params.id;
        if (!userId || userId === 'undefined') {
            return res.status(400).json({ message: 'Некорректный ID пользователя' });
        }

        let userData = req.body;

        if (typeof userData === 'string') {
            userData = JSON.parse(userData);
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        const updates = {
            name: userData.name || user.name,
            phoneNumber: userData.phone || user.phoneNumber,
            photo: req.files?.filter((f) => f.fieldname.startsWith('photo[')) || [],
        };

        const [processedUser] = await uploadImagesToCloudflare([updates]);

        const updateFields = {
            name: processedUser.name,
            phoneNumber: processedUser.phoneNumber,
        };

        if (processedUser.photo && processedUser.photo.length > 0) {
            updateFields.profilePhoto = processedUser.photo[0];
        }

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

// Получить список всех пользователей (только админ)
router.get('/', authenticateToken, authorizeRole('admin'), async (req, res) => {
    try {
        const users = await User.find().select('-password'); // исключаем пароли
        res.status(200).json({ users });
    } catch (error) {
        console.error('Ошибка при получении пользователей:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Назначить пользователя модератором
router.put('/make-moderator/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

        user.role = 'moderator';
        await user.save();

        res.json({ message: 'Роль обновлена до moderator', user });
    } catch (error) {
        console.error('Ошибка при обновлении роли:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Снять роль модератора
router.put('/remove-moderator/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

        user.role = 'user';
        await user.save();

        res.json({ message: 'Роль обновлена до user', user });
    } catch (error) {
        console.error('Ошибка при обновлении роли:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

module.exports = router;
