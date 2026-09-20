import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

console.log('Verifying SMTP configuration for:', process.env.SMTP_USER);

transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP Connection Failed:', error);
    process.exit(1);
  } else {
    console.log('SMTP Server is ready to take our messages:', success);
    process.exit(0);
  }
});
