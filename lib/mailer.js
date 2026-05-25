import nodemailer from 'nodemailer';

const transporterCache = new Map();

export async function createTransporter(smtpConfig) {
  const cacheKey = `${smtpConfig.host}:${smtpConfig.port}:${smtpConfig.secure}:${smtpConfig.username}:${smtpConfig.password}`;
  if (transporterCache.has(cacheKey)) {
    return transporterCache.get(cacheKey);
  }

  const transporter = nodemailer.createTransport({
    pool: true,
    host: smtpConfig.host,
    port: parseInt(smtpConfig.port),
    secure: smtpConfig.secure === true || smtpConfig.secure === 'true',
    auth: {
      user: smtpConfig.username,
      pass: smtpConfig.password,
    },
    maxConnections: 3,
    maxMessages: 100,
    rateDelta: 2000,
    rateLimit: 1,
    connectionTimeout: 15000, // 15 seconds
    greetingTimeout: 15000,   // 15 seconds
    socketTimeout: 30000,     // 30 seconds
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
    },
  });

  transporterCache.set(cacheKey, transporter);
  return transporter;
}

export async function sendEmail(transporter, mailOptions) {
  try {
    const info = await transporter.sendMail(mailOptions);
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.log('error sending email :', error);
    return {
      success: false,
      error: error.message,
    };
  }
} 