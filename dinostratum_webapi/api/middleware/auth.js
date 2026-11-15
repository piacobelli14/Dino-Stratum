const jwt = require("jsonwebtoken");

if (!process.env.JWT_SECRET_KEY) {
  throw new Error("JWT_SECRET_KEY environment variable is not set.");
}

const secretKey = process.env.JWT_SECRET_KEY;

function authenticateToken(req, res, next) {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  jwt.verify(token, secretKey, { algorithms: ["HS256"] }, (error, decoded) => {
    if (error) {
      console.error("Token verification failed.", error);
      return res.status(401).json({ error: "Access denied. Invalid token." });
    } else {
      req.user = decoded;
      next();
    }
  });
}

module.exports = { authenticateToken };