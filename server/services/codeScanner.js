import fs from 'fs/promises';
import path from 'path';

// ─────────────────────────────────────────────
// WebGuard Pro — Deep GitHub Code Scanner
// Scans cloned repo files for real bugs/errors
// ─────────────────────────────────────────────

const JS_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
const STYLE_EXTENSIONS = ['.css', '.scss', '.sass', '.less'];
const HTML_EXTENSIONS = ['.html', '.htm'];
const CONFIG_FILES = ['package.json', '.env.example', 'vite.config.js', 'next.config.js', 'webpack.config.js'];

// Walk directory and collect all files
async function walkDir(dir, allFiles = []) {
  const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__'];
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return allFiles; }

  for (const entry of entries) {
    if (SKIP_DIRS.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkDir(fullPath, allFiles);
    else allFiles.push(fullPath);
  }
  return allFiles;
}

async function readFileSafe(filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > 500 * 1024) return null; // skip >500KB files
    return await fs.readFile(filePath, 'utf-8');
  } catch { return null; }
}

// ─── JS/TS Bug Patterns ───────────────────────
function scanJavaScript(content, filePath) {
  const issues = [];
  const lines = content.split('\n');

  const patterns = [
    // Security
    { re: /eval\s*\(/g,                          type: 'SECURITY',     sev: 'error',   msg: 'Dangerous eval() usage — can execute arbitrary code' },
    { re: /innerHTML\s*=/g,                       type: 'SECURITY',     sev: 'warning', msg: 'innerHTML assignment — XSS risk, use textContent or DOMPurify' },
    { re: /document\.write\s*\(/g,               type: 'SECURITY',     sev: 'error',   msg: 'document.write() is deprecated and blocks rendering' },
    { re: /new Function\s*\(/g,                  type: 'SECURITY',     sev: 'error',   msg: 'new Function() — same risk as eval(), avoid this' },
    { re: /dangerouslySetInnerHTML/g,            type: 'SECURITY',     sev: 'warning', msg: 'dangerouslySetInnerHTML — ensure content is sanitized' },
    { re: /localStorage\.setItem.*password/gi,   type: 'SECURITY',     sev: 'error',   msg: 'Storing password in localStorage — never store sensitive data here' },
    { re: /console\.(log|warn|error)\s*\(.*password/gi, type: 'SECURITY', sev: 'error', msg: 'Logging password to console — security leak' },
    { re: /(api_?key|secret|token)\s*=\s*['"][a-zA-Z0-9_\-]{10,}['"]/gi, type: 'SECURITY', sev: 'error', msg: 'Hardcoded API key / secret in source code' },

    // Logic Errors
    { re: /==\s*null(?!\s*\)?\s*\?)(?![=])/g,   type: 'BUG',          sev: 'warning', msg: 'Use === null or != null for strict null checks' },
    { re: /if\s*\([^)]+\)\s*;/g,                type: 'BUG',          sev: 'warning', msg: 'Empty if-body (semicolon after condition) — likely unintentional' },
    { re: /catch\s*\([^)]*\)\s*\{\s*\}/g,       type: 'BUG',          sev: 'warning', msg: 'Empty catch block — errors are silently swallowed' },
    { re: /\.then\s*\([^)]+\)\s*(?!\.catch)/g,  type: 'BUG',          sev: 'warning', msg: 'Promise .then() without .catch() — unhandled rejection' },
    { re: /setTimeout\s*\(\s*['"`]/g,           type: 'BUG',          sev: 'error',   msg: 'setTimeout with string arg — use a function instead' },
    { re: /setInterval\s*\(\s*['"`]/g,          type: 'BUG',          sev: 'error',   msg: 'setInterval with string arg — use a function instead' },
    { re: /return\n\s*[^;{]/gm,                 type: 'BUG',          sev: 'error',   msg: 'Possible ASI issue: return on its own line (unreachable code below)' },
    { re: /\bNaN\s*===\s*NaN\b/g,              type: 'BUG',          sev: 'error',   msg: 'NaN === NaN is always false — use Number.isNaN()' },
    { re: /typeof\s+\w+\s*==\s*['"]undefined['"]/g, type: 'BUG', sev: 'warning', msg: 'Use === instead of == for typeof comparison' },

    // Performance
    { re: /document\.querySelector.*\bfor\b|for.*document\.querySelector/g, type: 'PERFORMANCE', sev: 'warning', msg: 'DOM query inside loop — cache the element outside the loop' },
    { re: /JSON\.parse\s*\(JSON\.stringify/g,   type: 'PERFORMANCE',  sev: 'warning', msg: 'JSON.parse(JSON.stringify()) for deep clone is slow — use structuredClone()' },
    { re: /\.forEach\s*\(.*\.push/g,            type: 'PERFORMANCE',  sev: 'info',    msg: 'forEach + push can be replaced with .map() for clarity' },
    { re: /new Array\(\d{4,}\)/g,               type: 'PERFORMANCE',  sev: 'warning', msg: 'Large array allocation — ensure this is intentional' },

    // React specific
    { re: /useEffect\s*\([^)]+\)(?!\s*,)/g,    type: 'REACT',        sev: 'warning', msg: 'useEffect missing dependency array — runs on every render' },
    { re: /key=\{index\}/g,                     type: 'REACT',        sev: 'warning', msg: 'Using index as React key — causes re-render issues on list changes' },
    { re: /setState.*setState/g,                type: 'REACT',        sev: 'warning', msg: 'Multiple setState calls — batch them or use useReducer' },
    { re: /componentWillMount|componentWillReceiveProps|componentWillUpdate/g, type: 'REACT', sev: 'error', msg: 'Deprecated React lifecycle method — use modern alternatives' },

    // Async/Await
    { re: /async\s+\w+\s*\([^)]*\)\s*\{[^}]*await[^}]*\}(?!\s*\.catch)/g, type: 'BUG', sev: 'warning', msg: 'async function without try/catch — unhandled promise rejection risk' },

    // Dead code / bad practice
    { re: /\/\/\s*TODO|\/\/\s*FIXME|\/\/\s*HACK|\/\/\s*XXX/gi, type: 'CODE_QUALITY', sev: 'info', msg: 'TODO/FIXME/HACK comment found — unresolved technical debt' },
    { re: /debugger;/g,                         type: 'CODE_QUALITY', sev: 'error',   msg: 'debugger statement left in code — must be removed before production' },
    { re: /console\.(log|debug)\s*\(/g,         type: 'CODE_QUALITY', sev: 'info',    msg: 'console.log() left in code — remove debug logs in production' },
    { re: /var\s+\w+/g,                         type: 'CODE_QUALITY', sev: 'info',    msg: 'var declaration — use const/let instead (block scoping)' },
  ];

  for (const { re, type, sev, msg } of patterns) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      const lineContent = lines[lineNum - 1]?.trim().slice(0, 80) || '';
      issues.push({
        type, severity: sev,
        message: msg,
        file: filePath,
        line: lineNum,
        code: lineContent
      });
      if (issues.length > 50) break; // cap per pattern
    }
  }

  return issues;
}

// ─── CSS Bug Patterns ─────────────────────────
function scanCSS(content, filePath) {
  const issues = [];
  const lines = content.split('\n');

  const patterns = [
    { re: /!important/g,                         type: 'CSS',   sev: 'warning', msg: '!important usage — indicates specificity problems, avoid if possible' },
    { re: /color\s*:\s*#([0-9a-fA-F]{3,6})\b.*color\s*:\s*#([0-9a-fA-F]{3,6})/g, type: 'CSS', sev: 'info', msg: 'Multiple color declarations — possible duplicate or override' },
    { re: /z-index\s*:\s*9{3,}/g,               type: 'CSS',   sev: 'warning', msg: 'Very high z-index (999+) — indicates stacking context problems' },
    { re: /position\s*:\s*fixed[^}]*(?!.*z-index)/g, type: 'CSS', sev: 'info', msg: 'position:fixed without z-index — may cause stacking issues' },
    { re: /:hover[^{]+\{[^}]*transition\s*:/g,  type: 'CSS',   sev: 'info',   msg: 'transition defined inside :hover — define it on the base element for smooth animation' },
    { re: /overflow\s*:\s*hidden[^}]*(?!.*white-space)/g, type: 'CSS', sev: 'info', msg: 'overflow:hidden without white-space — text truncation may not work correctly' },
    { re: /width\s*:\s*100vw/g,                 type: 'CSS',   sev: 'warning', msg: '100vw can cause horizontal scroll on pages with scrollbar — use 100% instead' },
    { re: /box-sizing\s*:\s*content-box/g,      type: 'CSS',   sev: 'info',   msg: 'box-sizing:content-box (default) — consider using border-box for predictable sizing' },
  ];

  for (const { re, type, sev, msg } of patterns) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      issues.push({ type, severity: sev, message: msg, file: filePath, line: lineNum, code: lines[lineNum - 1]?.trim().slice(0, 80) || '' });
    }
  }

  return issues;
}

// ─── HTML Bug Patterns ────────────────────────
function scanHTML(content, filePath) {
  const issues = [];

  const patterns = [
    { re: /<img(?![^>]*alt=)/gi,                type: 'ACCESSIBILITY', sev: 'warning', msg: 'img tag missing alt attribute — accessibility violation' },
    { re: /<a(?![^>]*href=)[^>]*>/gi,           type: 'HTML',          sev: 'error',   msg: 'Anchor tag missing href — invalid HTML' },
    { re: /<form(?![^>]*action=)[^>]*>/gi,      type: 'HTML',          sev: 'warning', msg: 'Form missing action attribute' },
    { re: /<input(?![^>]*type=)[^>]*>/gi,       type: 'HTML',          sev: 'warning', msg: 'Input missing type attribute — defaults to text, but should be explicit' },
    { re: /<h[1-6][^>]*>\s*<\/h[1-6]>/gi,      type: 'HTML',          sev: 'warning', msg: 'Empty heading tag — bad for SEO and accessibility' },
    { re: /<script[^>]*>[\s\S]*?<\/script>/gi,  type: 'SECURITY',      sev: 'warning', msg: 'Inline script block — prefer external JS files for CSP compliance' },
    { re: /javascript:/gi,                       type: 'SECURITY',      sev: 'error',   msg: 'javascript: URI — XSS vulnerability' },
    { re: /<meta[^>]*http-equiv="refresh"/gi,   type: 'HTML',          sev: 'warning', msg: 'Meta refresh redirect — use server-side redirect or JS instead' },
  ];

  for (const { re, type, sev, msg } of patterns) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      issues.push({ type, severity: sev, message: msg, file: filePath, line: lineNum, code: match[0].slice(0, 80) });
    }
  }

  return issues;
}

// ─── package.json Checks ─────────────────────
function scanPackageJson(content, filePath) {
  const issues = [];
  let pkg;
  try { pkg = JSON.parse(content); } catch { return [{ type: 'CONFIG', severity: 'error', message: 'package.json is invalid JSON', file: filePath, line: 1, code: '' }]; }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  const knownVulnerable = {
    'lodash': '4.17.20',
    'axios': '0.21.0',
    'express': '4.17.0',
    'ejs': '3.1.5',
    'minimist': '1.2.5',
    'node-fetch': '2.6.0',
  };

  for (const [dep, vulnerableBelow] of Object.entries(knownVulnerable)) {
    if (allDeps[dep]) {
      const ver = allDeps[dep].replace(/[\^~>=<]/g, '');
      if (ver < vulnerableBelow) {
        issues.push({ type: 'DEPENDENCY', severity: 'error', message: `${dep}@${allDeps[dep]} has known vulnerabilities — update to latest`, file: filePath, line: 1, code: `"${dep}": "${allDeps[dep]}"` });
      }
    }
  }

  // Wildcard versions
  for (const [dep, ver] of Object.entries(allDeps)) {
    if (ver === '*' || ver === 'latest') {
      issues.push({ type: 'DEPENDENCY', severity: 'warning', message: `${dep} uses wildcard version "${ver}" — pin to a specific version`, file: filePath, line: 1, code: `"${dep}": "${ver}"` });
    }
  }

  if (!pkg.engines) {
    issues.push({ type: 'CONFIG', severity: 'info', message: 'No "engines" field — specify required Node.js version', file: filePath, line: 1, code: '' });
  }

  if (!pkg.license) {
    issues.push({ type: 'CONFIG', severity: 'info', message: 'Missing "license" field in package.json', file: filePath, line: 1, code: '' });
  }

  return issues;
}

// ─── Main Scanner ─────────────────────────────
export class CodeScanner {
  async scanRepo(repoDir) {
    const allFiles = await walkDir(repoDir);
    const allIssues = [];
    const scannedFiles = [];
    let totalLines = 0;

    for (const filePath of allFiles) {
      const relPath = path.relative(repoDir, filePath);
      const ext = path.extname(filePath).toLowerCase();
      const basename = path.basename(filePath);
      const content = await readFileSafe(filePath);
      if (!content) continue;

      scannedFiles.push(relPath);
      totalLines += content.split('\n').length;

      let fileIssues = [];

      if (JS_EXTENSIONS.includes(ext)) {
        fileIssues = scanJavaScript(content, relPath);
      } else if (STYLE_EXTENSIONS.includes(ext)) {
        fileIssues = scanCSS(content, relPath);
      } else if (HTML_EXTENSIONS.includes(ext)) {
        fileIssues = scanHTML(content, relPath);
      } else if (basename === 'package.json') {
        fileIssues = scanPackageJson(content, relPath);
      }

      allIssues.push(...fileIssues);
    }

    // Deduplicate same message+file combos
    const seen = new Set();
    const deduped = allIssues.filter(issue => {
      const key = `${issue.file}:${issue.line}:${issue.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort: errors first, then warnings, then info
    const sevOrder = { error: 0, warning: 1, info: 2 };
    deduped.sort((a, b) => (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3));

    return {
      scannedFiles: scannedFiles.length,
      totalLines,
      totalIssues: deduped.length,
      errors: deduped.filter(i => i.severity === 'error'),
      warnings: deduped.filter(i => i.severity === 'warning'),
      infos: deduped.filter(i => i.severity === 'info'),
      allIssues: deduped
    };
  }
}
