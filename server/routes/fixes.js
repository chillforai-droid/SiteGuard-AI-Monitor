import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { requireApiKey } from '../middleware/auth.js';
import { GitManager } from '../services/gitManager.js';
import { AIAnalyzer } from '../services/aiAnalyzer.js';

const router = Router();
const scansFile = path.join(config.dataDir, 'scans.json');

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

// Approve and apply fix
router.post('/approve', requireApiKey, async (req, res) => {
  let repoDir = null;
  const aiAnalyzer = new AIAnalyzer(req.openRouterKey, req.openRouterModel);

  try {
    const { scanId, issueIndex } = req.body;

    // FIX: Validate inputs
    if (!scanId || typeof scanId !== 'string') {
      return res.status(400).json({ error: 'scanId is required' });
    }
    const idx = parseInt(issueIndex, 10);
    if (isNaN(idx) || idx < 0) {
      return res.status(400).json({ error: 'Valid issueIndex is required' });
    }

    const scans = await readJSON(scansFile);
    const scan = scans.find(s => s.id === scanId);
    if (!scan) return res.status(404).json({ error: 'Scan not found' });

    // FIX: Check if already fixed
    if (scan.fixed) {
      return res.status(409).json({ error: 'Fix already applied for this scan', prUrl: scan.prUrl });
    }

    const websites = await readJSON(path.join(config.dataDir, 'websites.json'));
    const website = websites.find(w => w.id === scan.websiteId);
    if (!website) return res.status(404).json({ error: 'Website not found' });

    // FIX: Validate GitHub config before proceeding
    const githubToken = website.githubToken || config.githubToken;
    if (!githubToken) {
      return res.status(400).json({ error: 'GitHub token not configured for this website' });
    }
    if (!website.githubRepo) {
      return res.status(400).json({ error: 'GitHub repository not configured for this website' });
    }

    const issue = scan.aiAnalysis?.criticalIssues?.[idx];
    if (!issue) return res.status(404).json({ error: `Issue at index ${idx} not found` });

    const gitManager = new GitManager(githubToken);

    // Generate fix code
    const fixResult = await aiAnalyzer.generateFixCode(issue, website);

    // Clone repo
    const cloned = await gitManager.cloneRepo(website.githubRepo);
    repoDir = cloned.dir;
    const git = cloned.git;

    // Create fix branch
    const branchName = `fix/ai-auto-${uuidv4().split('-')[0]}`;
    await gitManager.createFixBranch(git, branchName);

    // Apply patches
    const patches = scan.aiAnalysis?.patches || [];
    for (const patch of patches) {
      await gitManager.applyFix(repoDir, patch.file, patch.fix);
    }

    // Verify build — browser binary errors and env issues must NOT block the push.
    // Only real code errors (syntax, import errors) should block.
    const buildResult = await gitManager.verifyBuild(repoDir, website.buildCommand);

    if (!buildResult.success) {
      const envIssue = /ENOENT|not found|cannot find|no such file|EACCES|permission denied|ignore-scripts/i.test(
        (buildResult.error || '') + (buildResult.output || '')
      );
      if (!envIssue) {
        await gitManager.cleanup(repoDir);
        repoDir = null;
        return res.status(400).json({
          success: false,
          error: `Build error: ${buildResult.error || 'Unknown build failure'}`,
          buildResult
        });
      }
      console.warn('[fixes] Build env issue — treating as non-fatal, proceeding with push:', buildResult.error?.slice(0, 200));
    }

    // buildResult.warning means non-fatal (e.g. Playwright binary missing on server)
    const buildWarning = buildResult.warning || null;

    // Commit and push
    await gitManager.commitAndPush(
      git,
      `🤖 AI Auto-fix: ${issue.message}`,
      branchName
    );

    // Create PR
    const prUrl = await gitManager.createPullRequest(
      website.githubRepo,
      branchName,
      `[AI Fix] ${issue.type}: ${issue.message}`,
      `## Auto-generated fix\n\n**Issue:** ${issue.message}\n\n**AI Model:** ${fixResult.model}\n\n**Risk level:** ${patches[0]?.risk || 'unknown'}\n\n> ⚠️ Please review before merging.`
    );

    // Update scan status
    const scanIndex = scans.findIndex(s => s.id === scanId);
    scans[scanIndex].approved = true;
    scans[scanIndex].fixed = true;
    scans[scanIndex].fixBranch = branchName;
    scans[scanIndex].prUrl = prUrl;
    await writeJSON(scansFile, scans);

    await gitManager.cleanup(repoDir);
    repoDir = null;

    res.json({ success: true, branch: branchName, prUrl, buildResult, buildWarning });

  } catch (err) {
    // FIX: Always cleanup temp dir on error
    if (repoDir) {
      const { GitManager } = await import('../services/gitManager.js');
      await new GitManager('').cleanup(repoDir).catch(() => {});
    }
    res.status(500).json({ error: err.message });
  }
});

// Get diff for a fix
router.get('/diff/:scanId', async (req, res) => {
  try {
    const scans = await readJSON(scansFile);
    const scan = scans.find(s => s.id === req.params.scanId);

    if (!scan) return res.status(404).json({ error: 'Scan not found' });
    if (!scan.fixBranch) return res.status(404).json({ error: 'No fix branch found for this scan' });

    const websites = await readJSON(path.join(config.dataDir, 'websites.json'));
    const website = websites.find(w => w.id === scan.websiteId);
    if (!website) return res.status(404).json({ error: 'Website not found' });

    const githubToken = website.githubToken || config.githubToken;
    const gitManager = new GitManager(githubToken);
    const diff = await gitManager.getDiff(website.githubRepo, scan.fixBranch);

    res.json(diff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rollback fix
router.post('/rollback/:scanId', requireApiKey, async (req, res) => {
  try {
    const scans = await readJSON(scansFile);
    const scan = scans.find(s => s.id === req.params.scanId);

    if (!scan) return res.status(404).json({ error: 'Scan not found' });
    if (!scan.fixBranch) return res.status(404).json({ error: 'No fix to rollback' });

    const websites = await readJSON(path.join(config.dataDir, 'websites.json'));
    const website = websites.find(w => w.id === scan.websiteId);
    if (!website) return res.status(404).json({ error: 'Website not found' });

    const githubToken = website.githubToken || config.githubToken;
    const gitManager = new GitManager(githubToken);
    await gitManager.rollbackBranch(website.githubRepo, scan.fixBranch);

    // Update scan
    const scanIndex = scans.findIndex(s => s.id === req.params.scanId);
    scans[scanIndex].fixed = false;
    scans[scanIndex].fixBranch = null;
    scans[scanIndex].prUrl = null;
    await writeJSON(scansFile, scans);

    res.json({ success: true, message: 'Branch deleted and rollback successful' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
