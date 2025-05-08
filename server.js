require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http'); // Импортируем стандартный модуль http
const { Server } = require('socket.io'); // Импортируем Server из socket.io
const mongoose = require('mongoose');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const userRoutes = require('./routes/users');
const favoriteRoutes = require('./routes/favorites'); // Импортируем маршруты для избранного
const swaggerUi = require('swagger-ui-express'); // Добавляем Swagger UI
const swaggerSpec = require('./swagger'); // Подключаем конфигурацию Swagger
const ChatRoutes = require('./routes/chats'); // Импортируем маршруты для чатов
const MessageRoutes = require('./routes/messages'); // Импортируем маршруты для сообщений
const paymentRoutes = require('./routes/payment');

const app = express();

// Настройка CORS
app.use(cors());

// Важно: для webhook'ов Stripe нужно использовать raw body
app.use('/api/payment/stripe/webhook', express.raw({ type: 'application/json' }));

// Для всех остальных маршрутов используем JSON
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

mongoose.connect(process.env.MONGO_URI, {}).then(
    () => console.log('Подключение к MongoDB установлено'),
    (err) => console.error('Ошибка подключения к MongoDB:', err)
);

const server = http.createServer(app); // Создаем HTTP сервер на основе Express app
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
}); // Создаем Socket.IO сервер, привязанный к HTTP серверу

// --- Обработка WebSocket соединений ---
io.on('connection', (socket) => {
    console.log('Новый клиент подключился:', socket.id);

    // Слушаем событие 'joinChat' от клиента
    socket.on('joinChat', (chatId) => {
        console.log(`Клиент ${socket.id} присоединяется к чату ${chatId}`);
        socket.join(chatId); // Присоединяем сокет к комнате chatId
    });

    // Обработка отключения
    socket.on('disconnect', () => {
        console.log('Клиент отключился:', socket.id);
        // Socket.IO автоматически удаляет сокет из всех комнат при отключении
    });

    // Можно добавить обработку ошибок
    socket.on('error', (error) => {
        console.error('Socket Error:', error);
    });
});

app.use('/users', userRoutes);
app.use('/categories', categoryRoutes);
app.use('/products', productRoutes);
app.use('/favorites', favoriteRoutes);
app.use('/chats', ChatRoutes); // Подключаем маршруты для чатов
app.use('/messages', MessageRoutes(io)); // Подключаем маршруты для сообщений
app.use('/api/payment', paymentRoutes);

const PORT = process.env.PORT || 5050;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
