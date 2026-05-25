import nodemailer from 'nodemailer';

/**
 * Verifies SMTP configuration by attempting to establish a connection
 * @param {Object} config - SMTP configuration object
 * @param {string} config.host - SMTP host
 * @param {string|number} config.port - SMTP port
 * @param {boolean} config.secure - Whether to use SSL/TLS
 * @param {string} config.username - SMTP username
 * @param {string} config.password - SMTP password
 * @returns {Promise<{success: boolean, error?: string}>} Verification result
 */
export async function verifySmtpConfig(config) {
  try {
    const { host, port, secure, username, password } = config;

    // Create a test transporter
    const testTransporter = nodemailer.createTransport({
      host,
      port: parseInt(port),
      secure: secure === true || secure === 'true',
      auth: {
        user: username,
        pass: password,
      },
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,   // 10 seconds
      socketTimeout: 15000,     // 15 seconds
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
      },
    });

    // Verify SMTP configuration
    await testTransporter.verify();
    
    // Close the connection
    testTransporter.close();

    return {
      success: true,
    };
  } catch (error) {
    console.error('SMTP verification failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
} 