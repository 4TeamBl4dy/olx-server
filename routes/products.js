const express = require('express');
const Product = require('../models/Product');
const User = require('../models/User');
const Balance = require('../models/payment/Balance');
const BalanceHistory = require('../models/payment/BalanceHistory');
const multer = require('multer');
const { uploadImagesToCloudflare } = require('../cloudflareHandler');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/role');
const BOOST_DAYS = 3;
const BOOST_COST = 500; // Стоимость поднятия объявления в тенге
// Настройка multer для обработки файлов (храним в памяти как буфер)
const upload = multer({ storage: multer.memoryStorage() });

// 1. Получить все продукты (сортировка от новых к старым)
router.get('/', async (req, res) => {
    try {
        const products = await Product.find({ status: 'approved' })
            .sort({ boostedUntil: -1, createdAt: -1 }) // сначала буст, потом новые
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
        const query = req.query;
        const filter = {};

        // Обрабатываем каждый параметр запроса
        Object.keys(query).forEach((key) => {
            // Если это не специальные поля (например, price, status и т.д.)
            if (!['price', 'status', 'creatorId'].includes(key)) {
                // Создаем регулярное выражение для частичного совпадения
                filter[key] = { $regex: query[key], $options: 'i' }; // 'i' для регистронезависимого поиска
            } else {
                // Для специальных полей используем точное совпадение
                filter[key] = query[key];
            }
        });

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
        const { creatorId } = req.body;
        if (!creatorId) {
            return res.status(400).json({ message: 'Поле creatorId обязательно' });
        }

        const productId = req.params.id;
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ message: 'Объявление не найдено' });
        }

        // Проверяем, является ли пользователь создателем объявления
        if (product.creatorId.toString() !== creatorId) {
            return res.status(403).json({ message: 'Доступ запрещён: вы не являетесь создателем объявления' });
        }

        // Начинаем транзакцию MongoDB
        const session = await BalanceHistory.startSession();
        session.startTransaction();

        try {
            // Находим баланс пользователя
            let balance = await Balance.findOne({
                user: creatorId,
                currency: 'KZT',
            }).session(session);

            if (!balance) {
                balance = await Balance.create(
                    [
                        {
                            user: creatorId,
                            currency: 'KZT',
                            balance: 0,
                        },
                    ],
                    { session }
                );
                balance = balance[0];
            }

            // Проверяем достаточность средств
            if (balance.balance < BOOST_COST * 100) {
                // Умножаем на 100, так как в БД хранится в тиын
                await session.abortTransaction();
                return res.status(400).json({ message: 'Недостаточно средств на балансе' });
            }

            // Создаем запись в истории баланса
            const balanceHistory = await BalanceHistory.create(
                [
                    {
                        user: creatorId,
                        type: 'payment',
                        amount: BOOST_COST * 100, // Умножаем на 100 для хранения в тиын
                        currency: 'KZT',
                        status: 'completed',
                        source: 'system',
                        source_id: `boost_${productId}_${Date.now()}`,
                        description: `Поднятие объявления "${product.title}"`,
                        metadata: {
                            productId: productId,
                            boostDays: BOOST_DAYS,
                        },
                        completed_at: new Date(),
                    },
                ],
                { session }
            );

            // Списываем средства
            balance.balance -= BOOST_COST * 100; // Умножаем на 100 для хранения в тиын
            await balance.save({ session });

            // Обновляем дату поднятия объявления
            const boostUntilDate = new Date(Date.now() + BOOST_DAYS * 24 * 60 * 60 * 1000);
            const updatedProduct = await Product.findByIdAndUpdate(
                productId,
                { boostedUntil: boostUntilDate },
                { new: true, session }
            );

            // Фиксируем транзакцию
            await session.commitTransaction();

            // Форматируем дату
            const formattedDate = boostUntilDate.toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            });

            res.status(200).json({
                message: `Объявление поднято до ${formattedDate}`,
                product: updatedProduct,
                balance: balance,
                payment: balanceHistory[0],
            });
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
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
            // Получаем все файлы для текущего продукта
            const productFiles = files.filter((f) => {
                // Проверяем оба формата: photo[] и photo[index]
                return f.fieldname === 'photo[]' || f.fieldname === `photo[${index}]`;
            });

            console.log(`Processing product ${index} with ${productFiles.length} files`); // Debug log

            return {
                ...item,
                photo: productFiles,
                creatorId: creatorId,
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

// 5. Обновить статус продукта на outdated
router.put('/:id/mark-outdated', async (req, res) => {
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

        // Меняем статус на outdated
        const updatedProduct = await Product.findByIdAndUpdate(req.params.id, { status: 'outdated' }, { new: true });

        res.status(200).json({
            message: 'Объявление помечено как устаревшее',
            product: updatedProduct,
        });
    } catch (error) {
        console.error('Ошибка при изменении статуса продукта:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Получить список продуктов на модерации
router.get('/products/pending', authenticateToken, authorizeRole('moderator', 'admin'), async (req, res) => {
    try {
        const pendingProducts = await Product.find({ status: 'pending_review' }).sort({ createdAt: -1 });
        res.json(pendingProducts);
    } catch (error) {
        console.error('Ошибка при получении объявлений на рассмотрении:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Одобрить продукт
router.put('/products/:id/approve', authenticateToken, authorizeRole('moderator', 'admin'), async (req, res) => {
    try {
        const productId = req.params.id;
        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            { status: 'approved', rejectionReason: '' },
            { new: true }
        );
        if (!updatedProduct) {
            return res.status(404).json({ message: 'Продукт не найден' });
        }
        res.json({ message: 'Продукт одобрен', product: updatedProduct });
    } catch (error) {
        console.error('Ошибка при одобрении продукта:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Отклонить продукт
router.put('/products/:id/reject', authenticateToken, authorizeRole('moderator', 'admin'), async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason || reason.trim() === '') {
            return res.status(400).json({ message: 'Укажите причину отклонения' });
        }

        const productId = req.params.id;
        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            { status: 'rejected', rejectionReason: reason },
            { new: true }
        );
        if (!updatedProduct) {
            return res.status(404).json({ message: 'Продукт не найден' });
        }
        res.json({ message: 'Продукт отклонён', product: updatedProduct });
    } catch (error) {
        console.error('Ошибка при отклонении продукта:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// 6. Вернуть актуальность объявления
router.put('/:id/restore', async (req, res) => {
    try {
        const { creatorId } = req.body;
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

        // Обновляем статус на approved и обновляем дату создания
        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            {
                status: 'approved',
                createdAt: new Date(), // Обновляем дату создания на текущую
            },
            { new: true }
        );

        res.status(200).json({
            message: 'Объявление восстановлено и помечено как актуальное',
            product: updatedProduct,
        });
    } catch (error) {
        console.error('Ошибка при восстановлении актуальности продукта:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Обновление информации о продукте
router.put('/:id', async (req, res) => {
    try {
        const { creatorId } = req.body;
        if (!creatorId) {
            return res.status(400).json({ message: 'Поле creatorId обязательно' });
        }

        const productId = req.params.id;
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ message: 'Продукт не найден' });
        }

        // Проверяем, является ли пользователь создателем продукта
        if (product.creatorId.toString() !== creatorId) {
            return res.status(403).json({ message: 'Доступ запрещён: вы не являетесь создателем продукта' });
        }

        // Создаем объект с полями для обновления
        const updateFields = {};

        // Проверяем каждое возможное поле и добавляем его в updateFields если оно присутствует в запросе
        const possibleFields = [
            'title',
            'category',
            'description',
            'dealType',
            'price',
            'isNegotiable',
            'condition',
            'address',
            'sellerName',
            'email',
            'phone',
        ];

        possibleFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                updateFields[field] = req.body[field];
            }
        });

        // Если нет полей для обновления
        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Нет данных для обновления' });
        }

        // Обновляем продукт
        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            { $set: updateFields },
            { new: true, runValidators: true }
        );

        res.status(200).json({
            message: 'Продукт успешно обновлен',
            product: updatedProduct,
        });
    } catch (error) {
        console.error('Ошибка при обновлении продукта:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Ошибка валидации данных', errors: error.errors });
        }
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

module.exports = router;
