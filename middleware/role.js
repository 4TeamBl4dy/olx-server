function authorizeRole(...allowedRoles) {
    return (req, res, next) => {
        if (req.user && allowedRoles.includes(req.user.role)) {
            next();
        } else {
            return res.status(403).json({ message: 'Недостаточно прав' });
        }
    };
}


module.exports = { authorizeRole };
