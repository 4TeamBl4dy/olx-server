function authorizeRole(requiredRole) {
    return (req, res, next) => {
        if (req.user && req.user.role === requiredRole) {
            next();
        } else {
            return res.status(403).json({ message: 'Недостаточно прав' });
        }
    };
}

module.exports = { authorizeRole };
