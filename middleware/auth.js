const jwt = require('jsonwebtoken');
const User = require('../models/User').User;

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

module.exports = { authenticateToken };
