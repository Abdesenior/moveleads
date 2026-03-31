const responseTime = require('response-time');

function requestLogger(req, res, next) {
  const start = Date.now();
  const originalEnd = res.end;

  res.end = function(...args) {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent') || 'unknown'
    };

    const logLine = `[${new Date().toISOString()}] ${logData.method} ${logData.url} ${logData.status} ${logData.duration}`;

    if (res.statusCode >= 500) {
      console.error('\x1b[31m%s\x1b[0m', logLine);
    } else if (res.statusCode >= 400) {
      console.warn('\x1b[33m%s\x1b[0m', logLine);
    } else {
      console.log('\x1b[32m%s\x1b[0m', logLine);
    }

    originalEnd.apply(res, args);
  };

  next();
}

function responseTimeMiddleware() {
  return responseTime((req, res, time) => {
    if (req.metrics) {
      req.metrics.responseTime = Math.round(time);
    }
  });
}

module.exports = { requestLogger, responseTimeMiddleware };
