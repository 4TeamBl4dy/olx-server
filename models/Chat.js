const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ChatSchema = new Schema({
  participant1Id: { // ID первого пользователя
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participant2Id: { // ID второго пользователя
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  productId: { // ID продукта, по которому был инициирован чат
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Добавляет поля createdAt и updatedAt
});

module.exports = mongoose.model('Chat', ChatSchema);