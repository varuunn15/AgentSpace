import { useState, useEffect } from 'react'

const PARTICLES = Array.from({ length: 12 }, () => ({
  size: Math.random() * 4 + 2,
  left: Math.random() * 100,
  top: Math.random() * 100,
  duration: 2 + Math.random() * 3,
  delay: Math.random() * 2,
}))

export default function SplashScreen({ onSandboxCreated, user, onUserChange, onLogout }) {
  const [ loading, setLoading ] = useState(false)
  const [ loadingProjectId, setLoadingProjectId ] = useState(null) // id being opened
  const [ error, setError ] = useState(null)
  const [ dots, setDots ] = useState('')
  const [ title, setTitle ] = useState('')
  const [ loadingStep, setLoadingStep ] = useState('') // 'project' | 'sandbox'

  // Existing projects
  const [ projects, setProjects ] = useState([])
  const [ projectsLoading, setProjectsLoading ] = useState(true)
  const [ authRequired, setAuthRequired ] = useState(!user)

  // Fetch user and existing projects on mount
  useEffect(() => {
    let isMounted = true

    const initAuthAndProjects = async () => {
      try {
        // Step 1: Check auth session
        const authRes = await fetch('/api/auth/me', { credentials: 'include' })
        if (!authRes.ok || authRes.status === 401) {
          if (isMounted) {
            setAuthRequired(true)
            onUserChange?.(null)
          }
          return
        }

        const authData = await authRes.json()
        if (isMounted) {
          if (authData.authenticated && authData.user) {
            setAuthRequired(false)
            onUserChange?.(authData.user)
          } else {
            setAuthRequired(true)
            return
          }
        }

        // Step 2: Fetch projects
        const projRes = await fetch('/api/sandbox/project', { credentials: 'include' })
        if (projRes.status === 401) {
          if (isMounted) setAuthRequired(true)
          return
        }
        if (projRes.ok) {
          const projData = await projRes.json()
          if (isMounted) {
            setProjects(projData.projects || [])
            setAuthRequired(false)
          }
        }
      } catch {
        // Silently catch network errors
      } finally {
        if (isMounted) setProjectsLoading(false)
      }
    }

    initAuthAndProjects()

    return () => {
      isMounted = false
    }
  }, [onUserChange])

  // Handle logout
  const handleLogoutClick = async () => {
    if (onLogout) {
      await onLogout()
      return
    }
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch (err) {
      console.warn('Logout error:', err)
    }
    setProjects([])
    setAuthRequired(true)
    onUserChange?.(null)
    window.location.href = '/'
  }

  // Animated dots while loading
  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 400)
    return () => clearInterval(interval)
  }, [ loading ])

  // Start sandbox for an existing project
  const handleOpenProject = async (projectId) => {
    setLoadingProjectId(projectId)
    setError(null)
    try {
      const sandboxRes = await fetch('/api/sandbox/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ projectId })
      })
      if (sandboxRes.status === 401) {
        setAuthRequired(true)
        throw new Error('Sign in with Google before starting a project.')
      }
      if (!sandboxRes.ok) throw new Error(`Failed to start sandbox (${sandboxRes.status})`)
      const sandboxData = await sandboxRes.json()
      onSandboxCreated(sandboxData)
    } catch (err) {
      setError(err.message || 'Failed to start sandbox')
      setLoadingProjectId(null)
    }
  }

  // Create new project then start its sandbox
  const handleCreate = async () => {
    const projectTitle = title.trim()
    if (!projectTitle) {
      setError('Please enter a project name')
      return
    }
    setLoading(true)
    setError(null)
    try {
      // Step 1: Create the project
      setLoadingStep('project')
      const projectRes = await fetch('/api/sandbox/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: projectTitle })
      })
      if (projectRes.status === 401) {
        setAuthRequired(true)
        throw new Error('Sign in with Google before creating a project.')
      }
      if (!projectRes.ok) throw new Error(`Failed to create project (${projectRes.status})`)
      const projectData = await projectRes.json()
      const projectId = projectData.project._id

      // Step 2: Start the sandbox
      setLoadingStep('sandbox')
      const sandboxRes = await fetch('/api/sandbox/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ projectId })
      })
      if (sandboxRes.status === 401) {
        setAuthRequired(true)
        throw new Error('Sign in with Google before starting a project.')
      }
      if (!sandboxRes.ok) throw new Error(`Failed to start sandbox (${sandboxRes.status})`)
      const sandboxData = await sandboxRes.json()
      onSandboxCreated(sandboxData)
    } catch (err) {
      setError(err.message || 'Failed to create sandbox')
      setLoading(false)
      setLoadingStep('')
    }
  }

  const isAnyLoading = loading || loadingProjectId !== null

  return (
    <div className="relative flex flex-col items-center justify-center h-full w-full overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(34,211,238,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,211,238,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}
      />

      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(34,211,238,0.06) 0%, transparent 70%)'
        }}
      />

      {/* Floating particles */}
      {PARTICLES.map((particle, i) => (
        <div key={i}
          className="absolute rounded-full opacity-20"
          style={{
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            background: '#22d3ee',
            left: `${particle.left}%`,
            top: `${particle.top}%`,
            animation: `pulse-glow ${particle.duration}s ease-in-out infinite`,
            animationDelay: `${particle.delay}s`
          }}
        />
      ))}

      {/* Top Header User Badge / Logout (when authenticated) */}
      {!authRequired && user && (
        <div className="absolute top-4 right-4 z-20 flex items-center gap-3 px-3.5 py-1.5 rounded-full"
          style={{
            background: 'rgba(13,20,36,0.85)',
            border: '1px solid rgba(34,211,238,0.2)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
          {user.avatar ? (
            <img src={user.avatar} alt={user.name || 'User'} className="w-6 h-6 rounded-full border border-cyan-400/40 object-cover" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-400/50 flex items-center justify-center text-[11px] font-bold text-cyan-300">
              {user.name ? user.name[0].toUpperCase() : 'U'}
            </div>
          )}
          <div className="flex flex-col text-left">
            <span className="text-xs font-medium text-slate-200 leading-tight max-w-[130px] truncate">{user.name || 'User'}</span>
            <span className="text-[10px] text-slate-400 leading-tight max-w-[130px] truncate">{user.email}</span>
          </div>
          <div className="w-px h-4 bg-slate-800 mx-0.5" />
          <button
            onClick={handleLogoutClick}
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
            title="Log out of session"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Logout</span>
          </button>
        </div>
      )}

      {/* Main content card */}
      <div className="relative z-10 flex flex-col items-center gap-7 px-6 text-center animate-fadeIn w-full" style={{ maxWidth: '480px' }}>
        {/* Logo / Icon */}
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(8,145,178,0.08))',
              border: '1px solid rgba(34,211,238,0.3)',
              boxShadow: '0 0 40px rgba(34,211,238,0.2), inset 0 1px 0 rgba(255,255,255,0.05)'
            }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect x="4" y="4" width="14" height="14" rx="2" fill="#22d3ee" opacity="0.9" />
              <rect x="22" y="4" width="14" height="14" rx="2" fill="#22d3ee" opacity="0.4" />
              <rect x="4" y="22" width="14" height="14" rx="2" fill="#22d3ee" opacity="0.4" />
              <rect x="22" y="22" width="14" height="14" rx="2" fill="#22d3ee" opacity="0.9" />
            </svg>
          </div>
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
            style={{ background: '#10b981', boxShadow: '0 0 10px rgba(16,185,129,0.5)' }}>
            <div className="w-2 h-2 rounded-full bg-white" />
          </div>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-5xl font-bold tracking-tight mb-2"
            style={{
              background: 'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 50%, #22d3ee 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
            AgentSpace IDE
          </h1>
          <p className="text-base" style={{ color: '#64748b' }}>
            Spin up an isolated AI cloud workspace in seconds
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2">
          {[ 'AI-Powered', 'Live Preview', 'Terminal Access', 'Cloud Sandbox' ].map(f => (
            <span key={f} className="px-3 py-1 text-xs font-medium rounded-full"
              style={{
                background: 'rgba(34,211,238,0.08)',
                border: '1px solid rgba(34,211,238,0.2)',
                color: '#94a3b8'
              }}>
              {f}
            </span>
          ))}
        </div>

        {/* Existing projects list */}
        {!isAnyLoading && !authRequired && (
          <>
            {projectsLoading ? (
              <div className="w-full flex justify-center py-2">
                <div className="w-4 h-4 rounded-full border-2 border-t-transparent"
                  style={{ borderColor: 'rgba(34,211,238,0.4)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : projects.length > 0 && (
              <div className="w-full" style={{ maxWidth: '420px' }}>
                <p className="text-xs font-medium uppercase tracking-widest mb-3 text-left" style={{ color: '#475569' }}>
                  Recent Projects
                </p>
                <div className="flex flex-col gap-2">
                  {projects.map(project => (
                    <button
                      key={project._id}
                      onClick={() => handleOpenProject(project._id)}
                      disabled={isAnyLoading}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all duration-200 cursor-pointer group"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid #1e2d45',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(34,211,238,0.05)'
                        e.currentTarget.style.borderColor = 'rgba(34,211,238,0.25)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                        e.currentTarget.style.borderColor = '#1e2d45'
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7" rx="1"/>
                            <rect x="14" y="3" width="7" height="7" rx="1"/>
                            <rect x="3" y="14" width="7" height="7" rx="1"/>
                            <rect x="14" y="14" width="7" height="7" rx="1"/>
                          </svg>
                        </div>
                        <span className="text-sm font-medium" style={{ color: '#cbd5e1' }}>{project.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {loadingProjectId === project._id ? (
                          <div className="w-4 h-4 rounded-full border-2 border-t-transparent"
                            style={{ borderColor: '#22d3ee', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"
                            style={{ transition: 'stroke 0.2s' }}
                            className="group-hover:stroke-cyan-400">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                          </svg>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px" style={{ background: '#1e2d45' }} />
                  <span className="text-xs" style={{ color: '#334155' }}>or create new</span>
                  <div className="flex-1 h-px" style={{ background: '#1e2d45' }} />
                </div>
              </div>
            )}
          </>
        )}

        {/* Auth / Project Creation Section */}
        {!isAnyLoading ? (
          <div className="flex flex-col items-center gap-4 w-full" style={{ maxWidth: '420px' }}>
            {authRequired ? (
              <div className="w-full flex flex-col gap-3">
                <a href="/api/auth/google"
                  className="w-full py-3.5 px-5 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-3 shadow-lg group"
                  style={{
                    background: '#ffffff',
                    color: '#1f2937',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.25), 0 0 30px rgba(34,211,238,0.15)',
                    textDecoration: 'none'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-1px)'
                    e.currentTarget.style.boxShadow = '0 6px 24px rgba(34,211,238,0.3), 0 0 40px rgba(34,211,238,0.25)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.25), 0 0 30px rgba(34,211,238,0.15)'
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span className="font-semibold text-sm">Sign in with Google</span>
                </a>
                <p className="text-xs text-slate-500">Sign in to sync your sandboxes and code sessions.</p>
              </div>
            ) : (
              <>
                <div className="w-full rounded-xl overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(34,211,238,0.2)',
                    transition: 'border-color 0.2s'
                  }}
                  onFocusCapture={e => e.currentTarget.style.borderColor = 'rgba(34,211,238,0.5)'}
                  onBlurCapture={e => e.currentTarget.style.borderColor = 'rgba(34,211,238,0.2)'}
                >
                  <input
                    type="text"
                    value={title}
                    onChange={e => { setTitle(e.target.value); setError(null) }}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    placeholder="New workspace / project name…"
                    className="w-full outline-none bg-transparent px-5 py-3.5 text-sm"
                    style={{ color: '#e2e8f0', caretColor: '#22d3ee' }}
                    autoFocus={projects.length === 0}
                  />
                </div>
                <button onClick={handleCreate}
                  className="group relative w-full py-3.5 rounded-xl text-base font-semibold transition-all duration-300 cursor-pointer"
                  style={{
                    background: 'linear-gradient(135deg, #22d3ee, #0891b2)',
                    color: '#070b14',
                    boxShadow: '0 0 30px rgba(34,211,238,0.3), 0 4px 20px rgba(0,0,0,0.3)'
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 50px rgba(34,211,238,0.5), 0 4px 30px rgba(0,0,0,0.4)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 30px rgba(34,211,238,0.3), 0 4px 20px rgba(0,0,0,0.3)'}
                >
                  <span className="flex items-center justify-center gap-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Create Workspace
                  </span>
                </button>

                {/* Log out link under form */}
                <button
                  onClick={handleLogoutClick}
                  className="text-xs text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1.5 mt-2 cursor-pointer"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  <span>Sign out of current account</span>
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3 px-8 py-4 rounded-xl"
              style={{
                background: 'rgba(34,211,238,0.06)',
                border: '1px solid rgba(34,211,238,0.2)'
              }}>
              <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: '#22d3ee', borderTopColor: 'transparent' }} />
              <span className="text-sm font-medium" style={{ color: '#94a3b8' }}>
                {loadingProjectId
                  ? `Starting sandbox${dots}`
                  : loadingStep === 'project'
                    ? `Creating project${dots}`
                    : `Starting sandbox${dots}`}
              </span>
            </div>
            <p className="text-xs" style={{ color: '#475569' }}>
              {loadingProjectId
                ? 'Spinning up your isolated environment…'
                : loadingStep === 'project'
                  ? 'Registering your project…'
                  : 'Spinning up your isolated environment…'}
            </p>
          </div>
        )}

        {error && (
          <div className="px-5 py-3 rounded-lg text-sm w-full"
            style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#fca5a5'
            }}>
            ⚠ {error}
          </div>
        )}
      </div>

      {/* Bottom brand */}
      <div className="absolute bottom-6 text-xs" style={{ color: '#334155' }}>
        AgentSpace • AI-Powered Fullstack Runtime • AWS Cloud
      </div>
    </div>
  )
}
