const express = require('express');
const router = express.Router();
const stripeRoutes = require('./stripe.routes');

// Mount Stripe routes
router.use('/stripe', stripeRoutes);

module.exports = router;
