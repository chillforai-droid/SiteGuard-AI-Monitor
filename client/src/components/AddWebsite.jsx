import React, { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function getApiKey() {
  return localStorage.getItem('monitor_api_key') || '';
}

export default function AddWebsite({ onAdd }) {
  const [form, setForm] = useState({
    name: '',
    url: '',
    githubRepo: '',
    githubToken: '',
    framework: 'react',
    buildCommand: 'npm run build',
    deployProvider: 'vercel'
  });
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  };

  // FIX: Wrapped in try/catch with loading state
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/websites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getApiKey() ? { 'x-api-key': getApiKey() } : {})
        },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add website');
        return;
      }
      onAdd();
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // FIX: Wrapped in try/catch with loading state
  const verifyWebsite = async () => {
    if (!form.url) return;
    setVerifying(true);
    setVerified(null);
    try {
      const res = await fetch(`${API_BASE}/api/websites/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: form.url })
      });
      const data = await res.json();
      setVerified(data);
    } catch (err) {
      setVerified({ accessible: false, error: `Network error: ${err.message}` });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Add New Website</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Website Name *</label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="My Website"
            required
            maxLength={100}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Website URL *</label>
          <div className="flex gap-2">
            <input
              type="url"
              name="url"
              value={form.url}
              onChange={handleChange}
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="https://example.com"
              required
            />
            <button
              type="button"
              onClick={verifyWebsite}
              disabled={verifying || !form.url}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {verifying ? '...' : 'Verify'}
            </button>
          </div>
          {verified && (
            <div className={`mt-2 text-sm ${verified.accessible ? 'text-green-400' : 'text-red-400'}`}>
              {verified.accessible ? '✅' : '❌'} {verified.message || verified.error}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">GitHub Repository URL</label>
          <input
            type="url"
            name="githubRepo"
            value={form.githubRepo}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="https://github.com/username/repo"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">GitHub Token</label>
          <input
            type="password"
            name="githubToken"
            value={form.githubToken}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="ghp_..."
            autoComplete="new-password"
          />
          <p className="text-xs text-gray-500 mt-1">
            Needs <code>repo</code> scope for auto-fix feature. Stored securely and never shown again.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Framework</label>
            <select
              name="framework"
              value={form.framework}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg outline-none"
            >
              <option value="react">React</option>
              <option value="vite">Vite</option>
              <option value="nextjs">Next.js</option>
              <option value="nodejs">Node.js</option>
              <option value="express">Express</option>
              <option value="static">Static</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Deploy Provider</label>
            <select
              name="deployProvider"
              value={form.deployProvider}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg outline-none"
            >
              <option value="vercel">Vercel</option>
              <option value="netlify">Netlify</option>
              <option value="render">Render</option>
              <option value="railway">Railway</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Build Command</label>
          <select
            name="buildCommand"
            value={form.buildCommand}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg outline-none"
          >
            <option value="npm run build">npm run build</option>
            <option value="yarn build">yarn build</option>
            <option value="pnpm build">pnpm build</option>
            <option value="next build">next build</option>
            <option value="npx vite build">npx vite build</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Adding...
            </>
          ) : '+ Add Website'}
        </button>
      </form>
    </div>
  );
}
