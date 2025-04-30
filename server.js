require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const userRoutes = require('./routes/users')
const favoriteRoutes = require('./routes/favorites'); // Импортируем маршруты для избранного
const swaggerUi = require('swagger-ui-express'); // Добавляем Swagger UI
const swaggerSpec = require('./swagger'); // Подключаем конфигурацию Swagger
const ChatRoutes = require('./routes/chats'); // Импортируем маршруты для чатов
const MessageRoutes = require('./routes/messages'); // Импортируем маршруты для сообщений

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

mongoose.connect(process.env.MONGO_URI, {}).then(
    () => console.log('Подключение к MongoDB установлено'),
    (err) => console.error('Ошибка подключения к MongoDB:', err)
);

app.use('/users', userRoutes );
app.use('/categories', categoryRoutes);
app.use('/products', productRoutes);
app.use('/favorites', favoriteRoutes);
app.use('/chats', ChatRoutes); // Подключаем маршруты для чатов
app.use('/messages', MessageRoutes); // Подключаем маршруты для сообщений

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
