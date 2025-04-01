require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const userRoutes = require('./routes/users')
const swaggerUi = require('swagger-ui-express'); // Добавляем Swagger UI
const swaggerSpec = require('./swagger'); // Подключаем конфигурацию Swagger

const app = express();

app.use(cors());
app.use(express.json());

// Подключаем Swagger UI по пути /api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

mongoose.connect(process.env.MONGO_URI, {}).then(
    () => console.log('Подключение к MongoDB установлено'),
    (err) => console.error('Ошибка подключения к MongoDB:', err)
);

app.use('/users', userRoutes );
app.use('/categories', categoryRoutes);
app.use('/products', productRoutes);

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
