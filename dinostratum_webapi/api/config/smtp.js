const nodemailer = require("nodemailer");

if (!process.env.SMTP_HOST) {
  throw new Error("The SMTP_HOST environment variable is required.");
}

if (!process.env.SMTP_PORT) {
  throw new Error("The SMTP_PORT environment variable is required.");
}

if (!process.env.SMTP_USER) {
  throw new Error("The SMTP_USER environment variable is required.");
}

if (!process.env.SMTP_PASSWORD) {
  throw new Error("The SMTP_PASSWORD environment variable is required.");
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    minVersion: "TLSv1.2"
  }
});

module.exports = { emailTransporter: transporter };