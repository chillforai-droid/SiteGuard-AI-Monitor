import React from 'react';

export default function WebsiteCard({ website, onSelect, onScan, scanning, onOpenEditor }) {
  const statusColors = {
    healthy: 'bg-green-500',
    issues_found: 'bg-red-500',
    pending: 'bg-yellow-500',
    scanning: 'bg-blue-500'
  };

  const statusLabels = {
    healthy: 'Healthy',
    issues_found: 'Issues Found',
    pending: 'Pending Scan',
    scanning: 'Scanning...'
  };

  const currentStatus = scanning ? 'scanning' : website.status;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden hover:border-gray-600 transition-all">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* FIX: Animate dot when scanning */}
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${statusColors[currentStatus] || 'bg-gray-500'} ${scanning ? 'animate-pulse' : ''}`} />
            <h3 className="font-semibold text-lg truncate">{website.name || website.url}</h3>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300">
              {website.framework || 'Web'}
            </span>
            {/* FIX: Show hasGithubToken indicator */}
            {website.hasGithubToken && (
              <span className="text-xs px-2 py-1 rounded bg-gray-700 text-green-400" title="GitHub token configured">
                GH ✓
              </span>
            )}
          </div>
        </div>

        <div className="text-sm text-gray-400 mb-4">
          <div className="truncate" title={website.url}>{website.url}</div>
          {website.lastScanned ? (
            <div className="mt-1">
              Last scan: {new Date(website.lastScanned).toLocaleString()}
            </div>
          ) : (
            <div className="mt-1 text-yellow-500">Never scanned</div>
          )}
          <div className={`mt-1 text-xs font-medium ${currentStatus === 'healthy' ? 'text-green-400' : currentStatus === 'issues_found' ? 'text-red-400' : 'text-yellow-400'}`}>
            {statusLabels[currentStatus] || 'Unknown'}
          </div>
        </div>

        {website.issues?.length > 0 && (
          <div className="mb-4">
            <div className="text-sm text-red-400 font-medium mb-2">
              {website.issues.length} issue{website.issues.length !== 1 ? 's' : ''} found
            </div>
            <div className="space-y-1">
              {website.issues.slice(0, 3).map((issue, i) => (
                <div key={i} className="text-xs text-red-300 truncate" title={issue.message}>
                  • {issue.message}
                </div>
              ))}
              {website.issues.length > 3 && (
                <div className="text-xs text-gray-500">+{website.issues.length - 3} more...</div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => onScan(website.id)}
            disabled={scanning}
            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm transition-colors flex items-center justify-center gap-1"
          >
            {scanning ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Scanning...
              </>
            ) : '🔍 Scan Now'}
          </button>
          <button
            onClick={() => onSelect(website)}
            className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
          >
            View Details
          </button>
          {website.hasGithubToken && onOpenEditor && (
            <button
              onClick={() => onOpenEditor(website)}
              className="px-3 py-2 bg-purple-700 hover:bg-purple-600 rounded-lg text-sm transition-colors"
              title="AI Editor"
            >
              ✏️
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
