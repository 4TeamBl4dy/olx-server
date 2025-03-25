const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema({
  photo: { type: String, required: true }, // фото категории
  title: { type: String, required: true }, // название категории
});

const Category = mongoose.model("Category", CategorySchema);

module.exports = Category;