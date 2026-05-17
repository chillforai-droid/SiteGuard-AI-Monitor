import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import AddWebsite from './components/AddWebsite';
import ScanResults from './components/ScanResults';
import AIFixPanel from './components/AIFixPanel';
import AIEditor from './components/AIEditor';
import Settings from './components/Settings';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Get user-saved keys from localStorage
function getUserKeys() {
  return {
    monitorApiKey: localStorage.getItem('monitor_api_key') || '',
    openRouterKey: localStorage.getItem('openrouter_api_key') || '',
    selectedModel: localStorage.getItem('openrouter_model') || '',
  };
}

// Centralized API helper — sends user keys from localStorage in every request
async function apiFetch(path, options = {}) {
  const { monitorApiKey, openRouterKey } = getUserKeys();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(monitorApiKey ? { 'x-api-key': monitorApiKey } : {}),
      ...(openRouterKey ? { 'x-openrouter-key': openRouterKey } : {}),
      ...(getUserKeys().selectedModel ? { 'x-openrouter-model': getUserKeys().selectedModel } : {}),
      ...options.headers
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

function App() {
  const [view, setView] = useState('dashboard');
  const [websites, setWebsites] = useState([]);
  const [selectedWebsite, setSelectedWebsite] = useState(null);
  const [selectedScan, setSelectedScan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanningIds, setScanningIds] = useState(new Set());
  const [globalError, setGlobalError] = useState(null);
  const [hasKeys, setHasKeys] = useState(false);

  // Check if user has set up their keys
  useEffect(() => {
    const { monitorApiKey } = getUserKeys();
    setHasKeys(!!monitorApiKey);
    if (!monitorApiKey) setView('settings');
  }, []);

  const fetchWebsites = useCallback(async () => {
    try {
      const data = await apiFetch('/api/websites');
      setWebsites(data);
    } catch (err) {
      if (err.message.includes('API key required') || err.message.includes('Unauthorized')) {
        setGlobalError('API key missing or incorrect — go to Settings to set your Monitor API key');
        setView('settings');
      } else {
        setGlobalError(`Failed to load websites: ${err.message}`);
      }
    }
  }, []);

  useEffect(() => {
    if (hasKeys) fetchWebsites();
  }, [fetchWebsites, hasKeys]);

  const triggerScan = async (websiteId) => {
    setScanningIds(prev => new Set([...prev, websiteId]));
    try {
      await apiFetch(`/api/scans/${websiteId}`, { method: 'POST' });
      await fetchWebsites();
    } catch (err) {
      setGlobalError(`Scan failed: ${err.message}`);
    } finally {
      setScanningIds(prev => {
        const next = new Set(prev);
        next.delete(websiteId);
        return next;
      });
    }
  };

  const scanAll = async () => {
    setLoading(true);
    setGlobalError(null);
    try {
      await apiFetch('/api/scans/all', { method: 'POST' });
      await fetchWebsites();
    } catch (err) {
      setGlobalError(`Scan all failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const { monitorApiKey, openRouterKey, selectedModel } = getUserKeys();

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            🤖 AI Website Monitor
          </h1>
          <nav className="flex gap-3 items-center flex-wrap">
            <button
              onClick={() => setView('dashboard')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                view === 'dashboard' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => { setView('add'); setSelectedWebsite(null); }}
              className={`px-4 py-2 rounded-lg transition-colors ${
                view === 'add' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              + Add Website
            </button>
            <button
              onClick={() => setView('editor')}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
                view === 'editor' ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              ✏️ AI Editor
            </button>
            <button
              onClick={scanAll}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Scanning...
                </>
              ) : '🔍 Scan All'}
            </button>
            <button
              onClick={() => setView('settings')}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                view === 'settings' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
              }`}
              title="Settings"
            >
              ⚙️
              {/* Show dot if OpenRouter key is missing */}
              {!openRouterKey && (
                <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" title="OpenRouter key not set" />
              )}
            </button>
          </nav>
        </div>
      </header>

      {/* First-time setup banner */}
      {!hasKeys && view !== 'settings' && (
        <div className="bg-blue-900/60 border-b border-blue-700 px-4 py-3 flex justify-between items-center">
          <span className="text-blue-200 text-sm">👋 First time? Set your API keys to get started.</span>
          <button
            onClick={() => setView('settings')}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            Open Settings
          </button>
        </div>
      )}

      {/* Global Error Banner */}
      {globalError && (
        <div className="bg-red-900/80 border-b border-red-700 px-4 py-3 flex justify-between items-center">
          <span className="text-red-200 text-sm">⚠️ {globalError}</span>
          <button onClick={() => setGlobalError(null)} className="text-red-400 hover:text-red-200 text-lg leading-none">×</button>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {view === 'settings' && (
          <Settings
            onSave={() => {
              const { monitorApiKey } = getUserKeys();
              setHasKeys(!!monitorApiKey);
              if (monitorApiKey) {
                fetchWebsites();
                setView('dashboard');
              }
            }}
          />
        )}
        {view === 'dashboard' && (
          <Dashboard
            websites={websites}
            scanningIds={scanningIds}
            onSelectWebsite={(w) => {
              setSelectedWebsite(w);
              setView('scans');
            }}
            onTriggerScan={triggerScan}
            onRefresh={fetchWebsites}
            onOpenEditor={(w) => { setSelectedWebsite(w); setView('editor'); }}
          />
        )}
        {view === 'add' && (
          <AddWebsite
            onAdd={() => {
              fetchWebsites();
              setView('dashboard');
            }}
          />
        )}
        {view === 'scans' && selectedWebsite && (
          <ScanResults
            website={selectedWebsite}
            onSelectScan={(scan) => {
              setSelectedScan(scan);
              setView('fix');
            }}
            onBack={() => setView('dashboard')}
          />
        )}
        {view === 'fix' && selectedScan && (
          <AIFixPanel
            scan={selectedScan}
            website={selectedWebsite}
            onBack={() => setView('scans')}
          />
        )}
        {view === 'editor' && (
          <AIEditor
            website={selectedWebsite || (websites.length > 0 ? websites[0] : null)}
            onBack={() => setView('dashboard')}
          />
        )}
      </main>
    </div>
  );
}

export default App;
