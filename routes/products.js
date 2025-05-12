const express = require('express');
const Product = require('../models/Product');
const User = require('../models/User');
const multer = require('multer');
const { uploadImagesToCloudflare } = require('../cloudflareHandler');
const router = express.Router();
const BOOST_DAYS = 3;
// Настройка multer для обработки файлов (храним в памяти как буфер)
const upload = multer({ storage: multer.memoryStorage() });


// 1. Получить все продукты (сортировка от новых к старым)
router.get('/', async (req, res) => {
    try {
        const products = await Product.find()
            .sort({ createdAt: -1 }) // Сортировка: новые сначала
            .populate('creatorId', 'name email phoneNumber profilePhoto');

        res.status(200).json(products);
    } catch (error) {
        console.error('Ошибка при получении всех продуктов:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});


// 2. Поиск по любому фильтру
router.get('/search', async (req, res) => {
    try {
        const filter = req.query;
        const products = await Product.find(filter).populate('creatorId', 'name email phoneNumber profilePhoto');
        if (products.length === 0) {
            return res.status(404).json({ message: 'Продукты по заданным фильтрам не найдены' });
        }
        res.status(200).json(products);
    } catch (error) {
        console.error('Ошибка при поиске продуктов:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// 3. Поднять объявление на 3 дня
router.post('/:id/boost', async (req, res) => {
    try {
        const productId = req.params.id;

        const boostUntilDate = new Date(Date.now() + BOOST_DAYS * 24 * 60 * 60 * 1000);

        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            { boostedUntil: boostUntilDate },
            { new: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({ message: 'Объявление не найдено' });
        }

        res.status(200).json({
            message: `Объявление поднято до ${boostUntilDate.toISOString()}`,
            product: updatedProduct
        });
    } catch (error) {
        console.error('Ошибка при поднятии объявления:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// 4. Создать новый продукт
router.post('/', upload.any(), async (req, res) => {
    try {
        let productsToSave = req.body;

        // Парсим JSON, если он пришел как строка
        if (typeof productsToSave === 'string') {
            productsToSave = JSON.parse(productsToSave);
        }

        // Проверяем, является ли productsToSave массивом
        const isArray = Array.isArray(productsToSave);
        if (!isArray) {
            productsToSave = [productsToSave];
        }

        // Проверяем наличие creatorId в первом продукте (для простоты)
        const creatorId = productsToSave[0]?.creatorId;
        if (!creatorId) {
            return res.status(400).json({ message: 'Поле creatorId обязательно' });
        }

        // Проверяем существование пользователя
        const user = await User.findById(creatorId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Группируем файлы по индексу продукта и добавляем creatorId
        const files = req.files || [];
        const processedProducts = productsToSave.map((item, index) => {
            const productFiles = files.filter((f) => f.fieldname === `photo[${index}]` || f.fieldname === 'photo');
            return {
                ...item,
                photo: productFiles,
                creatorId: creatorId, // Устанавливаем creatorId от клиента
            };
        });

        // Обрабатываем изображения через Cloudflare
        const uploadedProducts = await uploadImagesToCloudflare(processedProducts);

        // Сохраняем продукты в базу данных
        const savedProducts = await Promise.all(
            uploadedProducts.map(async (productData) => {
                const newProduct = new Product({
                    ...productData,
                    photo: productData.photo || [],
                    creatorId: creatorId, // Устанавливаем creatorId
                });
                return await newProduct.save();
            })
        );

        // Формируем ответ
        const response = isArray ? savedProducts : savedProducts[0];
        res.status(201).json(response);
    } catch (error) {
        console.error('Ошибка при добавлении продукта:', error);
        res.status(400).json({ message: 'Ошибка в данных или на сервере' });
    }
});

// 5. Удалить продукт по ID
router.delete('/:id', async (req, res) => {
    try {
        const { creatorId } = req.body; // Получаем creatorId из тела запроса
        if (!creatorId) {
            return res.status(400).json({ message: 'Поле creatorId обязательно' });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Продукт не найден' });
        }

        // Проверяем, является ли пользователь создателем продукта
        if (product.creatorId.toString() !== creatorId) {
            return res.status(403).json({ message: 'Доступ запрещён: вы не являетесь создателем продукта' });
        }

        const deletedProduct = await Product.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Продукт удален', deletedProduct });
    } catch (error) {
        console.error('Ошибка при удалении продукта:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

module.exports = router;