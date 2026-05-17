import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function ScanResults({ website, onSelectScan, onBack }) {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // FIX: Wrapped in try/catch with loading state
  const fetchScans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/scans/${website.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setScans(data);
    } catch (err) {
      setError(`Failed to load scans: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [website.id]);

  useEffect(() => {
    fetchScans();
  }, [fetchScans]);

  const scoreColor = (value) => {
    if (value >= 80) return 'text-green-400';
    if (value >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div>
      <button onClick={onBack} className="mb-6 text-blue-400 hover:underline">
        ← Back to Dashboard
      </button>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{website.name || website.url}</h2>
          <div className="text-gray-400 mt-1">{website.url}</div>
        </div>
        <button
          onClick={fetchScans}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <span className="inline-block w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-3" />
          <span className="text-gray-400">Loading scans...</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-900/40 border border-red-700 rounded-lg text-red-300 mb-6">
          ⚠️ {error}
        </div>
      )}

      {!loading && !error && scans.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-4">🔍</div>
          No scans yet. Go back and click "Scan Now" to start monitoring.
        </div>
      )}

      {/* Latest Scan Summary */}
      {!loading && scans[0] && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-8">
          <h3 className="text-lg font-semibold mb-4">Latest Scan</h3>
          <div className="text-xs text-gray-500 mb-4">
            {new Date(scans[0].timestamp).toLocaleString()}
          </div>

          {scans[0].lighthouse?.scores && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {Object.entries(scans[0].lighthouse.scores).map(([key, value]) => (
                <div key={key} className="text-center bg-gray-900 rounded-lg p-3">
                  <div className={`text-2xl font-bold ${scoreColor(value)}`}>
                    {Math.round(value)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {scans[0].errors?.length > 0 && (
            <div className="mb-4">
              <div className="text-red-400 font-medium mb-2">
                {scans[0].errors.length} Error{scans[0].errors.length !== 1 ? 's' : ''}
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {scans[0].errors.map((error, i) => (
                  <div key={i} className="bg-red-900/20 p-3 rounded-lg text-sm">
                    <span className="font-medium text-red-400">{error.type}:</span>{' '}
                    <span className="text-gray-300">{error.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scans[0].warnings?.length > 0 && (
            <div>
              <div className="text-yellow-400 font-medium mb-2">
                {scans[0].warnings.length} Warning{scans[0].warnings.length !== 1 ? 's' : ''}
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {scans[0].warnings.slice(0, 5).map((w, i) => (
                  <div key={i} className="text-sm text-yellow-300">• {w.message}</div>
                ))}
                {scans[0].warnings.length > 5 && (
                  <div className="text-xs text-gray-500">+{scans[0].warnings.length - 5} more warnings</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scan History */}
      {!loading && scans.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Scan History</h3>
          <div className="space-y-4">
            {scans.map(scan => (
              <div
                key={scan.id}
                className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors"
                onClick={() => onSelectScan(scan)}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-400">
                    {new Date(scan.timestamp).toLocaleString()}
                  </span>
                  <div className="flex items-center gap-2">
                    {scan.errors?.length > 0 && (
                      <span className="px-2 py-1 bg-red-900/50 text-red-400 text-xs rounded">
                        {scan.errors.length} errors
                      </span>
                    )}
                    {scan.warnings?.length > 0 && (
                      <span className="px-2 py-1 bg-yellow-900/50 text-yellow-400 text-xs rounded">
                        {scan.warnings.length} warnings
                      </span>
                    )}
                    {scan.fixed && (
                      <span className="px-2 py-1 bg-green-900/50 text-green-400 text-xs rounded">
                        Fixed ✓
                      </span>
                    )}
                  </div>
                </div>

                {scan.aiAnalysis?.summary && (
                  <p className="text-sm text-gray-300 line-clamp-2">
                    {scan.aiAnalysis.summary}
                  </p>
                )}

                <div className="mt-2 text-xs text-blue-400">Click to view AI analysis →</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
