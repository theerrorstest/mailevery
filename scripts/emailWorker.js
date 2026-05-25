// This script runs the email worker process for Render deployment
require("dotenv").config();
const mongoose = require("mongoose");
const { Worker } = require("bullmq");
const nodemailer = require("nodemailer");

// Ensure environment variables
if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI environment variable is required");
  process.exit(1);
}

if (!process.env.REDIS_HOST) {
  console.error("REDIS_HOST environment variable is required");
  process.exit(1);
}

// Redis connection
const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    // Retry with increasing delay, up to 30 seconds
    const delay = Math.min(times * 1000, 30000);
    console.log(`Redis reconnect attempt #${times}, retrying in ${delay}ms`);
    return delay;
  },
};

// MongoDB connection
// mongoose
//   .connect(process.env.MONGODB_URI)
//   .then(() => console.log("MongoDB connected"))
//   .catch((err) => {
//     console.error("MongoDB connection error:", err);
//     process.exit(1);
//   });

// MongoDB connection URI and options
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/errors-mail';
const mongoOptions = {};

// Resilient MongoDB connection with retry
async function connectWithRetry() {
  try {
    await mongoose.connect(mongoURI, mongoOptions);
    console.log("MongoDB connected successfully.");
  } catch (err) {
    console.error("MongoDB connection failed. Retrying in 5 seconds...", err);
    setTimeout(connectWithRetry, 5000);
  }
}

// Listen for MongoDB connection events to auto-reconnect
mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected. Attempting to reconnect...");
  connectWithRetry();
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
  // No exit here; connection retry will happen on disconnect event
});

// Start initial connection
connectWithRetry();

// Define Models directly here to avoid ES module import issues
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
  },
  name: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
  },
  apiKey: {
    type: String,
    required: true,
    unique: true,
  },
  smtp: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SmtpConfig',
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

const smtpConfigSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  host: {
    type: String,
    required: true,
  },
  port: {
    type: Number,
    required: true,
  },
  secure: {
    type: Boolean,
    default: true,
  },
  username: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  provider: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,
});

const emailLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    to: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmailTemplate",
      default: null,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContactGroup",
      default: null,
    },
    type: {
      type: String,
      enum: ["static", "dynamic"],
      default: "static",
    },
    status: {
      type: String,
      enum: ["success", "failed"],
      required: true,
    },
    error: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const emailTemplateSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  body: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['static', 'dynamic'],
    default: 'static',
  },
}, {
  timestamps: true,
});

const contactGroupSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  emails: [{
    type: String,
    required: true,
    trim: true,
    lowercase: true
  }]
}, {
  timestamps: true
});

// Create models
const User = mongoose.model('User', userSchema);
const SmtpConfig = mongoose.model('SmtpConfig', smtpConfigSchema);
const EmailLog = mongoose.model('EmailLog', emailLogSchema);
const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);
const ContactGroup = mongoose.model('ContactGroup', contactGroupSchema);

const transporterCache = new Map();

// Define sendEmail function directly here instead of importing
async function sendEmail(smtpConfig, emailDetails) {
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

// Set concurrency from environment or default to 1
const concurrency = parseInt(process.env.WORKER_CONCURRENCY || "1");
console.log(`Starting email worker with concurrency: ${concurrency}`);

// Create worker
const worker = new Worker(
  "email-queue",
  async (job) => {
    const { userId, to, subject, html,group=null, type = "direct" } = job.data;

    try {
      // Get the user and their SMTP config
      const user = await User.findById(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      // Get SMTP config
      const smtpConfig = await SmtpConfig.findById(user.smtp);
      if (!smtpConfig) {
        throw new Error(`SMTP configuration not found for user: ${userId}`);
      }

      // Send the email
      const result = await sendEmail(smtpConfig, {
        to,
        subject,
        html,
      });

      // Log successful email
      await EmailLog.create({
        user: userId,
        to,
        subject,
        body: html,
        type,
        group,
        status: "success",
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      // Log failed email
      await EmailLog.create({
        user: userId,
        to,
        subject,
        body: html,
        type,
        group,
        status: "failed",
        error: error.message || "Unknown error",
      });

      // Rethrow to trigger job failure
      throw error;
    }
  },
  {
    connection,
    concurrency: concurrency,
  }
);

// Handle job completion
worker.on("completed", (job, result) => {
  console.log(`Job ${job.id} completed with result:`, result);
});

// Handle job failures
worker.on("failed", (job, error) => {
  console.error(`Job ${job.id} failed with error:`, error);
});

console.log("Email worker started, processing jobs from email-queue...");

// Handle process termination
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing worker and connections...");
  await worker.close();
  await mongoose.disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, closing worker and connections...");
  await worker.close();
  await mongoose.disconnect();
  process.exit(0);
});

// Optional: health check for MongoDB connection every 10 seconds
setInterval(() => {
  if (mongoose.connection.readyState !== 1) { // 1 = connected
    console.warn(`MongoDB connection state is ${mongoose.connection.readyState}, reconnecting...`);
    connectWithRetry();
  }
}, 10000);