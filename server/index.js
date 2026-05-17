import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import websitesRouter from './routes/websites.js';
import scansRouter from './routes/scans.js';
import fixesRouter from './routes/fixes.js';
import editorRouter from './routes/editor.js';
import { attachUserKeys } from './middleware/auth.js';
import fs from 'fs/promises';
import path from 'path';

const app = express();

// CORS — allow Texly domain + any other allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : null;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // If ALLOWED_ORIGINS is set, check against it; otherwise allow all
    if (!allowedOrigins) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'x-openrouter-key', 'x-openrouter-model', 'x-github-token'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// Serve built frontend
app.use(express.static('client/dist'));

// Rate limiting (simple in-memory)
const requestCounts = new Map();
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 60;

  const record = requestCounts.get(ip) || { count: 0, start: now };
  if (now - record.start > windowMs) {
    record.count = 0;
    record.start = now;
  }
  record.count++;
  requestCounts.set(ip, record);

  if (record.count > maxRequests) {
    return res.status(429).json({ error: 'Too many requests — please slow down' });
  }
  next();
});

// Attach user-provided keys from headers to every request
app.use(attachUserKeys);

// Initialize data directory and files
async function initDataDir() {
  try {
    await fs.mkdir(config.dataDir, { recursive: true });
    const websitesPath = path.join(config.dataDir, 'websites.json');
    const scansPath = path.join(config.dataDir, 'scans.json');

    try { await fs.access(websitesPath); }
    catch { await fs.writeFile(websitesPath, '[]'); }

    try { await fs.access(scansPath); }
    catch { await fs.writeFile(scansPath, '[]'); }

  } catch (err) {
    console.error('Failed to init data dir:', err);
    process.exit(1);
  }
}

// Scheduled scanning every hour
function startScheduler() {
  const intervalMs = 60 * 60 * 1000;
  console.log('⏰ Scheduled scanner started — runs every hour');

  setInterval(async () => {
    try {
      console.log('⏰ Running scheduled scan for all websites...');
      const response = await fetch(`http://localhost:${config.port}/api/scans/all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.monitorApiKey || 'internal-scheduler'
        }
      });
      if (response.ok) {
        const result = await response.json();
        console.log(`⏰ Scheduled scan complete:`, result.results?.length, 'websites processed');
      }
    } catch (err) {
      console.error('Scheduled scan failed:', err.message);
    }
  }, intervalMs);
}

// Routes
app.use('/api/websites', websitesRouter);
app.use('/api/scans', scansRouter);
app.use('/api/fixes', fixesRouter);
app.use('/api/editor', editorRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.resolve('client/dist/index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await initDataDir();

  app.listen(config.port, () => {
    console.log(`🚀 AI Monitor running on port ${config.port}`);
    console.log('ℹ️  Users provide their own OpenRouter API key and GitHub token via Settings UI');
  });

  if (process.env.NODE_ENV !== 'test') {
    startScheduler();
  }
}

start();
