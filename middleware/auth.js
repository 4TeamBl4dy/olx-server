const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Требуется авторизация' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (!user) return res.status(401).json({ message: 'Пользователь не найден' });
        req.user = user;
        next();
    } catch (error) {
        console.error('Ошибка при проверке токена:', error);
        res.status(403).json({ message: 'Недействительный токен' });
    }
};

const isMainAdmin = async (req, res, next) => {
    if (!process.env.ADMIN_USER_ID) {
        return res.status(500).json({ message: 'MAIN_ADMIN_ID не настроен' });
    }

    if (req.user._id.toString() !== process.env.ADMIN_USER_ID) {
        return res.status(403).json({ message: 'Доступ запрещен. Требуются права главного администратора' });
    }
    next();
};

module.exports = { authenticateToken, isMainAdmin };
