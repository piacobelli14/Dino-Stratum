const nodemailer = require("nodemailer");

if (!process.env.SMTP_HOST) {
  throw new Error("SMTP_HOST environment variable is not set.");
}

if (!process.env.SMTP_PORT) {
  throw new Error("SMTP_PORT environment variable is not set.");
}

if (!process.env.SMTP_USER) {
  throw new Error("SMTP_USER environment variable is not set.");
}

if (!process.env.SMTP_PASSWORD) {
  throw new Error("SMTP_PASSWORD environment variable is not set.");
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    minVersion: "TLSv1.2",
  },
});

module.exports = { emailTransporter: transporter };