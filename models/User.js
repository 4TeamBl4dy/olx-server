const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            trim: true,
            required: false,
        },
        email: {
            type: String,
            required: [true, 'Email обязателен'],
            unique: true,
            trim: true,
            lowercase: true,
            match: [/^\S+@\S+\.\S+$/, 'Пожалуйста, введите корректный email'],
        },
        password: {
            type: String,
            required: [true, 'Пароль обязателен'],
            minlength: [6, 'Пароль должен быть не менее 6 символов'],
        },
        profilePhoto: {
            type: String,
            default: '',
            required: false,
        },
        phoneNumber: {
            type: String,
            trim: true,
            required: false,
            match: [/^\+?[1-9]\d{1,14}$/, 'Пожалуйста, введите корректный номер телефона'], // Опциональная валидация
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// Хеширование пароля перед сохранением
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Метод для проверки пароля
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
