const rateLimit = require("express-rate-limit");

const rateLimiter = (minutes = null, maxAttempts, handler = null) => {
  const options = {
    max: maxAttempts,
    message: (req) => {
      return `Rate limit exceeded for ${req.originalUrl}. Please try again in ${minutes} minutes.`;
    },
    standardHeaders: true,
    legacyHeaders: false
  };

  if (minutes !== null) {
    options.windowMs = minutes * 60 * 1000;
  }

  if (handler !== null) {
    options.handler = handler;
  }

  return rateLimit(options);
};

const authRateLimitExceededHandler = (req, res) => {
  res.status(429).json({
    error: true,
    message: "Rate limit exceeded for authentication. Please try again later."
  });
};

module.exports = { rateLimiter, authRateLimitExceededHandler };