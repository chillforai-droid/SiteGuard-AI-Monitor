import React, { useState, useEffect, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function getUserKeys() {
  return {
    monitorApiKey: localStorage.getItem('monitor_api_key') || '',
    openRouterKey: localStorage.getItem('openrouter_api_key') || '',
    selectedModel: localStorage.getItem('openrouter_model') || '',
  };
}

function apiFetch(path, options = {}) {
  const { monitorApiKey, openRouterKey, selectedModel } = getUserKeys();
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(monitorApiKey ? { 'x-api-key': monitorApiKey } : {}),
      ...(openRouterKey ? { 'x-openrouter-key': openRouterKey } : {}),
      ...(selectedModel ? { 'x-openrouter-model': selectedModel } : {}),
      ...options.headers
    }
  });
}

// Realtime file editor display
function RealtimeFileEditor({ steps }) {
  const bottomRef = useRef(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  if (!steps || steps.length === 0) return null;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden mb-6">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-800 border-b border-gray-700">
        <span className="w-3 h-3 rounded-full bg-red-500" />
        <span className="w-3 h-3 rounded-full bg-yellow-500" />
        <span className="w-3 h-3 rounded-full bg-green-500" />
        <span className="text-gray-400 text-xs ml-2 font-mono">AI File Editor — Live</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-green-400">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Editing...
        </span>
      </div>
      <div className="max-h-80 overflow-y-auto p-4 font-mono text-xs space-y-1" style={{background:'#0d1117'}}>
        {steps.map((step, i) => (
          <div key={i} className={`flex gap-3 ${
            step.type === 'file' ? 'text-blue-400' :
            step.type === 'add' ? 'text-green-400' :
            step.type === 'remove' ? 'text-red-400' :
            step.type === 'info' ? 'text-yellow-300' :
            step.type === 'success' ? 'text-green-300' :
            step.type === 'error' ? 'text-red-300' :
            'text-gray-400'
          }`}>
            <span className="text-gray-600 select-none w-5 text-right flex-shrink-0">{i+1}</span>
            <span className="whitespace-pre-wrap break-all">
              {step.type === 'file' && `📄 ${step.content}`}
              {step.type === 'add' && `+ ${step.content}`}
              {step.type === 'remove' && `- ${step.content}`}
              {step.type === 'info' && `  ℹ  ${step.content}`}
              {step.type === 'success' && `✅ ${step.content}`}
              {step.type === 'error' && `❌ ${step.content}`}
              {step.type === 'plain' && `   ${step.content}`}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// Fix summary panel
function FixSummary({ summary }) {
  if (!summary) return null;
  return (
    <div className="bg-gray-900 rounded-xl border border-green-800 p-5 mb-6">
      <h3 className="text-green-400 font-semibold mb-3 flex items-center gap-2">
        📋 Fix Summary — क्या था Error और क्या Fix हुआ
      </h3>
      <div className="space-y-3">
        {summary.errors?.length > 0 && (
          <div>
            <div className="text-red-400 text-xs font-semibold uppercase mb-1">🐛 Errors Found</div>
            {summary.errors.map((e, i) => (
              <div key={i} className="flex gap-2 text-sm text-gray-300 mb-1">
                <span className="text-red-400 flex-shrink-0">•</span>
                <span>{e}</span>
              </div>
            ))}
          </div>
        )}
        {summary.fixes?.length > 0 && (
          <div>
            <div className="text-green-400 text-xs font-semibold uppercase mb-1">🔧 Applied Fixes</div>
            {summary.fixes.map((f, i) => (
              <div key={i} className="flex gap-2 text-sm text-gray-300 mb-1">
                <span className="text-green-400 flex-shrink-0">✓</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        )}
        {summary.filesEdited?.length > 0 && (
          <div>
            <div className="text-blue-400 text-xs font-semibold uppercase mb-1">📁 Files Edited</div>
            <div className="flex flex-wrap gap-2">
              {summary.filesEdited.map((f, i) => (
                <span key={i} className="text-xs bg-blue-900/40 text-blue-300 px-2 py-1 rounded font-mono">{f}</span>
              ))}
            </div>
          </div>
        )}
        {summary.message && (
          <div className="mt-2 p-3 bg-green-900/20 border border-green-800 rounded-lg text-green-300 text-sm">
            {summary.message}
          </div>
        )}
      </div>
    </div>
  );
}

// GitHub file tree browser
function GitHubFileBrowser({ website, scan }) {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);

  const loadTree = async () => {
    if (tree) { setExpanded(v => !v); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/websites/${website.id}/files`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load files');
      setTree(data.tree || []);
      setExpanded(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadFile = async (path, sha) => {
    if (selectedFile === path) { setSelectedFile(null); setFileContent(null); return; }
    setSelectedFile(path);
    setFileLoading(true);
    setFileContent(null);
    try {
      const res = await apiFetch(`/api/websites/${website.id}/files/content?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load file');
      setFileContent(data);
    } catch (err) {
      setFileContent({ error: err.message });
    } finally {
      setFileLoading(false);
    }
  };

  if (!website?.hasGithubToken || !website?.githubRepo) return null;

  // Build simple file tree display
  const buildTree = (items) => {
    const dirs = {};
    const files = [];
    items.forEach(item => {
      const parts = item.path.split('/');
      if (parts.length === 1) {
        files.push(item);
      } else {
        const dir = parts[0];
        if (!dirs[dir]) dirs[dir] = [];
        dirs[dir].push({ ...item, path: parts.slice(1).join('/'), fullPath: item.path });
      }
    });
    return { dirs, files };
  };

  const FileIcon = ({ path }) => {
    const ext = path.split('.').pop()?.toLowerCase();
    const icons = { js:'🟨', jsx:'⚛️', ts:'🔷', tsx:'⚛️', json:'📋', html:'🌐', css:'🎨', md:'📝', py:'🐍', sh:'⚡', yml:'⚙️', yaml:'⚙️', env:'🔒' };
    return <span>{icons[ext] || '📄'}</span>;
  };

  const TreeNode = ({ item, depth = 0 }) => {
    const isSelected = selectedFile === (item.fullPath || item.path);
    return (
      <div>
        <button onClick={() => loadFile(item.fullPath || item.path)} style={{ paddingLeft: `${depth * 16 + 8}px` }}
          className={`w-full flex items-center gap-2 py-1 pr-3 text-left text-xs rounded transition-colors ${
            isSelected ? 'bg-blue-900/40 text-blue-300' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
          <FileIcon path={item.path} />
          <span className="truncate">{item.path.split('/').pop()}</span>
          {item.size && <span className="ml-auto text-gray-600 flex-shrink-0">{(item.size/1024).toFixed(1)}KB</span>}
        </button>
      </div>
    );
  };

  const FolderNode = ({ name, items, depth = 0 }) => {
    const [open, setOpen] = useState(false);
    const { dirs, files } = buildTree(items);
    return (
      <div>
        <button onClick={() => setOpen(v => !v)} style={{ paddingLeft: `${depth * 16 + 8}px` }}
          className="w-full flex items-center gap-2 py-1 pr-3 text-left text-xs text-gray-300 hover:bg-gray-800 rounded transition-colors">
          <span>{open ? '📂' : '📁'}</span>
          <span>{name}</span>
          <span className="ml-auto text-gray-600">{items.length}</span>
        </button>
        {open && (
          <div>
            {Object.entries(dirs).map(([dir, children]) => (
              <FolderNode key={dir} name={dir} items={children} depth={depth + 1} />
            ))}
            {files.map(f => <TreeNode key={f.path} item={f} depth={depth + 1} />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 mb-6">
      <button onClick={loadTree} disabled={loading}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-750 transition-colors rounded-xl">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span>📁</span>
          <span>GitHub Repository Files</span>
          <span className="text-xs text-gray-500 font-mono">{website.githubRepo?.replace('https://github.com/', '')}</span>
        </div>
        <div className="flex items-center gap-2">
          {loading && <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
          <span className="text-gray-400 text-xs">{expanded ? '▲ Collapse' : '▼ Expand'}</span>
        </div>
      </button>

      {error && (
        <div className="px-4 pb-3 text-red-400 text-xs">⚠️ {error}</div>
      )}

      {expanded && tree && (
        <div className="border-t border-gray-700">
          <div className="flex" style={{ minHeight: '200px' }}>
            {/* File tree */}
            <div className="w-64 border-r border-gray-700 overflow-y-auto max-h-96 py-2 flex-shrink-0">
              {(() => {
                const { dirs, files } = buildTree(tree);
                return (
                  <>
                    {Object.entries(dirs).map(([dir, children]) => (
                      <FolderNode key={dir} name={dir} items={children} />
                    ))}
                    {files.map(f => <TreeNode key={f.path} item={f} />)}
                  </>
                );
              })()}
            </div>

            {/* File content */}
            <div className="flex-1 overflow-auto max-h-96">
              {!selectedFile && (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  ← कोई file select करें
                </div>
              )}
              {fileLoading && (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  <span className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2" />
                  Loading...
                </div>
              )}
              {fileContent && !fileLoading && (
                <div>
                  <div className="px-4 py-2 bg-gray-900 border-b border-gray-700 flex items-center justify-between sticky top-0">
                    <span className="text-xs text-blue-400 font-mono">{selectedFile}</span>
                    {fileContent.size && <span className="text-xs text-gray-500">{(fileContent.size/1024).toFixed(1)}KB</span>}
                  </div>
                  {fileContent.error ? (
                    <div className="p-4 text-red-400 text-xs">{fileContent.error}</div>
                  ) : fileContent.content ? (
                    <pre className="p-4 text-xs text-gray-300 font-mono overflow-x-auto whitespace-pre-wrap">
                      {fileContent.content.split('\n').map((line, i) => (
                        <div key={i} className="flex gap-3">
                          <span className="text-gray-600 select-none w-6 text-right flex-shrink-0">{i+1}</span>
                          <span>{line}</span>
                        </div>
                      ))}
                    </pre>
                  ) : (
                    <div className="p-4 text-gray-500 text-xs">Binary file — preview not available</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AIFixPanel({ scan, website, onBack }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [diff, setDiff] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [error, setError] = useState(null);

  // Realtime editor steps
  const [editorSteps, setEditorSteps] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [fixSummary, setFixSummary] = useState(null);

  const addStep = (type, content) => {
    setEditorSteps(prev => [...prev, { type, content, ts: Date.now() }]);
  };

  const approveFix = async (issueIndex) => {
    setLoading(true);
    setIsEditing(true);
    setEditorSteps([]);
    setFixSummary(null);
    setError(null);
    setResult(null);

    const issue = scan.aiAnalysis?.criticalIssues?.[issueIndex];
    const patches = scan.aiAnalysis?.patches || [];

    // Simulate realtime steps as AI works
    addStep('info', `Fix शुरू हो रहा है: "${issue?.message}"`);
    addStep('info', `${patches.length} patch(es) apply होंगे`);

    setTimeout(() => addStep('info', 'GitHub repository clone हो रही है...'), 400);
    setTimeout(() => addStep('info', 'Fix branch create हो रही है...'), 900);

    patches.forEach((patch, i) => {
      setTimeout(() => {
        addStep('file', `Editing: ${patch.file}`);
        // Simulate diff lines from patch content
        const lines = patch.fix?.split('\n') || [];
        lines.slice(0, 8).forEach((line, li) => {
          setTimeout(() => {
            if (line.startsWith('+')) addStep('add', line.slice(1).trim() || ' ');
            else if (line.startsWith('-')) addStep('remove', line.slice(1).trim() || ' ');
            else if (line.trim()) addStep('plain', line.trim());
          }, li * 80);
        });
      }, 1200 + i * 800);
    });

    setTimeout(() => addStep('info', 'Build verify हो रही है...'), 1200 + patches.length * 800 + 200);
    setTimeout(() => addStep('info', 'Changes commit और push हो रहे हैं...'), 1200 + patches.length * 800 + 600);

    try {
      const res = await apiFetch('/api/fixes/approve', {
        method: 'POST',
        body: JSON.stringify({ scanId: scan.id, issueIndex })
      });
      const data = await res.json();

      setIsEditing(false);

      if (!res.ok) {
        addStep('error', data.error || 'Fix failed');
        setError(data.error || 'Fix failed');
        return;
      }

      if (data.buildWarning) {
        addStep('info', `⚠️ Build warning: ${data.buildWarning}`);
      }
      addStep('success', `PR create हो गया: ${data.prUrl || 'done'}`);
      addStep('success', `Branch: ${data.branch}`);
      setResult(data);

      // Build fix summary
      setFixSummary({
        errors: scan.aiAnalysis?.criticalIssues?.map(i => `${i.type}: ${i.message}`) || [],
        fixes: patches.map(p => `${p.file} में fix apply हुआ (risk: ${p.risk || 'unknown'})`),
        filesEdited: patches.map(p => p.file),
        message: `✅ Fix successfully apply हुआ! Branch "${data.branch}" पर PR create हो गई।`,
      });

    } catch (err) {
      setIsEditing(false);
      addStep('error', `Network error: ${err.message}`);
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const viewDiff = async () => {
    setDiffLoading(true);
    setDiff(null);
    try {
      const res = await apiFetch(`/api/fixes/diff/${scan.id}`);
      if (!res.ok) { const data = await res.json(); setError(data.error || 'Failed to load diff'); return; }
      const data = await res.json();
      setDiff(data);
    } catch (err) {
      setError(`Failed to load diff: ${err.message}`);
    } finally {
      setDiffLoading(false);
    }
  };

  const rollbackFix = async () => {
    if (!window.confirm('Rollback करना चाहते हैं? GitHub पर fix branch delete हो जाएगी।')) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/fixes/rollback/${scan.id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Rollback failed'); return; }
      setResult(null); setDiff(null); setEditorSteps([]); setFixSummary(null);
    } catch (err) {
      setError(`Rollback error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const hasGithubConfig = website?.hasGithubToken && website?.githubRepo;
  const selectedModel = localStorage.getItem('openrouter_model') || 'default';

  return (
    <div>
      <button onClick={onBack} className="mb-6 text-blue-400 hover:underline">← Back to Scans</button>

      {error && (
        <div className="mb-4 p-4 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm flex justify-between items-start">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-200">×</button>
        </div>
      )}

      {/* Model badge */}
      <div className="mb-4 flex items-center gap-2 text-xs text-gray-500">
        <span>🧠 AI Model:</span>
        <span className="font-mono bg-gray-800 px-2 py-0.5 rounded text-gray-300">{selectedModel}</span>
        <button onClick={() => { const e = document.createElement('a'); e.href='#settings'; }} className="text-blue-400 hover:underline" onClick={() => window.location.hash = 'settings'}>बदलें →</button>
      </div>

      {!hasGithubConfig && (
        <div className="mb-6 p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg text-yellow-300 text-sm">
          ⚠️ GitHub token या repository configure नहीं है। Auto-fix के लिए दोनों जरूरी हैं।
        </div>
      )}

      {/* GitHub File Browser */}
      {hasGithubConfig && <GitHubFileBrowser website={website} scan={scan} />}

      {/* Realtime editor (shows while fixing) */}
      {editorSteps.length > 0 && (
        <RealtimeFileEditor steps={editorSteps} />
      )}

      {/* Fix Summary */}
      {fixSummary && <FixSummary summary={fixSummary} />}

      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-8">
        <h2 className="text-xl font-bold mb-4">AI Analysis & Fix</h2>

        {/* AI Summary */}
        <div className="bg-gray-900 rounded-lg p-4 mb-6">
          <div className="text-sm text-gray-400 mb-2">AI Analysis Summary</div>
          <p className="text-gray-200 leading-relaxed">{scan.aiAnalysis?.summary || 'इस scan के लिए कोई analysis नहीं है।'}</p>
          <div className="flex gap-4 mt-3">
            {scan.aiAnalysis?.priority && (
              <span className={`text-xs px-2 py-1 rounded font-medium ${
                scan.aiAnalysis.priority === 'high' ? 'bg-red-900 text-red-300' :
                scan.aiAnalysis.priority === 'medium' ? 'bg-yellow-900 text-yellow-300' : 'bg-green-900 text-green-300'}`}>
                Priority: {scan.aiAnalysis.priority}
              </span>
            )}
            {scan.aiAnalysis?.rootCauses?.length > 0 && (
              <span className="text-xs text-gray-500">{scan.aiAnalysis.rootCauses.length} root cause{scan.aiAnalysis.rootCauses.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        {/* Root causes */}
        {scan.aiAnalysis?.rootCauses?.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">Root Causes</h3>
            <ul className="space-y-1">
              {scan.aiAnalysis.rootCauses.map((cause, i) => (
                <li key={i} className="text-sm text-gray-300">• {cause}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Critical Issues */}
        {scan.aiAnalysis?.criticalIssues?.length > 0 ? (
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-semibold">Critical Issues</h3>
            {scan.aiAnalysis.criticalIssues.map((issue, i) => (
              <div key={i} className="bg-red-900/20 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-red-400 block">{issue.type}</span>
                    <p className="text-sm mt-1 text-gray-300">{issue.message}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs flex-shrink-0 ${
                    issue.severity === 'error' ? 'bg-red-900 text-red-400' : 'bg-yellow-900 text-yellow-400'}`}>
                    {issue.severity || 'warning'}
                  </span>
                </div>
                {!scan.fixed && hasGithubConfig && (
                  <button onClick={() => approveFix(i)} disabled={loading}
                    className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2">
                    {loading ? (
                      <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> AI Fix Apply हो रही है...</>
                    ) : '✅ Approve & Auto-Fix'}
                  </button>
                )}
                {scan.fixed && <div className="text-xs text-green-400 mt-2">✓ Fix already applied</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-gray-500">इस scan में कोई critical issues नहीं मिले।</div>
        )}

        {/* Patches */}
        {scan.aiAnalysis?.patches?.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Suggested Patches</h3>
            {scan.aiAnalysis.patches.map((patch, i) => (
              <div key={i} className="bg-gray-900 rounded-lg p-4 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-400 font-mono">{patch.file}</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    patch.risk === 'low' ? 'bg-green-900 text-green-400' :
                    patch.risk === 'medium' ? 'bg-yellow-900 text-yellow-400' : 'bg-red-900 text-red-400'}`}>
                    Risk: {patch.risk || 'unknown'}
                  </span>
                </div>
                <pre className="text-xs text-gray-300 overflow-x-auto p-2 bg-black/50 rounded whitespace-pre-wrap">{patch.fix}</pre>
              </div>
            ))}
          </div>
        )}

        {/* Fix Result */}
        {result && (
          <div className={`p-4 rounded-lg mb-4 ${result.success ? 'bg-green-900/20 border border-green-800' : 'bg-red-900/20 border border-red-800'}`}>
            {result.success ? (
              <div>
                <div className="font-medium text-green-400 mb-2">✅ Fix Successfully Applied!</div>
                {result.buildWarning && (
                  <div className="mb-3 p-2 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-300 text-xs">
                    ⚠️ Build warning (non-fatal): {result.buildWarning}
                  </div>
                )}
                <div className="text-sm text-gray-300 mb-1">Branch: <code className="bg-gray-700 px-2 py-0.5 rounded text-xs">{result.branch}</code></div>
                {result.prUrl && (
                  <a href={result.prUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-sm mt-2 inline-block">
                    🔗 GitHub पर Pull Request देखें →
                  </a>
                )}
                <div className="flex gap-2 mt-4">
                  <button onClick={viewDiff} disabled={diffLoading}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-sm transition-colors">
                    {diffLoading ? '...' : '📄 View Diff'}
                  </button>
                  <button onClick={rollbackFix} disabled={loading}
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-lg text-sm transition-colors">
                    ↩ Rollback
                  </button>
                </div>
              </div>
            ) : <div className="text-red-400">❌ {result.error}</div>}
          </div>
        )}

        {/* Diff Viewer */}
        {diff && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Code Changes</h3>
            {diff.files?.length === 0 && <div className="text-gray-500 text-sm">No file changes found.</div>}
            <div className="space-y-4">
              {diff.files?.map((file, i) => (
                <div key={i} className="bg-gray-900 rounded-lg p-4">
                  <div className="text-sm font-medium text-blue-400 mb-2 font-mono">{file.filename}</div>
                  <div className="text-xs text-gray-400 mb-2">
                    <span className="text-green-400">+{file.additions}</span>{' / '}
                    <span className="text-red-400">-{file.deletions}</span>
                  </div>
                  <pre className="text-xs overflow-x-auto font-mono">
                    {file.patch?.split('\n').map((line, j) => (
                      <div key={j} className={
                        line.startsWith('+') ? 'text-green-400' :
                        line.startsWith('-') ? 'text-red-400' :
                        line.startsWith('@@') ? 'text-blue-400' : 'text-gray-400'}>
                        {line}
                      </div>
                    ))}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
