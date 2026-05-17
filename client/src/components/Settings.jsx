import React, { useState, useEffect, useCallback } from 'react';

const OPENROUTER_API = 'https://openrouter.ai/api/v1';

const FALLBACK_FREE_MODELS = [
  { id: 'deepseek/deepseek-chat:free', name: 'DeepSeek Chat (Free)', context: 65536 },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', context: 65536 },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', context: 1048576 },
  { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)', context: 131072 },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (Free)', context: 32768 },
  { id: 'qwen/qwen-2-7b-instruct:free', name: 'Qwen 2 7B (Free)', context: 32768 },
];

export default function Settings({ onSave }) {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [monitorApiKey, setMonitorApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [showOrKey, setShowOrKey] = useState(false);
  const [showMonKey, setShowMonKey] = useState(false);
  const [models, setModels] = useState({ free: [], paid: [] });
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelTab, setModelTab] = useState('free');
  const [modelSearch, setModelSearch] = useState('');
  const [keyValidated, setKeyValidated] = useState(false);

  useEffect(() => {
    const savedAnthropicKey = localStorage.getItem('anthropic_api_key') || '';
    const savedKey = localStorage.getItem('openrouter_api_key') || '';
    const savedMonKey = localStorage.getItem('monitor_api_key') || '';
    const savedModel = localStorage.getItem('openrouter_model') || '';
    setAnthropicKey(savedAnthropicKey);
    setOpenRouterKey(savedKey);
    setMonitorApiKey(savedMonKey);
    setSelectedModel(savedModel);
    if (savedKey) fetchModels(savedKey, savedModel);
  }, []);

  const fetchModels = useCallback(async (key, currentModel = '') => {
    if (!key || key.length < 10) return;
    setModelsLoading(true);
    setModelsError(null);
    setKeyValidated(false);
    try {
      const res = await fetch(`${OPENROUTER_API}/models`, {
        headers: { Authorization: `Bearer ${key}` }
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error('Invalid API key — please check and try again');
        throw new Error(`OpenRouter error: ${res.status}`);
      }
      const data = await res.json();
      const allModels = data.data || [];

      const free = allModels
        .filter(m => m.id.endsWith(':free') || (m.pricing && parseFloat(m.pricing.prompt) === 0))
        .map(m => ({ id: m.id, name: m.name || m.id, context: m.context_length || 0 }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const paid = allModels
        .filter(m => !m.id.endsWith(':free') && !(m.pricing && parseFloat(m.pricing.prompt) === 0))
        .map(m => ({
          id: m.id, name: m.name || m.id, context: m.context_length || 0,
          promptPrice: m.pricing?.prompt ? `$${(parseFloat(m.pricing.prompt) * 1000000).toFixed(2)}/M` : '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setModels({ free: free.length > 0 ? free : FALLBACK_FREE_MODELS, paid });
      setKeyValidated(true);
      if (!currentModel && free.length > 0) setSelectedModel(free[0].id);
    } catch (err) {
      setModelsError(err.message);
      setModels({ free: FALLBACK_FREE_MODELS, paid: [] });
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('anthropic_api_key', anthropicKey.trim());
    localStorage.setItem('openrouter_api_key', openRouterKey.trim());
    localStorage.setItem('monitor_api_key', monitorApiKey.trim());
    localStorage.setItem('openrouter_model', selectedModel);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    if (onSave) onSave();
  };

  const handleClear = () => {
    ['anthropic_api_key','openrouter_api_key','monitor_api_key','openrouter_model'].forEach(k => localStorage.removeItem(k));
    setAnthropicKey(''); setOpenRouterKey(''); setMonitorApiKey(''); setSelectedModel('');
    setModels({ free: [], paid: [] }); setKeyValidated(false);
  };

  const hasKeys = openRouterKey || monitorApiKey;
  const displayedModels = modelTab === 'free' ? models.free : models.paid;
  const filteredModels = displayedModels.filter(m =>
    m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
    m.id.toLowerCase().includes(modelSearch.toLowerCase())
  );

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">⚙️ Settings</h2>
      <p className="text-gray-400 text-sm mb-8">आपकी API keys सिर्फ browser में store होती हैं — server पर कभी नहीं।</p>

      {/* Anthropic Key — Primary Recommended */}
      <div className="bg-gray-800 rounded-xl p-6 mb-4 border border-blue-700">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          🧠 Anthropic API Key
          <span className="text-xs font-normal text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded">⭐ Recommended</span>
          {anthropicKey && <span className="text-xs font-normal text-green-400 bg-green-900/30 px-2 py-0.5 rounded">✅ Set</span>}
        </h3>
        <p className="text-gray-400 text-sm mb-4">
          AI Editor के लिए सबसे reliable। Free key:{' '}
          <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">console.anthropic.com</a>
        </p>
        <div className="relative">
          <input
            type={showAnthropicKey ? 'text' : 'password'}
            value={anthropicKey}
            onChange={e => setAnthropicKey(e.target.value)}
            className="w-full px-4 py-3 pr-24 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
            placeholder="sk-ant-..." autoComplete="off"
          />
          <button type="button" onClick={() => setShowAnthropicKey(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-sm px-2">
            {showAnthropicKey ? '🙈 Hide' : '👁 Show'}
          </button>
        </div>
        {anthropicKey
          ? <p className="text-green-400 text-xs mt-2">✅ Anthropic key set ({anthropicKey.length} chars) — AI Editor इसे use करेगा</p>
          : <p className="text-yellow-400 text-xs mt-2">⚠️ यह key add करने से "AI returned no content" error fix होगी</p>}
      </div>

      {/* OpenRouter Key */}
      <div className="bg-gray-800 rounded-xl p-6 mb-4 border border-gray-700">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          🤖 OpenRouter API Key
          {keyValidated && <span className="text-xs font-normal text-green-400 bg-green-900/30 px-2 py-0.5 rounded">✅ Verified</span>}
        </h3>
        <p className="text-gray-400 text-sm mb-4">
          AI analysis के लिए। Free key:{' '}
          <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">openrouter.ai</a>
        </p>
        <div className="relative">
          <input
            type={showOrKey ? 'text' : 'password'}
            value={openRouterKey}
            onChange={e => setOpenRouterKey(e.target.value)}
            onBlur={() => openRouterKey.trim().length > 10 && fetchModels(openRouterKey.trim(), selectedModel)}
            className="w-full px-4 py-3 pr-24 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
            placeholder="sk-or-v1-..." autoComplete="off"
          />
          <button type="button" onClick={() => setShowOrKey(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-sm px-2">
            {showOrKey ? '🙈 Hide' : '👁 Show'}
          </button>
        </div>
        <div className="flex items-center gap-3 mt-2">
          {openRouterKey ? <p className="text-green-400 text-xs">✅ {openRouterKey.length} chars</p>
            : <p className="text-yellow-400 text-xs">⚠️ Key के बिना AI basic mode में चलेगा</p>}
          {openRouterKey && !modelsLoading && !keyValidated && (
            <button onClick={() => fetchModels(openRouterKey.trim(), selectedModel)} className="text-xs text-blue-400 hover:underline">Verify & Fetch Models</button>
          )}
        </div>
      </div>

      {/* Model Selector */}
      {openRouterKey && (
        <div className="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
            🧠 AI Model चुनें
            {modelsLoading && <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
          </h3>
          <p className="text-gray-400 text-sm mb-4">कौन सा model AI fixes और analysis के लिए use करे।</p>

          {modelsError && (
            <div className="mb-3 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-xs">⚠️ {modelsError} — Default free models दिखाए जा रहे हैं।</div>
          )}

          <div className="flex gap-1 mb-3 bg-gray-900 rounded-lg p-1 w-fit">
            {['free','paid'].map(tab => (
              <button key={tab} onClick={() => setModelTab(tab)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  modelTab === tab ? (tab === 'free' ? 'bg-green-700 text-white' : 'bg-blue-700 text-white') : 'text-gray-400 hover:text-white'}`}>
                {tab === 'free' ? `🆓 Free (${models.free.length})` : `💳 Paid (${models.paid.length})`}
              </button>
            ))}
          </div>

          <input type="text" value={modelSearch} onChange={e => setModelSearch(e.target.value)}
            placeholder="Model search करें..." className="w-full px-3 py-2 mb-3 bg-gray-900 border border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />

          <div className="max-h-64 overflow-y-auto space-y-1 pr-1 custom-scroll">
            {modelsLoading ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                <span className="inline-block w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2" />
                Models fetch हो रहे हैं...
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-sm">कोई model नहीं मिला</div>
            ) : filteredModels.map(model => (
              <button key={model.id} onClick={() => setSelectedModel(model.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  selectedModel === model.id ? 'border-blue-500 bg-blue-900/30 text-white' : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500 hover:bg-gray-800'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm truncate mr-2">{model.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {modelTab === 'free' && <span className="text-xs bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded">Free</span>}
                    {modelTab === 'paid' && model.promptPrice && <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{model.promptPrice}</span>}
                    {model.context > 0 && <span className="text-xs text-gray-500">{(model.context/1000).toFixed(0)}K</span>}
                    {selectedModel === model.id && <span className="text-blue-400 text-xs">✓</span>}
                  </div>
                </div>
                <div className="text-xs text-gray-500 font-mono mt-0.5 truncate">{model.id}</div>
              </button>
            ))}
          </div>

          {selectedModel && (
            <div className="mt-3 p-2 bg-blue-900/20 border border-blue-800 rounded-lg text-xs text-blue-300">
              ✅ Selected: <span className="font-mono">{selectedModel}</span>
            </div>
          )}
        </div>
      )}

      {/* Monitor API Key */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-1">🔑 Monitor API Key</h3>
        <p className="text-gray-400 text-sm mb-4">Write operations protect करता है। कोई भी random string — यही app password है।</p>
        <div className="relative">
          <input type={showMonKey ? 'text' : 'password'} value={monitorApiKey}
            onChange={e => setMonitorApiKey(e.target.value)}
            className="w-full px-4 py-3 pr-24 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
            placeholder="my-secret-password-123" autoComplete="off" />
          <button type="button" onClick={() => setShowMonKey(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-sm px-2">
            {showMonKey ? '🙈 Hide' : '👁 Show'}
          </button>
        </div>
        <button type="button" onClick={() => setMonitorApiKey(Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2))}
          className="mt-2 text-xs text-blue-400 hover:text-blue-300">Generate random key</button>
        {monitorApiKey ? <p className="text-green-400 text-xs mt-2">✅ Key saved ({monitorApiKey.length} chars)</p>
          : <p className="text-red-400 text-xs mt-2">⚠️ Required — इसके बिना websites add/scan नहीं होंगी</p>}
      </div>

      <div className="bg-gray-800/50 rounded-xl p-5 mb-6 border border-gray-700 border-dashed">
        <h3 className="text-sm font-semibold mb-1 text-gray-300">ℹ️ GitHub Token</h3>
        <p className="text-gray-400 text-sm">GitHub tokens website add करते वक्त enter करें। हर repo का token अलग रहता है।</p>
      </div>

      <div className="flex gap-3">
        <button onClick={handleSave} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors">
          {saved ? '✅ Saved!' : '💾 Save Settings'}
        </button>
        {hasKeys && (
          <button onClick={handleClear} className="px-6 py-3 bg-red-900/50 hover:bg-red-900 border border-red-700 rounded-lg text-red-300 transition-colors text-sm">Clear All</button>
        )}
      </div>
      <p className="text-gray-600 text-xs mt-4 text-center">Keys browser के localStorage में हैं — refresh पर रहेंगे।</p>
    </div>
  );
}
