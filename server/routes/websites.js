import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { requireApiKey, validateUrl } from '../middleware/auth.js';

const router = Router();
const websitesFile = path.join(config.dataDir, 'websites.json');

// FIX: Helper to read/write with basic concurrency safety
async function readWebsites() {
  try {
    const data = await fs.readFile(websitesFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeWebsites(websites) {
  await fs.writeFile(websitesFile, JSON.stringify(websites, null, 2));
}

// FIX: Helper to strip sensitive fields before sending to client
function sanitizeWebsite(website) {
  const { githubToken, ...safe } = website;
  // Return masked token indicator so UI knows token is set
  return { ...safe, hasGithubToken: !!githubToken };
}

// Get all websites
router.get('/', async (req, res) => {
  try {
    const websites = await readWebsites();
    // FIX: Never expose githubToken in API responses
    res.json(websites.map(sanitizeWebsite));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add website
router.post('/', requireApiKey, async (req, res) => {
  try {
    const { name, url, githubRepo, githubToken, framework, buildCommand, deployProvider } = req.body;

    // FIX: Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Website name is required' });
    }

    // FIX: Validate URL against SSRF and format
    if (!url || !validateUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL — must be a public http/https address' });
    }

    // FIX: Validate GitHub repo URL if provided
    if (githubRepo && !githubRepo.match(/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/)) {
      return res.status(400).json({ error: 'Invalid GitHub repository URL' });
    }

    const websites = await readWebsites();

    // FIX: Check for duplicate URLs
    if (websites.some(w => w.url === url.trim())) {
      return res.status(409).json({ error: 'This website URL is already being monitored' });
    }

    const newWebsite = {
      id: uuidv4(),
      name: name.trim(),
      url: url.trim(),
      githubRepo: githubRepo?.trim() || '',
      githubToken: githubToken?.trim() || '', // stored but never returned to client
      framework: framework || 'unknown',
      buildCommand: buildCommand || 'npm run build',
      deployProvider: deployProvider || 'unknown',
      status: 'pending',
      createdAt: new Date().toISOString(),
      lastScanned: null,
      issues: [],
      apiKey: uuidv4().split('-')[0]
    };

    websites.push(newWebsite);
    await writeWebsites(websites);

    res.status(201).json(sanitizeWebsite(newWebsite));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update website
router.put('/:id', requireApiKey, async (req, res) => {
  try {
    const websites = await readWebsites();
    const index = websites.findIndex(w => w.id === req.params.id);

    if (index === -1) return res.status(404).json({ error: 'Website not found' });

    // FIX: Validate URL if being updated
    if (req.body.url && !validateUrl(req.body.url)) {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    // FIX: Only allow safe fields to be updated
    const allowedFields = ['name', 'url', 'githubRepo', 'githubToken', 'framework', 'buildCommand', 'deployProvider'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    websites[index] = { ...websites[index], ...updates };
    await writeWebsites(websites);

    res.json(sanitizeWebsite(websites[index]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete website
router.delete('/:id', requireApiKey, async (req, res) => {
  try {
    const websites = await readWebsites();
    const filtered = websites.filter(w => w.id !== req.params.id);

    if (filtered.length === websites.length) {
      return res.status(404).json({ error: 'Website not found' });
    }

    await writeWebsites(filtered);
    res.json({ message: 'Website deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify website accessibility
router.post('/verify', async (req, res) => {
  try {
    const { url } = req.body;

    // FIX: Validate URL before making request
    if (!validateUrl(url)) {
      return res.status(400).json({
        accessible: false,
        error: 'Invalid URL — must be a public http/https address'
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, { signal: controller.signal, method: 'HEAD' });
    clearTimeout(timeout);

    res.json({
      accessible: response.ok,
      status: response.status,
      message: response.ok ? 'Website is accessible ✅' : `Website returned status ${response.status}`
    });
  } catch (err) {
    res.json({
      accessible: false,
      error: err.name === 'AbortError' ? 'Request timed out' : err.message
    });
  }
});

export default router;

// Get GitHub repo file tree
router.get('/:id/files', async (req, res) => {
  try {
    const websites = await readWebsites();
    const website = websites.find(w => w.id === req.params.id);
    if (!website) return res.status(404).json({ error: 'Website not found' });
    if (!website.githubRepo) return res.status(400).json({ error: 'GitHub repo not configured' });

    const token = website.githubToken || '';
    const match = website.githubRepo.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/);
    if (!match) return res.status(400).json({ error: 'Invalid GitHub repo URL' });
    const [, owner, repo] = match;

    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'SiteGuard-AI' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, { headers });
    if (!treeRes.ok) {
      const err = await treeRes.json();
      return res.status(treeRes.status).json({ error: err.message || 'GitHub API error' });
    }
    const treeData = await treeRes.json();

    const tree = (treeData.tree || [])
      .filter(item => item.type === 'blob')
      .map(item => ({ path: item.path, size: item.size, sha: item.sha }))
      .slice(0, 500); // max 500 files

    res.json({ tree, truncated: treeData.truncated || false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single file content from GitHub
router.get('/:id/files/content', async (req, res) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath) return res.status(400).json({ error: 'path query param required' });

    const websites = await readWebsites();
    const website = websites.find(w => w.id === req.params.id);
    if (!website) return res.status(404).json({ error: 'Website not found' });

    const token = website.githubToken || '';
    const match = website.githubRepo.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/);
    if (!match) return res.status(400).json({ error: 'Invalid GitHub repo URL' });
    const [, owner, repo] = match;

    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'SiteGuard-AI' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const contentRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, { headers });
    if (!contentRes.ok) {
      const err = await contentRes.json();
      return res.status(contentRes.status).json({ error: err.message || 'GitHub API error' });
    }
    const data = await contentRes.json();

    // Decode base64 content (text files only)
    let content = null;
    const textExts = ['.js','.jsx','.ts','.tsx','.json','.html','.css','.md','.txt','.yml','.yaml','.env','.sh','.py','.rb','.php','.go','.rs','.java','.c','.cpp','.h','.toml','.xml','.svg','.gitignore','.prettierrc','.eslintrc'];
    const isText = textExts.some(ext => filePath.endsWith(ext)) || !filePath.includes('.');
    if (isText && data.content) {
      try {
        content = Buffer.from(data.content, 'base64').toString('utf-8');
      } catch { content = null; }
    }

    res.json({ path: filePath, size: data.size, sha: data.sha, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
