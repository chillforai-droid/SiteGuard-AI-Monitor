import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { requireApiKey } from '../middleware/auth.js';
import { ScanEngine } from '../services/scanEngine.js';
import { AIAnalyzer } from '../services/aiAnalyzer.js';

const router = Router();
const scansFile = path.join(config.dataDir, 'scans.json');
const websitesFile = path.join(config.dataDir, 'websites.json');

const scanEngine = new ScanEngine();

// Track in-progress scans
const activeScans = new Set();

async function readJSON(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeJSON(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// /all must come BEFORE /:websiteId
router.post('/all', requireApiKey, async (req, res) => {
  // Use user-provided OpenRouter key from request header
  const aiAnalyzer = new AIAnalyzer(req.openRouterKey, req.openRouterModel);

  try {
    const websites = await readJSON(websitesFile);
    if (websites.length === 0) {
      return res.json({ message: 'No websites to scan', results: [] });
    }

    const results = [];

    for (const website of websites) {
      if (activeScans.has(website.id)) {
        results.push({ websiteId: website.id, status: 'skipped', reason: 'Scan already in progress' });
        continue;
      }
      try {
        activeScans.add(website.id);
        const scanResults = await scanEngine.scanWebsite(website);
        const aiAnalysis = await aiAnalyzer.analyzeIssues(scanResults, website);

        const scans = await readJSON(scansFile);
        const newScan = {
          id: uuidv4(),
          websiteId: website.id,
          ...scanResults,
          aiAnalysis,
          approved: false,
          fixed: false
        };

        const trimmed = scans.filter(s => s.websiteId !== website.id).concat(
          [...scans.filter(s => s.websiteId === website.id), newScan]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 50)
        );
        await writeJSON(scansFile, trimmed);

        const allWebsites = await readJSON(websitesFile);
        const idx = allWebsites.findIndex(w => w.id === website.id);
        if (idx !== -1) {
          allWebsites[idx].lastScanned = newScan.timestamp;
          allWebsites[idx].issues = newScan.aiAnalysis?.criticalIssues || [];
          allWebsites[idx].status = allWebsites[idx].issues.length > 0 ? 'issues_found' : 'healthy';
          await writeJSON(websitesFile, allWebsites);
        }

        results.push({ websiteId: website.id, status: 'completed', scanId: newScan.id });
      } catch (err) {
        results.push({ websiteId: website.id, status: 'failed', error: err.message });
      } finally {
        activeScans.delete(website.id);
      }
    }

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:websiteId', requireApiKey, async (req, res) => {
  const aiAnalyzer = new AIAnalyzer(req.openRouterKey, req.openRouterModel);

  try {
    const websites = await readJSON(websitesFile);
    const website = websites.find(w => w.id === req.params.websiteId);

    if (!website) return res.status(404).json({ error: 'Website not found' });

    if (activeScans.has(website.id)) {
      return res.status(409).json({ error: 'Scan already in progress for this website' });
    }

    activeScans.add(website.id);

    try {
      const scanResults = await scanEngine.scanWebsite(website);
      const aiAnalysis = await aiAnalyzer.analyzeIssues(scanResults, website);

      const scans = await readJSON(scansFile);
      const newScan = {
        id: uuidv4(),
        websiteId: website.id,
        ...scanResults,
        aiAnalysis,
        approved: false,
        fixed: false
      };

      const trimmed = scans.filter(s => s.websiteId !== website.id).concat(
        [...scans.filter(s => s.websiteId === website.id), newScan]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 50)
      );
      await writeJSON(scansFile, trimmed);

      const allWebsites = await readJSON(websitesFile);
      const idx = allWebsites.findIndex(w => w.id === website.id);
      if (idx !== -1) {
        allWebsites[idx].lastScanned = newScan.timestamp;
        allWebsites[idx].issues = newScan.aiAnalysis?.criticalIssues || [];
        allWebsites[idx].status = allWebsites[idx].issues.length > 0 ? 'issues_found' : 'healthy';
        await writeJSON(websitesFile, allWebsites);
      }

      res.json(newScan);
    } finally {
      activeScans.delete(website.id);
    }
  } catch (err) {
    activeScans.delete(req.params.websiteId);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:websiteId', async (req, res) => {
  try {
    const scans = await readJSON(scansFile);
    const websiteScans = scans
      .filter(s => s.websiteId === req.params.websiteId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);

    res.json(websiteScans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
