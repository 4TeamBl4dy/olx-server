require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const productRoutes = require("./routes/products");
const categoryRoutes = require("./routes/categories");

const app = express();
app.use(cors());
app.use(express.json());

// Подключение к MongoDB
mongoose.connect(process.env.MONGO_URI, {})

.then(() => console.log("Подключение к MongoDB установлено"))
.catch(err => console.error("Ошибка подключения к MongoDB:", err));

app.use("/categories", categoryRoutes);
app.use("/products", productRoutes);

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
