const jwt = require('jsonwebtoken');

// Middleware для проверки JWT
const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'Токен отсутствует' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Добавляем декодированную информацию о пользователе в объект запроса
    next(); // Передаем управление следующему middleware или обработчику маршрута
  } catch (error) {
    console.error('Ошибка верификации токена:', error);
    return res.status(403).json({ message: 'Недействительный токен' }); // 403 Forbidden - более подходящий статус, чем 401 для недействительного токена
  }
};

module.exports = { authenticateToken };