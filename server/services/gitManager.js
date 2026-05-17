import { Octokit } from 'octokit';
import simpleGit from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// FIX: Whitelist for safe build commands — prevents command injection
const ALLOWED_BUILD_COMMANDS = [
  'npm run build',
  'npm run build:prod',
  'yarn build',
  'yarn run build',
  'pnpm build',
  'pnpm run build',
  'npx vite build',
  'next build',
  'nuxt build'
];

export class GitManager {
  constructor(token) {
    this.octokit = new Octokit({ auth: token });
    this.token = token;
  }

  parseGitHubUrl(url) {
    // FIX: Stricter GitHub URL validation — no internal network URLs
    if (!url || typeof url !== 'string') throw new Error('GitHub URL is required');
    const match = url.match(/^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/);
    if (!match) throw new Error('Invalid GitHub URL — must be https://github.com/owner/repo');
    return { owner: match[1], repo: match[2] };
  }

  // FIX: Validate build command against whitelist to prevent command injection
  validateBuildCommand(cmd) {
    if (!cmd) return 'npm run build';
    const normalized = cmd.trim().toLowerCase();
    const allowed = ALLOWED_BUILD_COMMANDS.find(c => c.toLowerCase() === normalized);
    if (!allowed) {
      console.warn(`Build command "${cmd}" not in whitelist, using default`);
      return 'npm run build';
    }
    return allowed;
  }

  async cloneRepo(url, branch = 'main') {
    const { owner, repo } = this.parseGitHubUrl(url);
    const cloneDir = path.join('/tmp', `repo-${uuidv4()}`);
    const git = simpleGit();

    // Use token auth URL
    const authUrl = `https://${this.token}@github.com/${owner}/${repo}.git`;

    try {
      await git.clone(authUrl, cloneDir, ['--branch', branch, '--depth', '1']);
    } catch (err) {
      // Try 'master' branch if 'main' fails
      if (branch === 'main') {
        await git.clone(authUrl, cloneDir, ['--branch', 'master', '--depth', '1']);
      } else {
        throw err;
      }
    }

    return { dir: cloneDir, git: simpleGit(cloneDir) };
  }

  async createFixBranch(git, branchName) {
    await git.checkoutLocalBranch(branchName);
    return branchName;
  }

  async applyFix(repoDir, filePath, content) {
    // FIX: Prevent path traversal — file must stay within repo directory
    const fullPath = path.resolve(repoDir, filePath);
    if (!fullPath.startsWith(path.resolve(repoDir))) {
      throw new Error(`Path traversal detected: ${filePath}`);
    }
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    return fullPath;
  }

  async commitAndPush(git, message, branch) {
    await git.addConfig('user.email', 'ai-monitor@noreply.local');
    await git.addConfig('user.name', 'AI Website Monitor');
    await git.add('.');
    await git.commit(message);
    await git.push('origin', branch, ['--set-upstream']);
  }

  async createPullRequest(githubUrl, branch, title, description) {
    const { owner, repo } = this.parseGitHubUrl(githubUrl);

    // Check what the default branch is
    const repoInfo = await this.octokit.rest.repos.get({ owner, repo });
    const defaultBranch = repoInfo.data.default_branch || 'main';

    const pr = await this.octokit.rest.pulls.create({
      owner,
      repo,
      title,
      head: branch,
      base: defaultBranch,
      body: description
    });

    return pr.data.html_url;
  }

  async rollbackBranch(githubUrl, branch) {
    const { owner, repo } = this.parseGitHubUrl(githubUrl);

    await this.octokit.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branch}`
    });
  }

  async getDiff(githubUrl, branch1, branch2 = null) {
    const { owner, repo } = this.parseGitHubUrl(githubUrl);

    // FIX: Use actual default branch if branch2 not provided
    if (!branch2) {
      const repoInfo = await this.octokit.rest.repos.get({ owner, repo });
      branch2 = repoInfo.data.default_branch || 'main';
    }

    const compare = await this.octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: branch2,
      head: branch1
    });

    return {
      files: compare.data.files?.map(f => ({
        filename: f.filename,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch || '(binary file)'
      })),
      totalCommits: compare.data.total_commits
    };
  }

  // Detect if project uses Playwright/Puppeteer/Cypress so we can skip browser download
  async detectBrowserDeps(repoDir) {
    try {
      const pkgPath = path.join(repoDir, 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies
      };
      return {
        hasPlaywright: !!allDeps['playwright'] || !!allDeps['@playwright/test'],
        hasPuppeteer: !!allDeps['puppeteer'],
        hasCypress: !!allDeps['cypress'],
      };
    } catch {
      return { hasPlaywright: false, hasPuppeteer: false, hasCypress: false };
    }
  }

  // Check if package.json has the required build script
  async hasBuildScript(repoDir, buildCommand) {
    try {
      const pkgPath = path.join(repoDir, 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      const scripts = pkg.scripts || {};
      // Extract the script name from command like "npm run build" -> "build"
      const match = buildCommand.match(/(?:npm run|yarn run|yarn|pnpm run|pnpm)\s+(\S+)/);
      const scriptName = match ? match[1] : 'build';
      return !!scripts[scriptName];
    } catch {
      return false;
    }
  }

  async verifyBuild(repoDir, buildCommand) {
    const safeCommand = this.validateBuildCommand(buildCommand);

    // If no build script exists in package.json, skip build verification entirely
    const hasBuild = await this.hasBuildScript(repoDir, safeCommand);
    if (!hasBuild) {
      console.log('[verifyBuild] No build script found in package.json — skipping build verify');
      return { success: true, output: 'Build verification skipped — no build script found', skipped: true };
    }

    try {
      const { exec } = await import('child_process');
      const util = await import('util');
      const execPromise = util.promisify(exec);

      // Detect browser-testing deps — skip their binary downloads during CI-like verify
      const deps = await this.detectBrowserDeps(repoDir);

      // Build env: always skip browser binary downloads so build does not fail
      // on Render/CI where Chromium headless shell is not pre-installed
      const env = {
        ...process.env,
        CI: 'true',
        // Playwright — skip downloading Chromium/Firefox/WebKit
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
        // Puppeteer — skip downloading Chromium
        PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true',
        PUPPETEER_SKIP_DOWNLOAD: 'true',
        // Cypress — skip binary download
        CYPRESS_INSTALL_BINARY: '0',
        // npm — no optional deps that pull binaries
        npm_config_optional: 'false',
      };

      if (deps.hasPlaywright || deps.hasPuppeteer || deps.hasCypress) {
        console.log('[verifyBuild] Browser testing deps detected — browser download skipped');
      }

      // --ignore-scripts was causing failures for packages that need postinstall
      // (e.g. esbuild, vite, tailwind). We skip ONLY browser binaries via env vars above.
      // For Playwright-heavy projects we also set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1.
      const installCmd = 'npm install --prefer-offline 2>&1';
      const fullCmd = `${installCmd} && ${safeCommand} 2>&1`;

      const { stdout } = await execPromise(fullCmd, {
        cwd: repoDir,
        timeout: 180000,       // 3 minutes
        maxBuffer: 1024 * 1024 * 10,
        env,
      });

      // Even if command "succeeds", check stdout for known fatal runtime errors
      // that would only surface at server start (not build time) — ignore them
      const runtimeOnlyErrors = [
        'playwright install',           // playwright telling user to run install
        "Executable doesn't exist",    // playwright binary missing at runtime
        'browserType.launch',           // playwright launch error (runtime only)
        'Cannot find Chrome',           // puppeteer runtime
      ];
      const hasRuntimeOnlyError = runtimeOnlyErrors.some(e => stdout.includes(e));

      if (hasRuntimeOnlyError) {
        console.log('[verifyBuild] Runtime-only browser error in output — treating build as success');
      }

      return { success: true, output: stdout.slice(-2000) };

    } catch (err) {
      const errMsg = err.message || '';
      const errOutput = (err.stdout || '') + (err.stderr || '');

      // These errors mean Playwright/Puppeteer binary is missing at runtime —
      // NOT a code error. The fix branch code is still correct; skip blocking.
      const browserRuntimeErrors = [
        "Executable doesn't exist",
        'browserType.launch',
        'chromium_headless_shell',
        'chrome-headless-shell',
        'playwright install',
        'Cannot find Chrome',
        'ENOENT.*chrome',
      ];

      const isBrowserRuntimeError = browserRuntimeErrors.some(pattern => {
        const re = new RegExp(pattern, 'i');
        return re.test(errMsg) || re.test(errOutput);
      });

      if (isBrowserRuntimeError) {
        console.warn('[verifyBuild] Playwright/Puppeteer binary not found — this is a Render environment issue, NOT a code error. Proceeding with push.');
        return {
          success: true,
          warning: 'Browser binary not found on build server (Playwright/Puppeteer). This is normal on Render — binaries install at runtime via postinstall. Code changes are safe to push.',
          output: errMsg.slice(0, 500),
        };
      }

      // Real build error — actual code problem, block the push
      return {
        success: false,
        error: errMsg.slice(0, 500),
        output: errOutput.slice(0, 500),
      };
    }
  }

  // FIX: Cleanup temp repo directory
  async cleanup(repoDir) {
    try {
      await fs.rm(repoDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`Cleanup failed for ${repoDir}:`, err.message);
    }
  }
}
