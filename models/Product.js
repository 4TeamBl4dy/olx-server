const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema({
  photo: { type: [String] }, //фото товара
  title: { type: String, required: true }, //заголовок объявы 
  category: { type: String, required: true }, //категория товара
  description: { type: String }, //описание товара
  dealType: { type: String, required: true }, //тип сделки
  price: { type: Number }, //цена товара
  isNegotiable: { type: Boolean, default: false }, //возможен торг
  condition: { type: String, required: true },  //состояние товара
  address: { type: String, required: true },  //адрес
  sellerName: { type: String, required: true }, //имя продавца 
  email: { type: String }, //email продавца
  phone: { type: String } //телефон продавца
}, { timestamps: true });

const Product = mongoose.model("Product", ProductSchema);

module.exports = Product;
