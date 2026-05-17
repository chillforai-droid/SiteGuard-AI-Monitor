import React, { useState, useEffect, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function getUserKeys() {
  return {
    anthropicKey: localStorage.getItem('anthropic_api_key') || '',
    monitorApiKey: localStorage.getItem('monitor_api_key') || '',
    openRouterKey: localStorage.getItem('openrouter_api_key') || '',
    selectedModel: localStorage.getItem('openrouter_model') || '',
  };
}

function apiFetch(path, options = {}) {
  const { anthropicKey, monitorApiKey, openRouterKey, selectedModel } = getUserKeys();
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(monitorApiKey ? { 'x-api-key': monitorApiKey } : {}),
      ...(anthropicKey ? { 'x-anthropic-key': anthropicKey } : {}),
      ...(openRouterKey ? { 'x-openrouter-key': openRouterKey } : {}),
      ...(selectedModel ? { 'x-openrouter-model': selectedModel } : {}),
      ...options.headers
    }
  });
}

// ─── Animated terminal log ────────────────────
function TerminalLog({ logs }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  if (!logs.length) return null;

  const colorClass = (type) => ({
    info:    'text-blue-300',
    success: 'text-green-400',
    error:   'text-red-400',
    warning: 'text-yellow-300',
    file:    'text-purple-300',
    step:    'text-cyan-300',
  }[type] || 'text-gray-300');

  const icon = (type) => ({
    info: 'ℹ', success: '✅', error: '❌', warning: '⚠', file: '📄', step: '▶'
  }[type] || '·');

  return (
    <div className="bg-gray-950 rounded-xl border border-gray-700 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 border-b border-gray-700">
        <span className="w-3 h-3 rounded-full bg-red-500" />
        <span className="w-3 h-3 rounded-full bg-yellow-500" />
        <span className="w-3 h-3 rounded-full bg-green-500" />
        <span className="text-gray-400 text-xs ml-2 font-mono">AI Editor — Terminal</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-green-400">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Live
        </span>
      </div>
      <div className="p-4 font-mono text-xs space-y-1 max-h-64 overflow-y-auto" style={{ background: '#0d1117' }}>
        {logs.map((log, i) => (
          <div key={i} className={`flex gap-2 ${colorClass(log.type)}`}>
            <span className="text-gray-600 w-4 text-right flex-shrink-0">{icon(log.type)}</span>
            <span className="whitespace-pre-wrap break-all">{log.msg}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Code Scanner Results ─────────────────────
function CodeScanResults({ results, onClose }) {
  const [filter, setFilter] = useState('all');
  if (!results) return null;

  const shown = filter === 'all' ? results.allIssues
    : filter === 'error' ? results.errors
    : filter === 'warning' ? results.warnings
    : results.infos;

  const sevColor = { error: 'text-red-400 bg-red-900/30 border-red-700', warning: 'text-yellow-300 bg-yellow-900/20 border-yellow-700', info: 'text-blue-300 bg-blue-900/20 border-blue-700' };
  const sevBadge = { error: 'bg-red-700 text-red-100', warning: 'bg-yellow-700 text-yellow-100', info: 'bg-blue-700 text-blue-100' };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Files Scanned', val: results.scannedFiles, color: 'text-gray-300' },
          { label: 'Errors', val: results.errors.length, color: 'text-red-400' },
          { label: 'Warnings', val: results.warnings.length, color: 'text-yellow-400' },
          { label: 'Info', val: results.infos.length, color: 'text-blue-400' },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-gray-800 rounded-lg p-3 text-center border border-gray-700">
            <div className={`text-2xl font-bold ${color}`}>{val}</div>
            <div className="text-gray-400 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'error', 'warning', 'info'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            {f === 'all' ? `All (${results.totalIssues})` : f === 'error' ? `Errors (${results.errors.length})` : f === 'warning' ? `Warnings (${results.warnings.length})` : `Info (${results.infos.length})`}
          </button>
        ))}
        <button onClick={onClose} className="ml-auto px-3 py-1.5 rounded-lg text-sm bg-gray-700 hover:bg-gray-600 text-gray-300">✕ Close</button>
      </div>

      {/* Issues List */}
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {shown.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No issues found for this filter 🎉</div>
        ) : shown.map((issue, i) => (
          <div key={i} className={`rounded-lg border p-3 ${sevColor[issue.severity]}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold ${sevBadge[issue.severity]}`}>
                    {issue.severity.toUpperCase()}
                  </span>
                  <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{issue.type}</span>
                </div>
                <div className="text-sm font-medium">{issue.message}</div>
                <div className="text-xs text-gray-400 mt-1 font-mono">
                  📄 {issue.file}{issue.line ? `:${issue.line}` : ''}
                </div>
                {issue.code && (
                  <div className="text-xs text-gray-500 font-mono mt-1 bg-black/30 rounded px-2 py-1 break-all">
                    {issue.code}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Quick Instruction Templates ─────────────
const INSTRUCTION_TEMPLATES = [
  { label: '🎨 Change Theme Color', text: 'Change the primary color theme to dark blue and purple gradient' },
  { label: '📝 Fix Meta Tags', text: 'Add proper meta description, og:title, og:description, and canonical URL tags' },
  { label: '📱 Mobile Fix', text: 'Fix the mobile responsive layout so there is no horizontal scroll' },
  { label: '⚡ Performance', text: 'Add lazy loading to all images and defer non-critical scripts' },
  { label: '♿ Accessibility', text: 'Add aria-labels, alt text to all images, and fix heading hierarchy' },
  { label: '🔒 Security Headers', text: 'Add Content-Security-Policy and other security meta tags to the HTML head' },
  { label: '🔤 Update Footer', text: 'Update the footer with current year and add privacy policy link' },
  { label: '💡 Add Dark Mode', text: 'Add a dark/light mode toggle using CSS variables' },
];

// ─── Main AIEditor Component ──────────────────
export default function AIEditor({ website, onBack }) {
  const [tab, setTab] = useState('editor'); // 'editor' | 'scanner'
  const [instruction, setInstruction] = useState('');
  const [targetFile, setTargetFile] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);
  const [scanResults, setScanResults] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  const addLog = (msg, type = 'info') => setLogs(prev => [...prev, { msg, type }]);

  useEffect(() => {
    if (website) fetchHistory();
  }, [website]);

  const fetchHistory = async () => {
    try {
      const res = await apiFetch(`/api/editor/history/${website.id}`);
      if (res.ok !== false) setHistory(Array.isArray(res) ? res : []);
    } catch {}
  };

  // ── Code Scanner ──────────────────────────────
  const runCodeScan = async () => {
    setScanning(true);
    setScanResults(null);
    setError(null);
    try {
      const res = await apiFetch(`/api/editor/scan-code/${website.id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setScanResults(data.results);
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  // ── AI Text Edit ──────────────────────────────
  const runAIEdit = async () => {
    if (!instruction.trim()) { setError('Please enter an instruction'); return; }
    if (instruction.length > 1000) {
      setError(`Instruction too long (${instruction.length}/1000 chars). Write a short description — don't paste HTML or code.`);
      return;
    }
    setLoading(true);
    setLogs([]);
    setResult(null);
    setError(null);

    addLog('Connecting to GitHub repository...', 'step');
    addLog(`Website: ${website.url}`, 'info');
    addLog(`Framework: ${website.framework || 'Unknown'}`, 'info');

    try {
      const reqBody = { websiteId: website.id, instruction };
      if (targetFile.trim()) reqBody.targetFile = targetFile.trim();

      addLog('Cloning repository...', 'step');
      addLog('Reading source files...', 'step');
      addLog('Sending to AI for analysis...', 'step');

      const res = await apiFetch('/api/editor/ai-edit', {
        method: 'POST',
        body: JSON.stringify(reqBody)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Edit failed');

      if (data.noChanges) {
        addLog('AI says no changes are needed for this instruction.', 'warning');
        addLog(data.explanation || '', 'info');
        setResult({ noChanges: true, explanation: data.explanation });
        return;
      }

      addLog(`AI generated ${data.appliedFiles?.length || 0} file change(s)`, 'success');
      data.appliedFiles?.forEach(f => addLog(`  📄 ${f.file} — ${f.description || 'updated'}`, 'file'));
      addLog('Running build verification...', 'step');
      addLog('Committing and pushing to GitHub...', 'step');
      addLog('Creating Pull Request...', 'step');
      addLog(`✅ Pull Request created!`, 'success');
      addLog(data.prUrl || '', 'info');

      setResult(data);
      fetchHistory();
    } catch (err) {
      addLog(`❌ Error: ${err.message}`, 'error');
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!website) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-gray-400 hover:text-white text-sm mb-2 flex items-center gap-1 transition-colors">
            ← Back
          </button>
          <h2 className="text-2xl font-bold text-white">✏️ AI Site Editor</h2>
          <p className="text-gray-400 text-sm mt-1">{website.name} — {website.url}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-0">
        {[
          { id: 'editor', label: '✏️ AI Text Editor', desc: 'Edit site with natural language' },
          { id: 'scanner', label: '🔍 Code Scanner', desc: 'Deep bug analysis' },
          { id: 'history', label: '📜 History', desc: `${history.length} records` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
          >
            {t.label}
            <span className="text-xs text-gray-500 ml-1 hidden sm:inline">— {t.desc}</span>
          </button>
        ))}
      </div>

      {/* ── AI TEXT EDITOR TAB ── */}
      {tab === 'editor' && (
        <div className="space-y-5">
          {/* Quick templates */}
          <div>
            <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Quick Instructions</div>
            <div className="flex flex-wrap gap-2">
              {INSTRUCTION_TEMPLATES.map(t => (
                <button
                  key={t.label}
                  onClick={() => setInstruction(t.text)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Instruction input */}
          <div>
            <label className="block text-sm text-gray-300 mb-2 font-medium">
              🗣️ What do you want to change? <span className="text-red-400">*</span>
            </label>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder="e.g., Change the navbar color to dark blue and add a login button on the right side. Write in plain language — do not paste HTML code here."
              rows={4}
              className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none text-sm"
            />
            <div className={`text-xs mt-1 ${instruction.length > 1000 ? 'text-red-400 font-semibold' : instruction.length > 800 ? 'text-yellow-400' : 'text-gray-500'}`}>
              {instruction.length}/1000{instruction.length > 1000 ? ' — too long!' : ' chars'}
            </div>
          </div>

          {/* Target file (optional) */}
          <div>
            <label className="block text-sm text-gray-300 mb-2 font-medium">
              📄 Target File <span className="text-gray-500">(optional — AI auto-detects if blank)</span>
            </label>
            <input
              value={targetFile}
              onChange={e => setTargetFile(e.target.value)}
              placeholder="e.g., src/App.jsx  or  index.html  or  src/index.css"
              className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm space-y-2">
              <div>⚠️ {error}</div>
              {(error.includes('no content') || error.includes('fail') || error.includes('content')) && (
                <div className="text-yellow-300 text-xs bg-yellow-900/30 border border-yellow-700 rounded-lg px-3 py-2">
                  💡 <strong>Fix:</strong> Settings में जाकर <strong>Anthropic API Key</strong> add करें (<a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="underline text-blue-300">console.anthropic.com</a> पर free मिलती है) — यह free OpenRouter models से ज़्यादा reliable है।
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={runAIEdit}
            disabled={loading || !instruction.trim() || instruction.length > 1000}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                AI is editing your site...
              </>
            ) : '🚀 Apply AI Edit & Create PR'}
          </button>

          {/* Terminal log */}
          {logs.length > 0 && <TerminalLog logs={logs} />}

          {/* Result */}
          {result && !result.noChanges && (
            <div className="bg-green-900/30 border border-green-700 rounded-xl p-5 space-y-3">
              <div className="text-green-400 font-semibold text-lg">✅ Edit Applied Successfully!</div>
              <div className="text-gray-300 text-sm">{result.explanation}</div>
              {result.appliedFiles?.length > 0 && (
                <div>
                  <div className="text-xs text-gray-400 mb-2 uppercase">Files Changed</div>
                  {result.appliedFiles.map((f, i) => (
                    <div key={i} className="flex gap-2 text-sm text-gray-300 mb-1">
                      <span className="text-purple-400">📄</span>
                      <span className="font-mono">{f.file}</span>
                      {f.description && <span className="text-gray-500">— {f.description}</span>}
                    </div>
                  ))}
                </div>
              )}
              {result.prUrl && (
                <a
                  href={result.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm rounded-lg transition-colors font-medium"
                >
                  🔗 Review Pull Request on GitHub
                </a>
              )}
            </div>
          )}

          {result?.noChanges && (
            <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4 text-yellow-300 text-sm">
              ℹ️ {result.explanation || 'AI determined no changes are needed for this instruction.'}
            </div>
          )}
        </div>
      )}

      {/* ── CODE SCANNER TAB ── */}
      {tab === 'scanner' && (
        <div className="space-y-5">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
            <h3 className="text-white font-semibold mb-2">🔍 Deep GitHub Code Scanner</h3>
            <p className="text-gray-400 text-sm mb-4">
              Scans your entire GitHub repository for bugs, security issues, performance problems, bad practices, and dependency vulnerabilities.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
              {['JS/TS Bugs', 'Security Vulns', 'CSS Issues', 'HTML Errors', 'React Patterns', 'Dependency Risks', 'Performance', 'Code Quality'].map(item => (
                <div key={item} className="bg-gray-700 rounded-lg px-3 py-2 text-gray-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  {item}
                </div>
              ))}
            </div>
            <button
              onClick={runCodeScan}
              disabled={scanning}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-all flex items-center justify-center gap-2"
            >
              {scanning ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Scanning repository...
                </>
              ) : '🔍 Start Deep Code Scan'}
            </button>
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">
              ⚠️ {error}
            </div>
          )}

          {scanResults && (
            <CodeScanResults results={scanResults} onClose={() => setScanResults(null)} />
          )}
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <div className="text-4xl mb-3">📭</div>
              <div>No AI edits or scans yet</div>
              <div className="text-sm text-gray-600 mt-1">Use the Editor or Scanner tabs to get started</div>
            </div>
          ) : history.map((item, i) => (
            <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{item.type === 'ai_edit' ? '✏️' : '🔍'}</span>
                  <span className="text-xs text-gray-400 uppercase font-semibold">{item.type === 'ai_edit' ? 'AI Edit' : 'Code Scan'}</span>
                </div>
                <span className="text-xs text-gray-500">{new Date(item.timestamp).toLocaleString()}</span>
              </div>

              {item.type === 'ai_edit' && (
                <>
                  <div className="text-white text-sm mb-1">"{item.instruction}"</div>
                  {item.explanation && <div className="text-gray-400 text-xs mb-2">{item.explanation}</div>}
                  {item.appliedFiles?.length > 0 && (
                    <div className="text-xs text-gray-500 mb-2">
                      Changed: {item.appliedFiles.map(f => f.file).join(', ')}
                    </div>
                  )}
                  {item.prUrl && (
                    <a href={item.prUrl} target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-xs underline">
                      🔗 View PR
                    </a>
                  )}
                </>
              )}

              {item.type === 'code_scan' && item.codeAnalysis && (
                <div className="flex gap-3 text-sm">
                  <span className="text-red-400">{item.codeAnalysis.errors?.length || 0} errors</span>
                  <span className="text-yellow-400">{item.codeAnalysis.warnings?.length || 0} warnings</span>
                  <span className="text-blue-400">{item.codeAnalysis.infos?.length || 0} info</span>
                  <span className="text-gray-500">({item.codeAnalysis.scannedFiles || 0} files)</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
