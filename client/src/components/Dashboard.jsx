import React from 'react';
import WebsiteCard from './WebsiteCard';

export default function Dashboard({ websites, scanningIds, onSelectWebsite, onTriggerScan, onRefresh, onOpenEditor }) {
  const stats = {
    total: websites.length,
    healthy: websites.filter(w => w.status === 'healthy').length,
    issues: websites.filter(w => w.status === 'issues_found').length,
    pending: websites.filter(w => w.status === 'pending').length
  };

  return (
    <div>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="text-sm text-gray-400">Total Websites</div>
          <div className="text-3xl font-bold mt-2">{stats.total}</div>
        </div>
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="text-sm text-gray-400">Healthy</div>
          <div className="text-3xl font-bold mt-2 text-green-400">{stats.healthy}</div>
        </div>
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="text-sm text-gray-400">Issues Found</div>
          <div className="text-3xl font-bold mt-2 text-red-400">{stats.issues}</div>
        </div>
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="text-sm text-gray-400">Pending Scan</div>
          <div className="text-3xl font-bold mt-2 text-yellow-400">{stats.pending}</div>
        </div>
      </div>

      {/* Refresh button */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-gray-300">Monitored Websites</h2>
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Website Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {websites.map(website => (
          <WebsiteCard
            key={website.id}
            website={website}
            scanning={scanningIds?.has(website.id)}
            onSelect={onSelectWebsite}
            onScan={onTriggerScan}
            onOpenEditor={onOpenEditor}
          />
        ))}
      </div>

      {websites.length === 0 && (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🚀</div>
          <h3 className="text-xl font-semibold mb-2">No websites added yet</h3>
          <p className="text-gray-400">Click "+ Add Website" to start monitoring</p>
        </div>
      )}
    </div>
  );
}
