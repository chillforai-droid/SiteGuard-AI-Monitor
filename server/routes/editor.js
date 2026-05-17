import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { requireApiKey } from '../middleware/auth.js';
import { GitManager } from '../services/gitManager.js';
import { CodeScanner } from '../services/codeScanner.js';
import axios from 'axios';

const router = Router();
const websitesFile = path.join(config.dataDir, 'websites.json');
const scansFile = path.join(config.dataDir, 'scans.json');

async function readJSON(filePath) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf-8')); }
  catch { return []; }
}
async function writeJSON(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// ── Anthropic Claude API ──────────────────────
async function callAnthropic(anthropicKey, systemPrompt, userPrompt) {
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    },
    {
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      timeout: 90000
    }
  );
  const block = response.data?.content?.[0];
  return block?.type === 'text' ? block.text : '';
}

// ── OpenRouter API ────────────────────────────
async function callOpenRouter(openRouterKey, model, systemPrompt, userPrompt) {
  const response = await axios.post(
    `${config.openRouterBaseUrl}/chat/completions`,
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 8000
    },
    {
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ai-website-monitor.app',
        'X-Title': 'AI Website Monitor'
      },
      timeout: 90000
    }
  );
  const choice = response.data?.choices?.[0];
  return choice?.message?.content ?? '';
}

// ── Try all AI providers with fallback ────────
// Priority: Anthropic > user-selected OpenRouter model > free models
async function callAIWithFallback(req, systemPrompt, userPrompt) {
  const anthropicKey = req.anthropicKey || config.anthropicApiKey;
  const openRouterKey = req.openRouterKey || config.openRouterApiKey;

  const attempts = [];

  if (anthropicKey) {
    attempts.push({ name: 'claude-3-5-haiku (Anthropic)', fn: () => callAnthropic(anthropicKey, systemPrompt, userPrompt) });
  }
  if (openRouterKey && req.openRouterModel) {
    attempts.push({ name: req.openRouterModel, fn: () => callOpenRouter(openRouterKey, req.openRouterModel, systemPrompt, userPrompt) });
  }
  if (openRouterKey) {
    for (const model of config.freeModels) {
      if (model === req.openRouterModel) continue;
      attempts.push({ name: model, fn: () => callOpenRouter(openRouterKey, model, systemPrompt, userPrompt) });
    }
  }

  if (attempts.length === 0) {
    throw new Error('No AI API key configured — Settings में Anthropic या OpenRouter key add करें');
  }

  let lastError = 'empty response';
  for (const attempt of attempts) {
    try {
      console.log(`[editor] Trying: ${attempt.name}`);
      const content = await attempt.fn();
      if (content && content.trim()) {
        console.log(`[editor] ✅ Success: ${attempt.name}`);
        return content;
      }
      lastError = `${attempt.name} returned empty content`;
      console.warn(`[editor] ⚠️ ${lastError}`);
    } catch (err) {
      lastError = `${attempt.name}: ${err.response?.data?.error?.message || err.message}`;
      console.warn(`[editor] ⚠️ ${lastError}`);
    }
  }

  throw new Error(`सभी AI providers fail हो गए। Last error: ${lastError}`);
}

// ──────────────────────────────────────────────
// 1. GITHUB CODE SCANNER
// POST /api/editor/scan-code/:websiteId
// ──────────────────────────────────────────────
router.post('/scan-code/:websiteId', requireApiKey, async (req, res) => {
  let repoDir = null;
  try {
    const websites = await readJSON(websitesFile);
    const website = websites.find(w => w.id === req.params.websiteId);
    if (!website) return res.status(404).json({ error: 'Website not found' });

    const githubToken = website.githubToken || config.githubToken;
    if (!githubToken) return res.status(400).json({ error: 'GitHub token not configured' });
    if (!website.githubRepo) return res.status(400).json({ error: 'GitHub repo not configured' });

    const gitManager = new GitManager(githubToken);
    const cloned = await gitManager.cloneRepo(website.githubRepo);
    repoDir = cloned.dir;

    const scanner = new CodeScanner();
    const results = await scanner.scanRepo(repoDir);

    await gitManager.cleanup(repoDir);
    repoDir = null;

    const scans = await readJSON(scansFile);
    const scanRecord = {
      id: uuidv4(),
      websiteId: website.id,
      type: 'code_scan',
      timestamp: new Date().toISOString(),
      codeAnalysis: results
    };
    scans.push(scanRecord);
    await writeJSON(scansFile, scans);

    res.json({ success: true, scanId: scanRecord.id, results });

  } catch (err) {
    if (repoDir) {
      const { GitManager } = await import('../services/gitManager.js');
      await new GitManager('').cleanup(repoDir).catch(() => {});
    }
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// 2. AI TEXT EDITOR
// POST /api/editor/ai-edit
// ──────────────────────────────────────────────
router.post('/ai-edit', requireApiKey, async (req, res) => {
  let repoDir = null;
  try {
    const { websiteId, instruction, targetFile } = req.body;

    if (!websiteId) return res.status(400).json({ error: 'websiteId is required' });
    if (!instruction || instruction.trim().length < 5) {
      return res.status(400).json({ error: 'instruction must be at least 5 characters' });
    }
    if (instruction.length > 1000) {
      return res.status(400).json({ error: 'Instruction too long (max 1000 chars).' });
    }

    const websites = await readJSON(websitesFile);
    const website = websites.find(w => w.id === websiteId);
    if (!website) return res.status(404).json({ error: 'Website not found' });

    const githubToken = website.githubToken || config.githubToken;
    if (!githubToken) return res.status(400).json({ error: 'GitHub token not configured' });
    if (!website.githubRepo) return res.status(400).json({ error: 'GitHub repo not configured' });

    const anthropicKey = req.anthropicKey || config.anthropicApiKey;
    const openRouterKey = req.openRouterKey || config.openRouterApiKey;
    if (!anthropicKey && !openRouterKey) {
      return res.status(400).json({ error: 'No AI API key — Settings में Anthropic API key या OpenRouter key add करें' });
    }

    // Step 1: Clone repo
    const gitManager = new GitManager(githubToken);
    const cloned = await gitManager.cloneRepo(website.githubRepo);
    repoDir = cloned.dir;
    const git = cloned.git;

    // Step 2: Read relevant files
    const filesToRead = [];
    if (targetFile) {
      const fp = path.resolve(repoDir, targetFile);
      if (fp.startsWith(path.resolve(repoDir))) {
        try {
          const content = await fs.readFile(fp, 'utf-8');
          filesToRead.push({ path: targetFile, content });
        } catch {}
      }
    } else {
      const candidates = [
        'index.html', 'public/index.html', 'src/index.html',
        'src/App.jsx', 'src/App.tsx', 'src/App.js',
        'src/main.jsx', 'src/main.tsx', 'src/index.js',
        'pages/index.js', 'pages/index.tsx', 'pages/_app.js',
        'app/page.tsx', 'app/page.js', 'app/layout.tsx',
        'src/index.css', 'src/App.css', 'styles/globals.css',
      ];
      for (const candidate of candidates) {
        const fp = path.join(repoDir, candidate);
        try {
          const content = await fs.readFile(fp, 'utf-8');
          filesToRead.push({ path: candidate, content });
        } catch {}
      }
    }

    if (filesToRead.length === 0) {
      await gitManager.cleanup(repoDir);
      repoDir = null;
      return res.status(400).json({ error: 'No editable files found. Try specifying targetFile.' });
    }

    // Step 3: Ask AI
    const filesContext = filesToRead.map(f =>
      `=== FILE: ${f.path} ===\n${f.content}\n`
    ).join('\n');

    const systemPrompt = 'You are an expert web developer. Always respond with valid JSON only. No markdown. No explanation outside JSON.';
    const userPrompt = `You are an expert web developer. The user wants to edit their website.

Website: ${website.url}
Framework: ${website.framework || 'Unknown'}

User Instruction: "${instruction}"

Here are the current files:
${filesContext}

Generate the COMPLETE updated file content for each file that needs to change.
Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{
  "explanation": "Brief explanation of what you changed",
  "changes": [
    {
      "file": "relative/path/to/file.jsx",
      "content": "COMPLETE new file content here",
      "changeDescription": "What specifically changed in this file"
    }
  ],
  "noChangesNeeded": false
}

If no changes are needed, set noChangesNeeded to true and changes to [].
Important: Always return COMPLETE file content, not just a diff.`;

    let rawResponse;
    try {
      rawResponse = await callAIWithFallback(req, systemPrompt, userPrompt);
    } catch (aiErr) {
      await gitManager.cleanup(repoDir);
      repoDir = null;
      return res.status(500).json({ error: aiErr.message });
    }

    // Step 4: Parse response
    let parsed;
    try {
      const cleaned = rawResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      await gitManager.cleanup(repoDir);
      repoDir = null;
      return res.status(500).json({
        error: 'AI response parse नहीं हुई — instruction दोबारा लिखें',
        raw: rawResponse.slice(0, 300)
      });
    }

    if (parsed.noChangesNeeded || !parsed.changes || parsed.changes.length === 0) {
      await gitManager.cleanup(repoDir);
      repoDir = null;
      return res.json({ success: true, noChanges: true, explanation: parsed.explanation });
    }

    // Step 5: Apply changes
    const branchName = `ai-edit/${uuidv4().split('-')[0]}`;
    await gitManager.createFixBranch(git, branchName);

    const appliedFiles = [];
    for (const change of parsed.changes) {
      if (!change.file || !change.content) continue;
      const fullPath = path.resolve(repoDir, change.file);
      if (!fullPath.startsWith(path.resolve(repoDir))) continue;
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, change.content, 'utf-8');
      appliedFiles.push({ file: change.file, description: change.changeDescription });
    }

    // Step 6: Build verify
    const buildResult = await gitManager.verifyBuild(repoDir, website.buildCommand);
    if (!buildResult.success) {
      const envIssue = /ENOENT|not found|cannot find|no such file|EACCES|permission denied/i.test(buildResult.error || '');
      if (!envIssue) {
        await gitManager.cleanup(repoDir);
        repoDir = null;
        return res.status(400).json({ success: false, error: `Build failed: ${buildResult.error}` });
      }
      console.warn('[editor] Build env issue — proceeding:', buildResult.error?.slice(0, 200));
    }

    // Step 7: Commit & push
    await gitManager.commitAndPush(git, `✏️ AI Edit: ${instruction.slice(0, 72)}`, branchName);

    // Step 8: Create PR
    const prUrl = await gitManager.createPullRequest(
      website.githubRepo,
      branchName,
      `[AI Edit] ${instruction.slice(0, 60)}`,
      `## AI-Generated Edit\n\n**Instruction:** ${instruction}\n\n**Changes:**\n${appliedFiles.map(f => `- \`${f.file}\`: ${f.description || 'updated'}`).join('\n')}\n\n**Explanation:** ${parsed.explanation}\n\n> ⚠️ Please review before merging.`
    );

    await gitManager.cleanup(repoDir);
    repoDir = null;

    const scans = await readJSON(scansFile);
    scans.push({
      id: uuidv4(),
      websiteId: website.id,
      type: 'ai_edit',
      timestamp: new Date().toISOString(),
      instruction,
      explanation: parsed.explanation,
      appliedFiles,
      branch: branchName,
      prUrl
    });
    await writeJSON(scansFile, scans);

    res.json({ success: true, explanation: parsed.explanation, appliedFiles, branch: branchName, prUrl });

  } catch (err) {
    if (repoDir) {
      const { GitManager } = await import('../services/gitManager.js');
      await new GitManager('').cleanup(repoDir).catch(() => {});
    }
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// 3. HISTORY
// GET /api/editor/history/:websiteId
// ──────────────────────────────────────────────
router.get('/history/:websiteId', async (req, res) => {
  try {
    const scans = await readJSON(scansFile);
    const edits = scans
      .filter(s => s.websiteId === req.params.websiteId && (s.type === 'ai_edit' || s.type === 'code_scan'))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 20);
    res.json(edits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
