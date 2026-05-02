const sanitizeBody = (req, res, next) => { if (Buffer.isBuffer(req.body)) { return next(); } next(); }; module.exports = sanitizeBody;
