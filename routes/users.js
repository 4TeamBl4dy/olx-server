const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Middleware для проверки токена
const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ message: "Токен отсутствует" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Недействительный токен" });
  }
};

// Регистрация пользователя
router.post("/register", async (req, res) => {
  const { email, password, name, profilePhoto, phoneNumber } = req.body;

  try {
    // Проверка, существует ли пользователь
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "Пользователь с таким email уже существует" });
    }

    // Создание нового пользователя
    user = new User({
      email,
      password, // Пароль будет автоматически хеширован в pre('save')
      name: name || undefined,
      profilePhoto: profilePhoto || undefined,
      phoneNumber: phoneNumber || undefined,
    });

    await user.save();
    console.log("User saved:", user); // Логируем для отладки

    // Проверка JWT_SECRET
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET не определен в переменных окружения");
    }

    // Генерация JWT-токена
    console.log("Generating token...");
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        profilePhoto: user.profilePhoto,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Server error:", error); // Логируем ошибку
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

// Вход пользователя
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Проверка, существует ли пользователь
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Неверный email или пароль" });
    }

    // Проверка пароля
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Неверный email или пароль" });
    }

    // Генерация JWT-токена
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        profilePhoto: user.profilePhoto,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

// Получение данных пользователя (защищённый маршрут)
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

module.exports = router;