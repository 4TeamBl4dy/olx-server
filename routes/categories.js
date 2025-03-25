const express = require("express");
const Category = require("../models/Category"); 

const router = express.Router();

// 1. Добавление новой категории
router.post("/", async (req, res) => {
  try {
    const { photo, title } = req.body;

    // Проверяем, что обязательное поле title присутствует
    if (!title ) {
      return res.status(400).json({ message: "Название категории обязательно" });
    }

    const newCategory = new Category({
      photo,  
      title,  
    });

    const savedCategory = await newCategory.save();
    res.status(201).json(savedCategory); // Возвращаем созданную категорию
  } catch (error) {
    console.error("Ошибка при добавлении категории:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
});

// 2. Получение списка всех категорий
router.get("/", async (req, res) => {
  try {
    const categories = await Category.find(); // Получаем все категории
    res.status(200).json(categories); // Возвращаем список категорий
  } catch (error) {
    console.error("Ошибка при получении категорий:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
});

module.exports = router;