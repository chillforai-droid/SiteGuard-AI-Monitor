import { config } from '../config.js';

// API key auth — key comes from user's browser (set in Settings UI)
// The key is stored in localStorage and sent as x-api-key header
export function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  // If server has a MONITOR_API_KEY env, enforce it
  if (config.monitorApiKey) {
    if (!apiKey || apiKey !== config.monitorApiKey) {
      return res.status(401).json({ error: 'Unauthorized — invalid or missing API key' });
    }
    return next();
  }

  // No server-side key configured — user-provided key stored on client
  // We just require *some* key to be present (prevents open abuse)
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required — set it in Settings' });
  }

  next();
}

// Attach user-provided AI keys and model from request headers to req object
export function attachUserKeys(req, res, next) {
  // x-anthropic-key: user's Anthropic API key (primary, most reliable)
  req.anthropicKey = req.headers['x-anthropic-key'] || config.anthropicApiKey || '';
  // x-openrouter-key: user's OpenRouter API key from browser localStorage
  req.openRouterKey = req.headers['x-openrouter-key'] || config.openRouterApiKey || '';
  // x-openrouter-model: user's selected model from Settings UI
  req.openRouterModel = req.headers['x-openrouter-model'] || '';
  next();
}

// SSRF prevention — block internal/private network addresses
export function validateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    const blocklist = [
      /^localhost$/,
      /^0\.0\.0\.0$/,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^::1$/,
      /^fc00:/,
      /^fe80:/
    ];
    if (blocklist.some(r => r.test(hostname))) return false;
    return true;
  } catch {
    return false;
  }
}
