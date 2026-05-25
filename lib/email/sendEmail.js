import nodemailer from 'nodemailer';

const transporterCache = new Map();

/**
 * Sends an email using the provided SMTP configuration
 * @param {Object} smtpConfig - SMTP configuration for the email provider
 * @param {Object} emailDetails - Details of the email to be sent
 * @returns {Promise<Object>} - Information about the sent email
 */
export async function sendEmail(smtpConfig, emailDetails) {
  const { to, subject, html, from, attachments = [] } = emailDetails;
  
  const cacheKey = `${smtpConfig.host}:${smtpConfig.port}:${smtpConfig.secure}:${smtpConfig.username}:${smtpConfig.password}`;
  let transporter = transporterCache.get(cacheKey);

  if (!transporter) {
    transporter = nodemailer.createTransport({
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
  }
  
  // Set default sender if not provided
  const sender = from || smtpConfig.username;
  
  // Send email
  const info = await transporter.sendMail({
    from: sender,
    to,
    subject,
    html,
    attachments,
  });
  
  return {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
  };
}

/**
 * Applies template data to an HTML template string
 * @param {String} template - HTML template with placeholders like {{variableName}}
 * @param {Object} data - Key-value pairs to inject into the template
 * @returns {String} - The processed HTML with replaced values
 */
export function applyTemplate(template, data = {}) {
  let html = template;
  
  // Replace all occurrences of {{variableName}} with corresponding values
  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    html = html.replace(regex, value || '');
  });
  
  return html;
}