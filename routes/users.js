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
    try {
        const userId = req.params.id;
        if (!userId || userId === 'undefined') {
            return res.status(400).json({ message: 'Некорректный ID пользователя' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        let clientData = req.body;

        // Если данные приходят в поле 'data' как JSON строка (часто с multipart/form-data)
        if (req.body.data && typeof req.body.data === 'string') {
            try {
                clientData = JSON.parse(req.body.data);
            } catch (parseError) {
                console.error('Ошибка парсинга JSON из req.body.data:', parseError);
                return res.status(400).json({ message: 'Некорректный формат данных JSON в поле data' });
            }
        } else if (typeof req.body === 'string') { // Реже, но возможно, если весь body - строка
             try {
                clientData = JSON.parse(req.body);
            } catch (parseError) {
                console.error('Ошибка парсинга JSON из req.body:', parseError);
                return res.status(400).json({ message: 'Некорректный формат данных JSON в теле запроса' });
            }
        }
        // Если Content-Type: application/json, req.body уже будет объектом

        const fieldsToUpdate = {};

        // Обновляем только те поля, которые были переданы
        if (clientData.hasOwnProperty('name')) {
            fieldsToUpdate.name = clientData.name;
        }
        if (clientData.hasOwnProperty('phone')) { // Клиент отправляет 'phone'
            fieldsToUpdate.phoneNumber = clientData.phone; // В модели 'phoneNumber'
        }
        if (clientData.hasOwnProperty('gender')) {
            // Позволяем установить null или пустую строку, если это намеренно
            fieldsToUpdate.gender = clientData.gender;
        }
        
        // Обработка загрузки фото
        // Предполагаем, что клиент отправляет фото под именем 'profilePhoto'
        const photoFiles = req.files?.filter((f) => f.fieldname === 'profilePhoto'); // или f.fieldname.startsWith('photo') если может быть несколько

        if (photoFiles && photoFiles.length > 0) {
            // Ваш `uploadImagesToCloudflare` ожидает массив объектов.
            // Создадим объект только с фото для передачи в функцию.
            const payloadForUploader = [{
                // Если uploadImagesToCloudflare использует другие поля из этого объекта для контекста,
                // вы можете добавить их сюда, например, user.id или что-то еще.
                // Но для простоты, предположим, ему достаточно файлов.
                photo: photoFiles, // передаем массив файлов
            }];

            try {
                const [processedResult] = await uploadImagesToCloudflare(payloadForUploader);
                if (processedResult && processedResult.photo && processedResult.photo.length > 0) {
                    // Предполагаем, что processedResult.photo[0] теперь содержит URL
                    fieldsToUpdate.profilePhoto = processedResult.photo[0];
                } else if (processedResult && typeof processedResult.photo === 'string') {
                    // Если вдруг функция возвращает строку напрямую для одного фото
                    fieldsToUpdate.profilePhoto = processedResult.photo;
                }
            } catch (uploadError) {
                console.error('Ошибка при загрузке фото в Cloudflare:', uploadError);
                // Решите, хотите ли вы прервать обновление или продолжить без фото
                return res.status(500).json({ message: 'Ошибка при загрузке изображения' });
            }
        }

        // Если нечего обновлять (например, пришел пустой объект или только файлы, которые не удалось загрузить)
        if (Object.keys(fieldsToUpdate).length === 0) {
            return res.status(400).json({ message: 'Нет данных для обновления' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: fieldsToUpdate },
            { new: true, runValidators: true } // runValidators важен для enum, minlength и т.д.
        ).select('-password'); // Исключаем пароль из ответа

        if (!updatedUser) {
            // Эта ситуация маловероятна, если findById выше нашел пользователя,
            // но для полноты картины
            return res.status(404).json({ message: 'Пользователь не найден при обновлении' });
        }

        res.status(200).json({ user: updatedUser });

    } catch (error) {
        console.error('Ошибка при обновлении пользователя:', error);
        // Более общая ошибка, если не была поймана специфическая
        if (!res.headersSent) { // Проверяем, не был ли уже отправлен ответ
            if (error.name === 'ValidationError') {
                return res.status(400).json({ message: 'Ошибка валидации данных', errors: error.errors });
            }
            res.status(500).json({ message: 'Внутренняя ошибка сервера при обновлении пользователя' });
        }
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
