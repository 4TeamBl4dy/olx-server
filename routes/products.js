const express = require("express");
const Product = require("../models/Product");
const multer = require('multer');
const { uploadImagesToCloudflare } = require('../cloudflareHandler'); // Импорт функции для загрузки изображений в Cloudflare
const router = express.Router();

// Настройка multer для обработки файлов (храним в памяти как буфер)
const upload = multer({ storage: multer.memoryStorage() });

// 1. Получить все продукты
router.get("/", async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json(products);
  } catch (error) {
    console.error("Ошибка при получении всех продуктов:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
});

// 2. Поиск по любому фильтру  
router.get("/search", async (req, res) => {
  try {
    const filter = req.query; // Получаем все параметры из строки запроса
    const products = await Product.find(filter); // Ищем по переданным параметрам
    if (products.length === 0) {
      return res.status(404).json({ message: "Продукты по заданным фильтрам не найдены" });
    }
    res.status(200).json(products);
  } catch (error) {
    console.error("Ошибка при поиске продуктов:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
});

// 3. Создать новый продукт
router.post("/", upload.any(), async (req, res) => {
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

    // Группируем файлы по индексу продукта
    const files = req.files || [];
    const processedProducts = productsToSave.map((item, index) => {
      const productFiles = files.filter(f => f.fieldname === `photo[${index}]` || f.fieldname === 'photo');
      return {
        ...item,
        photo: productFiles,
      };
    });

    // Обрабатываем изображения через Cloudflare
    const uploadedProducts = await uploadImagesToCloudflare(processedProducts);

    // Сохраняем продукты в базу данных
    const savedProducts = await Promise.all(
      uploadedProducts.map(async (productData) => {
        const newProduct = new Product(productData);
        return await newProduct.save();
      })
    );

    // Формируем ответ
    const response = isArray ? savedProducts : savedProducts[0];
    res.status(201).json(response);
  } catch (error) {
    console.error("Ошибка при добавлении продукта:", error);
    res.status(400).json({ message: "Ошибка в данных или на сервере" });
  }
});

// 4. Удалить продукт по ID
router.delete("/:id", async (req, res) => {
  try {
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);
    if (!deletedProduct) {
      return res.status(404).json({ message: "Продукт не найден" });
    }
    res.status(200).json({ message: "Продукт удален", deletedProduct });
  } catch (error) {
    console.error("Ошибка при удалении продукта:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
});

module.exports = router;