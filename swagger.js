const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'API для OLX-сервера',
            version: '1.0.0',
            description: 'Документация API для управления категориями и продуктами',
        },
        servers: [
            {
                url: 'http://localhost:5000',  //port
            },
        ],
    },
    apis: ['./routes/*.js'], // routes
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
