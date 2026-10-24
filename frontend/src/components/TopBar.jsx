export default function TopBar({
  sandboxId,
  activeTab,
  onTabChange,
  status,
  user,
  onLogout,
  onBackToDashboard
}) {
  const shortId = sandboxId ? sandboxId.slice(0, 8) + '…' : ''

  const statusConfig = {
    ready: { color: '#10b981', label: 'Ready', dot: true },
    loading: { color: '#f59e0b', label: 'Working…', dot: false },
    error: { color: '#ef4444', label: 'Error', dot: true },
  }
  const s = statusConfig[status] || statusConfig.ready

  return (
    <header className="flex items-center justify-between px-4 shrink-0"
      style={{
        height: '48px',
        background: 'rgba(13,20,36,0.95)',
        borderBottom: '1px solid #1e2d45',
        backdropFilter: 'blur(12px)'
      }}>

      {/* Left — Logo + Back to Dashboard + sandbox ID */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(8,145,178,0.1))', border: '1px solid rgba(34,211,238,0.3)' }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="#22d3ee">
              <rect x="1" y="1" width="6" height="6" rx="1"/>
              <rect x="9" y="1" width="6" height="6" rx="1" opacity="0.5"/>
              <rect x="1" y="9" width="6" height="6" rx="1" opacity="0.5"/>
              <rect x="9" y="9" width="6" height="6" rx="1"/>
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-wide" style={{ color: '#e2e8f0' }}>AgentSpace</span>
        </div>

        {onBackToDashboard && (
          <button
            onClick={onBackToDashboard}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200 cursor-pointer"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid #1e2d45',
              color: '#94a3b8'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(34,211,238,0.08)'
              e.currentTarget.style.borderColor = 'rgba(34,211,238,0.3)'
              e.currentTarget.style.color = '#e2e8f0'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              e.currentTarget.style.borderColor = '#1e2d45'
              e.currentTarget.style.color = '#94a3b8'
            }}
            title="Return to projects dashboard"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            <span>Projects</span>
          </button>
        )}

        {sandboxId && (
          <div className="flex items-center gap-2 px-2 py-0.5 rounded"
            style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)' }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
            <span className="text-xs font-mono" style={{ color: '#64748b' }}>
              {shortId}
            </span>
          </div>
        )}
      </div>

      {/* Center — Tab switcher */}
      <div className="flex items-center gap-1 p-1 rounded-lg"
        style={{ background: '#0a0f1e', border: '1px solid #1e2d45' }}>
        {[
          { id: 'preview', icon: '⬛', label: 'Preview' },
          { id: 'files', icon: '📄', label: 'Files' }
        ].map(tab => (
          <button key={tab.id} onClick={() => onTabChange(tab.id)}
            className="px-4 py-1 text-xs font-medium rounded-md transition-all duration-200 cursor-pointer"
            style={activeTab === tab.id ? {
              background: 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(8,145,178,0.08))',
              color: '#22d3ee',
              border: '1px solid rgba(34,211,238,0.3)'
            } : {
              color: '#475569',
              border: '1px solid transparent'
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Right — status & user & logout */}
      <div className="flex items-center gap-3">
        {/* Status */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #1e2d45' }}>
          {s.dot ? (
            <div className="w-2 h-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
          ) : (
            <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: s.color, borderTopColor: 'transparent' }} />
          )}
          <span className="text-xs" style={{ color: s.color }}>{s.label}</span>
        </div>

        {/* User profile */}
        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name || 'User'} className="w-6 h-6 rounded-full border border-cyan-500/30 object-cover" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-[10px] font-bold text-cyan-400">
                {user.name ? user.name[0].toUpperCase() : 'U'}
              </div>
            )}
            <span className="text-xs font-medium text-slate-300 hidden md:inline max-w-[120px] truncate" title={user.name || user.email}>
              {user.name || user.email}
            </span>
          </div>
        )}

        {/* Logout button */}
        {onLogout && (
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200 cursor-pointer"
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#f87171'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)'
            }}
            title="Log out"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span className="hidden sm:inline">Logout</span>
          </button>
        )}
      </div>
    </header>
  )
}
