// app.js — ABOS Core App Logic, Routing, State

// State
let currentRoute = 'dashboard';
let currentAgentId = null;
let sidebarCollapsed = false;
let sidebarMobileOpen = false;
let memoryPanelOpen = false;
let memoryActiveTab = 'memory'; // 'memory' | 'history'
let currentTheme = 'dark';
let selectedModel = 'claude-3.5-sonnet';
let isTyping = false;
let currentStreamReader = null; // For cancelling active streams
let artifactsPanelOpen = false;
let artifactsActiveTab = 'all'; // 'all' | 'uploaded' | 'generated'
let previewPanelOpen = false;
let previewCurrentFile = null; // { name, content } of file being previewed
let pendingFiles = [];
let fileCache = {}; // agentId -> [file objects]

// AI Configuration state
const aiConfig = {
  openrouterKey: '',
  openaiKey: '',
  anthropicKey: '',
  googleKey: '',
  xaiKey: '',
  deepseekKey: '',
  defaultModel: 'claude-3.5-sonnet',
  temperature: 0.7,
  maxTokens: 4096,
  perAgentModels: {},
  opencodeUrl: '',
  opencodeUsername: '',
  opencodePassword: '',
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Set dark mode as default
  document.documentElement.setAttribute('data-theme', 'dark');
  
  // Initialize memory store — start async, but don't block UI
  // First do synchronous seed so UI renders immediately
  MemoryStore._seedDefaultsLocal();
  MemoryStore.activityFeed = generateInitialActivity();
  MemoryStore._initialized = true;
  
  // Build sidebar
  renderSidebar();
  
  // Handle routing
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
  
  // Listen for preview iframe navigation requests (inter-page links)
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'preview-navigate' && e.data.file) {
      // Resolve the file path (strip leading ./ or /)
      let targetFile = e.data.file.replace(/^\.?\//, '');
      // Strip query strings and hash
      targetFile = targetFile.split('?')[0].split('#')[0];
      if (targetFile && currentAgentId) {
        previewFile(currentAgentId, targetFile);
        // Update tab highlighting
        document.querySelectorAll('.preview-file-tab').forEach(t => {
          t.classList.toggle('active', t.textContent === targetFile);
        });
      }
    }
  });
  
  // Now load from backend in background (non-blocking)
  MemoryStore._loadFromBackend().then(() => {
    applyLoadedSettings(MemoryStore.settings);
    // Re-render current view if needed to show persisted data
    renderContent();
    renderSidebar();
  }).catch(() => {
    // Backend unavailable — fine, we're already showing defaults
  });
});

function applyLoadedSettings(settings) {
  if (!settings || typeof settings !== 'object') return;
  if (settings.openrouterKey) aiConfig.openrouterKey = settings.openrouterKey;
  if (settings.openaiKey) aiConfig.openaiKey = settings.openaiKey;
  if (settings.anthropicKey) aiConfig.anthropicKey = settings.anthropicKey;
  if (settings.googleKey) aiConfig.googleKey = settings.googleKey;
  if (settings.xaiKey) aiConfig.xaiKey = settings.xaiKey;
  if (settings.deepseekKey) aiConfig.deepseekKey = settings.deepseekKey;
  if (settings.defaultModel) aiConfig.defaultModel = settings.defaultModel;
  if (settings.temperature !== undefined) aiConfig.temperature = parseFloat(settings.temperature);
  if (settings.maxTokens !== undefined) aiConfig.maxTokens = parseInt(settings.maxTokens);
  if (settings.perAgentModels) {
    try {
      aiConfig.perAgentModels = typeof settings.perAgentModels === 'string' ? JSON.parse(settings.perAgentModels) : settings.perAgentModels;
    } catch(e) { aiConfig.perAgentModels = {}; }
  }
  if (settings.opencodeUrl) aiConfig.opencodeUrl = settings.opencodeUrl;
  if (settings.opencodeUsername) aiConfig.opencodeUsername = settings.opencodeUsername;
  if (settings.opencodePassword) aiConfig.opencodePassword = settings.opencodePassword;
  // OpenCode credentials are used server-side via CGI proxy — no browser-side configure needed
  if (settings.theme) {
    currentTheme = settings.theme;
    document.documentElement.setAttribute('data-theme', currentTheme);
  }
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  const parts = hash.split('/');
  
  if (parts[0] === 'agent' && parts[1]) {
    currentRoute = 'agent';
    currentAgentId = parts[1];
  } else {
    currentRoute = parts[0] || 'dashboard';
    currentAgentId = null;
  }
  
  // Update active sidebar item
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.toggle('active', item.dataset.route === hash || item.dataset.route === (parts[0] === 'agent' ? `agent/${parts[1]}` : parts[0]));
  });
  
  renderContent();
}

function navigate(route) {
  window.location.hash = route;
}

function handleKeyboard(e) {
  // Cmd/Ctrl + K for search focus
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    const search = document.querySelector('.header-search input');
    if (search) search.focus();
  }
}

// ============================================
// SIDEBAR
// ============================================
function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <a class="sidebar-logo" href="#dashboard" onclick="navigate('dashboard')">
        ${getLogoSVG(24)}
        <span>ABOS</span>
      </a>
      <button class="sidebar-collapse-btn" onclick="toggleSidebar()" title="Collapse sidebar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 19l-7-7 7-7"/><path d="M18 19V5"/></svg>
      </button>
    </div>
    <nav class="sidebar-nav">
      <div class="sidebar-section">
        <div class="sidebar-section-label">Command Center</div>
        <a class="sidebar-item" data-route="dashboard" onclick="navigate('dashboard')">
          <span class="sidebar-item-icon">⚡</span>
          <span class="sidebar-item-text">Dashboard</span>
        </a>
        <a class="sidebar-item" data-route="activity" onclick="navigate('activity')">
          <span class="sidebar-item-icon">📋</span>
          <span class="sidebar-item-text">Activity Feed</span>
        </a>
        <a class="sidebar-item" data-route="blueprint" onclick="navigate('blueprint')">
          <span class="sidebar-item-icon">🗺️</span>
          <span class="sidebar-item-text">Blueprint Creator</span>
        </a>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-label">AI Agents</div>
        ${AgentDefs.map(agent => `
          <a class="sidebar-item" data-route="agent/${agent.id}" onclick="navigate('agent/${agent.id}')">
            <span class="sidebar-item-icon">${agent.icon}</span>
            <span class="sidebar-item-text">${agent.name}</span>
            <span class="status-dot ${AgentStatusData[agent.id]?.status || 'offline'}"></span>
          </a>
        `).join('')}
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-label">Settings</div>
        <a class="sidebar-item" data-route="ai-config" onclick="navigate('ai-config')">
          <span class="sidebar-item-icon">⚙️</span>
          <span class="sidebar-item-text">AI Configuration</span>
        </a>
        <a class="sidebar-item" data-route="memory-page" onclick="navigate('memory-page')">
          <span class="sidebar-item-icon">🧠</span>
          <span class="sidebar-item-text">Memory & Context</span>
        </a>
        <a class="sidebar-item" data-route="integrations" onclick="navigate('integrations')">
          <span class="sidebar-item-icon">🔌</span>
          <span class="sidebar-item-text">Integrations</span>
        </a>
        <a class="sidebar-item" data-route="account" onclick="navigate('account')">
          <span class="sidebar-item-icon">👤</span>
          <span class="sidebar-item-text">Account</span>
        </a>
      </div>
    </nav>
    <div class="sidebar-bottom">
      <a class="sidebar-item" onclick="toggleTheme()">
        <span class="sidebar-item-icon" id="theme-icon">${currentTheme === 'dark' ? '☀️' : '🌙'}</span>
        <span class="sidebar-item-text" id="theme-text">${currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
      </a>
    </div>
  `;
}

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  document.querySelector('.app').classList.toggle('sidebar-collapsed', sidebarCollapsed);
}

function toggleMobileSidebar() {
  sidebarMobileOpen = !sidebarMobileOpen;
  document.getElementById('sidebar').classList.toggle('mobile-open', sidebarMobileOpen);
  document.getElementById('mobile-overlay').classList.toggle('visible', sidebarMobileOpen);
}

function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  const icon = document.getElementById('theme-icon');
  const text = document.getElementById('theme-text');
  if (icon) icon.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
  if (text) text.textContent = currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
  // Persist theme
  MemoryStore.saveSettings({ theme: currentTheme });
}

// ============================================
// CONTENT RENDERER
// ============================================
function renderContent() {
  const main = document.getElementById('main-content');
  if (!main) return;
  
  // Reset overflow (chat sets it to hidden)
  main.style.overflow = '';
  
  // Close mobile sidebar on navigation
  if (sidebarMobileOpen) toggleMobileSidebar();
  
  switch(currentRoute) {
    case 'dashboard': renderDashboard(main); break;
    case 'activity': renderActivityPage(main); break;
    case 'blueprint': renderBlueprintCreator(main); break;
    case 'agent': renderAgentChat(main); break;
    case 'ai-config': renderAIConfig(main); break;
    case 'memory-page': renderMemoryPage(main); break;
    case 'integrations': renderIntegrationsPage(main); break;
    case 'account': renderAccountPage(main); break;
    default: renderDashboard(main);
  }
}

// ============================================
// DASHBOARD
// ============================================
function renderDashboard(container) {
  const kpis = DashboardData.kpis;
  const activities = MemoryStore.getActivities().slice(0, 8);
  
  container.innerHTML = `
    <div class="main-content">
      <div class="page-header">
        <h1 class="page-title">Command Center</h1>
        <p class="page-desc">Overview of all autonomous agents and business operations</p>
      </div>
      
      <!-- KPI Cards -->
      <div class="kpi-grid">
        ${kpis.map(kpi => `
          <div class="kpi-card">
            <div class="kpi-label">${kpi.label}</div>
            <div class="kpi-value">${kpi.value}</div>
            <div class="kpi-delta ${kpi.deltaType}">${kpi.delta}</div>
          </div>
        `).join('')}
      </div>
      
      <!-- Agent Status Grid -->
      <div class="section-header">
        <div>
          <h2 class="section-title">Agent Status</h2>
          <p class="section-subtitle">${AgentDefs.length} agents configured — ${Object.values(AgentStatusData).filter(a => a.status === 'active').length} active</p>
        </div>
      </div>
      <div class="agent-grid">
        ${AgentDefs.map(agent => {
          const statusData = AgentStatusData[agent.id] || {};
          return `
            <div class="agent-card" onclick="navigate('agent/${agent.id}')">
              <div class="agent-card-top">
                <div class="agent-icon">${agent.icon}</div>
                <div class="agent-card-info">
                  <div class="agent-card-name">${agent.name}</div>
                  <div class="agent-card-status">
                    <span class="status-dot ${statusData.status || 'offline'}" style="width:6px;height:6px;border-radius:50%;display:inline-block;"></span>
                    ${(statusData.status || 'offline').charAt(0).toUpperCase() + (statusData.status || 'offline').slice(1)} · ${agent.model}
                  </div>
                </div>
              </div>
              <div class="agent-card-last-action">${agent.lastAction} · ${agent.lastActionTime}</div>
              <button class="agent-card-open" onclick="event.stopPropagation(); navigate('agent/${agent.id}')">Open</button>
            </div>
          `;
        }).join('')}
      </div>
      
      <!-- Two column: Activity + Chart -->
      <div class="dashboard-bottom-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:var(--space-4); margin-top:var(--space-2);">
        <!-- Recent Activity -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Recent Activity</span>
            <button class="btn btn-sm btn-ghost" onclick="navigate('activity')">View All</button>
          </div>
          <div class="activity-list">
            ${activities.map(act => `
              <div class="activity-item">
                <div class="activity-icon">${act.agentIcon}</div>
                <div class="activity-content">
                  <div class="activity-text"><strong>${act.agentName}</strong> ${act.description}</div>
                  <div class="activity-meta">${formatTimeAgo(act.timestamp)}</div>
                </div>
                <span class="activity-status ${act.status}">${act.status}</span>
              </div>
            `).join('')}
          </div>
        </div>
        
        <!-- Model Usage Chart -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Model Usage (Tokens)</span>
            <span class="text-xs text-muted">Last 7 days</span>
          </div>
          <div class="card-body">
            <div class="chart-container">
              <canvas id="model-usage-chart"></canvas>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Render chart
  requestAnimationFrame(() => initModelUsageChart());
}

function initModelUsageChart() {
  const canvas = document.getElementById('model-usage-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  
  const ctx = canvas.getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: DashboardData.modelUsage.labels,
      datasets: [{
        data: DashboardData.modelUsage.data,
        backgroundColor: DashboardData.modelUsage.colors,
        borderRadius: 4,
        borderSkipped: false,
        barThickness: 28,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--color-surface-2').trim() || '#1a1a25',
          titleColor: '#e8e8f0',
          bodyColor: '#8888a0',
          borderColor: '#2a2a3a',
          borderWidth: 1,
          cornerRadius: 6,
          padding: 10,
          callbacks: {
            label: ctx => ctx.parsed.y.toLocaleString() + ' tokens'
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { 
            color: '#555570',
            font: { size: 10, family: 'Inter' },
            maxRotation: 45,
          },
          border: { display: false }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { 
            color: '#555570',
            font: { size: 10, family: 'Inter' },
            callback: v => (v/1000) + 'K'
          },
          border: { display: false }
        }
      }
    }
  });
}

// ============================================
// ACTIVITY PAGE
// ============================================
function renderActivityPage(container) {
  const activities = MemoryStore.getActivities();
  
  container.innerHTML = `
    <div class="main-content">
      <div class="page-header">
        <h1 class="page-title">Activity Feed</h1>
        <p class="page-desc">Complete log of all agent actions and system events</p>
      </div>
      
      <div class="filter-bar">
        <select id="activity-agent-filter" onchange="filterActivities()">
          <option value="">All Agents</option>
          ${AgentDefs.map(a => `<option value="${a.id}">${a.icon} ${a.name}</option>`).join('')}
        </select>
        <select id="activity-status-filter" onchange="filterActivities()">
          <option value="">All Status</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="pending">Pending</option>
        </select>
      </div>
      
      <div class="card">
        <div class="activity-list" id="activity-list">
          ${activities.map(act => renderActivityItem(act)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderActivityItem(act) {
  return `
    <div class="activity-item" data-agent="${act.agentId}" data-status="${act.status}">
      <div class="activity-icon">${act.agentIcon}</div>
      <div class="activity-content">
        <div class="activity-text"><strong>${act.agentName}</strong> ${act.description}</div>
        <div class="activity-meta">${formatTimeAgo(act.timestamp)} · ${act.type}</div>
      </div>
      <span class="activity-status ${act.status}">${act.status}</span>
    </div>
  `;
}

function filterActivities() {
  const agentFilter = document.getElementById('activity-agent-filter')?.value;
  const statusFilter = document.getElementById('activity-status-filter')?.value;
  
  document.querySelectorAll('#activity-list .activity-item').forEach(item => {
    const matchAgent = !agentFilter || item.dataset.agent === agentFilter;
    const matchStatus = !statusFilter || item.dataset.status === statusFilter;
    item.style.display = (matchAgent && matchStatus) ? '' : 'none';
  });
}

// ============================================
// AGENT CHAT
// ============================================
function renderAgentChat(container) {
  const agent = AgentDefs.find(a => a.id === currentAgentId);
  if (!agent) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🤖</div><div class="empty-state-text">Agent not found</div></div>';
    container.style.overflow = '';
    return;
  }
  // Disable main scroll for chat view — chat messages handle their own scroll
  container.style.overflow = 'hidden';
  
  const statusData = AgentStatusData[agent.id] || {};
  const messages = MemoryStore.getMessages(agent.id);
  const memories = MemoryStore.getMemories(agent.id);
  const sessions = MemoryStore.getSessions(agent.id);
  const hasApiKey = !!aiConfig.openrouterKey;
  
  container.innerHTML = `
    <style>
      .chat-upload-btn { background:none; border:none; color:var(--color-text-faint); cursor:pointer; padding:6px; border-radius:var(--radius-md,8px); transition:all 0.15s; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      .chat-upload-btn:hover { color:var(--color-primary); background:var(--color-primary-muted,rgba(0,212,170,0.1)); }
      .chat-file-preview { display:flex; gap:8px; padding:8px 12px; flex-wrap:wrap; border-top:1px solid var(--color-border-subtle); background:var(--color-surface-2,var(--color-bg)); }
      .file-preview-item { background:var(--color-surface-raised,var(--color-surface-2)); border:1px solid var(--color-border-subtle); border-radius:8px; padding:5px 10px; display:flex; align-items:center; gap:6px; font-size:11px; color:var(--color-text-muted); max-width:220px; }
      .file-preview-remove { cursor:pointer; opacity:0.4; font-size:14px; margin-left:2px; transition:opacity 0.15s; line-height:1; }
      .file-preview-remove:hover { opacity:1; color:var(--color-error,#ef4444); }
      .chat-drop-overlay { position:absolute; inset:0; background:rgba(0,212,170,0.08); border:2px dashed var(--color-primary); z-index:100; display:flex; align-items:center; justify-content:center; border-radius:var(--radius-md,8px); pointer-events:none; }
      .drop-overlay-content { display:flex; flex-direction:column; align-items:center; gap:8px; color:var(--color-primary); font-size:14px; font-weight:600; }
      .file-chip { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:6px; font-size:11px; cursor:pointer; margin-top:6px; margin-right:4px; transition:all 0.15s; text-decoration:none; }
      .file-chip:hover { filter:brightness(1.2); transform:translateY(-1px); }
      .file-chip.upload { background:var(--color-primary-muted,rgba(0,212,170,0.12)); color:var(--color-primary); }
      .file-chip.generated { background:var(--color-surface-raised,var(--color-surface-2)); border:1px solid var(--color-border-subtle); color:var(--color-text-muted); }
      .artifacts-panel { width:300px; min-width:260px; border-left:1px solid var(--color-border-subtle); display:flex; flex-direction:column; background:var(--color-surface-1,var(--color-bg)); overflow:hidden; }
      .artifacts-panel-header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--color-border-subtle); }
      .artifacts-panel-title { font-size:13px; font-weight:700; color:var(--color-text); }
      .artifacts-count { font-size:10px; color:var(--color-text-faint); margin-left:8px; }
      .artifacts-tabs { display:flex; border-bottom:1px solid var(--color-border-subtle); padding:0 12px; }
      .artifacts-tab { background:none; border:none; padding:8px 12px; font-size:11px; font-weight:600; color:var(--color-text-faint); cursor:pointer; border-bottom:2px solid transparent; transition:all 0.15s; font-family:inherit; }
      .artifacts-tab:hover { color:var(--color-text-muted); }
      .artifacts-tab.active { color:var(--color-primary); border-bottom-color:var(--color-primary); }
      .artifacts-list { flex:1; overflow-y:auto; }
      .artifact-item { display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid var(--color-border-subtle); cursor:pointer; transition:background 0.15s; }
      .artifact-item:hover { background:var(--color-surface-raised,var(--color-surface-2)); }
      .artifact-icon { font-size:18px; flex-shrink:0; }
      .artifact-info { flex:1; min-width:0; }
      .artifact-name { font-size:12px; font-weight:600; color:var(--color-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .artifact-meta { font-size:10px; color:var(--color-text-faint); margin-top:2px; }
      .artifact-download, .artifact-delete { background:none; border:none; color:var(--color-text-faint); cursor:pointer; padding:4px; border-radius:4px; transition:all 0.15s; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      .artifact-download:hover { color:var(--color-primary); }
      .artifact-delete:hover { color:var(--color-error,#ef4444); }
      .artifacts-actions { padding:12px; border-top:1px solid var(--color-border-subtle); }
      .artifacts-actions .btn { width:100%; }
      @media (max-width: 768px) {
        .artifacts-panel { position:absolute; right:0; top:0; bottom:0; z-index:50; width:280px; box-shadow:-4px 0 20px rgba(0,0,0,0.3); }
        .preview-panel { position:absolute; right:0; top:0; bottom:0; z-index:50; box-shadow:-4px 0 20px rgba(0,0,0,0.3); }
      }
      /* Preview Panel */
      .preview-panel { flex:1; min-width:320px; max-width:60%; border-left:1px solid var(--color-border-subtle); display:flex; flex-direction:column; background:var(--color-surface-1,var(--color-bg)); overflow:hidden; }
      .preview-panel-header { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-bottom:1px solid var(--color-border-subtle); gap:8px; }
      .preview-panel-title { font-size:13px; font-weight:700; color:var(--color-text); white-space:nowrap; }
      .preview-file-tabs { display:flex; gap:2px; flex:1; overflow-x:auto; padding:0 4px; }
      .preview-file-tab { background:none; border:1px solid transparent; padding:4px 10px; font-size:11px; font-weight:600; color:var(--color-text-faint); cursor:pointer; border-radius:6px; transition:all 0.15s; font-family:inherit; white-space:nowrap; }
      .preview-file-tab:hover { color:var(--color-text-muted); background:var(--color-surface-2); }
      .preview-file-tab.active { color:var(--color-primary); background:rgba(0,212,170,0.1); border-color:rgba(0,212,170,0.2); }
      .preview-iframe-wrap { flex:1; position:relative; background:#fff; }
      .preview-iframe-wrap iframe { width:100%; height:100%; border:none; }
      .preview-loading { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:var(--color-surface-1); color:var(--color-text-muted); font-size:13px; }
      .preview-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--color-text-faint); gap:12px; padding:40px; text-align:center; }
      .preview-empty-icon { font-size:36px; }
      .preview-empty-text { font-size:13px; line-height:1.6; }
      .preview-toolbar { display:flex; align-items:center; gap:6px; padding:8px 12px; border-top:1px solid var(--color-border-subtle); background:var(--color-surface-2); }
      .preview-toolbar .btn { font-size:11px; padding:4px 10px; }
    </style>
    <div class="chat-layout ${memoryPanelOpen ? 'memory-open' : ''} ${artifactsPanelOpen ? 'artifacts-open' : ''} ${previewPanelOpen ? 'preview-open' : ''}" id="chat-layout">
      <div class="chat-container">
        <!-- Chat Header -->
        <div class="chat-header">
          <div class="chat-agent-icon">${agent.icon}</div>
          <div class="chat-agent-info">
            <div class="chat-agent-name">${agent.name}</div>
            <div class="chat-agent-status-bar">
              <span class="dot" style="background:var(--color-${statusData.status === 'active' ? 'success' : statusData.status === 'idle' ? 'warning' : 'text-faint'})"></span>
              <span>${(statusData.status || 'offline').charAt(0).toUpperCase() + (statusData.status || 'offline').slice(1)}</span>
              <span class="model-tag">${aiConfig.perAgentModels[agent.id] || aiConfig.defaultModel || agent.model}</span>
              <span style="color:var(--color-text-faint)">${messages.length} messages</span>
            </div>
          </div>
          <div class="chat-header-actions">
            <button class="header-btn" onclick="startNewSession('${agent.id}')" title="New Session">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            </button>
            ${agent.backend === 'opencode' ? `
            <button class="header-btn ${previewPanelOpen ? 'text-primary' : ''}" onclick="togglePreviewPanel('${agent.id}')" title="Toggle Preview">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </button>
            ` : ''}
            <button class="header-btn ${artifactsPanelOpen ? 'text-primary' : ''}" onclick="toggleArtifactsPanel()" title="Toggle Artifacts">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </button>
            <button class="header-btn ${memoryPanelOpen ? 'text-primary' : ''}" onclick="toggleMemoryPanel()" title="Toggle Memory">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 6v6l4 2"/></svg>
            </button>
          </div>
        </div>
        
        ${!hasApiKey ? `
        <div class="demo-mode-banner" style="background:var(--color-warning-muted, rgba(251,191,36,0.1));border-bottom:1px solid var(--color-border-subtle);padding:6px 16px;font-size:11px;color:var(--color-warning, #fbbf24);display:flex;align-items:center;gap:8px;">
          <span>⚠️</span>
          <span>Running in demo mode — <a href="#ai-config" style="color:var(--color-primary);text-decoration:underline;cursor:pointer;">configure your API key</a> for real AI responses</span>
        </div>
        ` : ''}
        
        <!-- Quick Actions -->
        <div class="quick-actions">
          ${agent.quickActions.map(action => `
            <button class="quick-action-btn" onclick="sendQuickAction('${agent.id}', '${action}')">${action}</button>
          `).join('')}
        </div>
        
        <!-- Messages -->
        <div class="chat-messages" id="chat-messages">
          ${messages.map((msg, i) => renderMessage(msg, agent, i)).join('')}
        </div>
        
        <!-- Input -->
        <div class="chat-input-area">
          <div class="chat-input-wrapper">
            <input type="file" id="file-upload-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.tsv,.txt,.md,.json,.xml,.html,.css,.js,.py,.sql,.yaml,.yml,.png,.jpg,.jpeg,.gif,.svg,.webp" style="display:none" onchange="handleFileUpload(event, '${agent.id}')">
            <button class="chat-upload-btn" onclick="document.getElementById('file-upload-input').click()" title="Upload files">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.49"/></svg>
            </button>
            <textarea class="chat-input" id="chat-input" 
              placeholder="Message ${agent.name}..." 
              rows="1"
              onkeydown="handleChatKeydown(event, '${agent.id}')"
              oninput="autoResize(this)"></textarea>
            <button class="chat-send-btn" onclick="sendMessage('${agent.id}')" id="send-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>
            </button>
          </div>
          <div class="chat-file-preview" id="chat-file-preview" style="display:none;"></div>
        </div>
      </div>
      
      <!-- Memory Panel -->
      ${memoryPanelOpen ? `
      <div class="memory-panel" id="memory-panel">
        <div class="memory-panel-header">
          <span class="memory-panel-title">Context</span>
          <button class="header-btn" onclick="toggleMemoryPanel()" style="width:24px;height:24px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="memory-tabs">
          <button class="memory-tab ${memoryActiveTab === 'memory' ? 'active' : ''}" onclick="switchMemoryTab('memory')">Memory</button>
          <button class="memory-tab ${memoryActiveTab === 'history' ? 'active' : ''}" onclick="switchMemoryTab('history')">History</button>
        </div>
        <div class="memory-content" id="memory-content">
          ${memoryActiveTab === 'memory' ? renderMemoryEntries(agent.id, memories) : renderSessionHistory(agent.id, sessions)}
        </div>
        ${memoryActiveTab === 'memory' ? `
        <div style="padding:var(--space-2) var(--space-3); border-top:1px solid var(--color-border-subtle);">
          <button class="btn btn-sm btn-secondary w-full" onclick="showAddMemoryDialog('${agent.id}')">+ Add Memory</button>
        </div>
        ` : ''}
      </div>
      ` : ''}
      
      <!-- Artifacts Panel -->
      ${artifactsPanelOpen ? `
      <div class="artifacts-panel" id="artifacts-panel">
        <div class="artifacts-panel-header">
          <div style="display:flex;align-items:center;">
            <span class="artifacts-panel-title">Artifacts</span>
            <span class="artifacts-count" id="artifacts-count">0 files</span>
          </div>
          <button class="header-btn" onclick="toggleArtifactsPanel()" style="width:24px;height:24px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="artifacts-tabs">
          <button class="artifacts-tab ${artifactsActiveTab === 'all' ? 'active' : ''}" data-tab="all" onclick="switchArtifactsTab('all')">All</button>
          <button class="artifacts-tab ${artifactsActiveTab === 'uploaded' ? 'active' : ''}" data-tab="uploaded" onclick="switchArtifactsTab('uploaded')">Uploaded</button>
          <button class="artifacts-tab ${artifactsActiveTab === 'generated' ? 'active' : ''}" data-tab="generated" onclick="switchArtifactsTab('generated')">Generated</button>
        </div>
        <div class="artifacts-list" id="artifacts-list">
          <div style="text-align:center;padding:var(--space-6);color:var(--color-text-faint);font-size:var(--text-xs);">Loading...</div>
        </div>
        <div class="artifacts-actions">
          <button class="btn btn-sm btn-secondary w-full" onclick="downloadAllArtifacts('${agent.id}')">Download All</button>
        </div>
      </div>
      ` : ''}
      
      <!-- Preview Panel (OpenCode agents only) -->
      ${previewPanelOpen && agent.backend === 'opencode' ? `
      <div class="preview-panel" id="preview-panel">
        <div class="preview-panel-header">
          <span class="preview-panel-title">Preview</span>
          <div class="preview-file-tabs" id="preview-file-tabs"></div>
          <button class="header-btn" onclick="togglePreviewPanel('${agent.id}')" style="width:24px;height:24px;flex-shrink:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="preview-iframe-wrap" id="preview-iframe-wrap">
          <div class="preview-empty" id="preview-empty">
            <div class="preview-empty-icon">🖥️</div>
            <div class="preview-empty-text">Loading workspace files...</div>
          </div>
        </div>
        <div class="preview-toolbar">
          <button class="btn btn-sm btn-ghost" onclick="refreshPreview('${agent.id}')" title="Refresh files">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            Refresh
          </button>
          <span style="font-size:10px;color:var(--color-text-faint);margin-left:auto;" id="preview-status">Ready</span>
        </div>
      </div>
      ` : ''}
    </div>
  `;
  
  // Scroll to bottom, setup drag-drop, render pending files and artifacts
  requestAnimationFrame(() => {
    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    setupDragDrop(agent.id);
    renderPendingFiles();
    if (artifactsPanelOpen) {
      renderArtifactsList(agent.id);
    }
    if (previewPanelOpen && agent.backend === 'opencode') {
      loadPreviewFiles(agent.id);
    }
  });
}

function renderMessage(msg, agent, index) {
  const isUser = msg.role === 'user';
  const parsedContent = typeof marked !== 'undefined' ? marked.parse(msg.content) : msg.content.replace(/\n/g, '<br>');
  
  return `
    <div class="message ${msg.role}" style="animation-delay: ${index * 0.05}s">
      <div class="message-avatar">${isUser ? '👤' : agent.icon}</div>
      <div>
        <div class="message-bubble">${parsedContent}</div>
        <div class="message-time">${formatTime(msg.timestamp)}</div>
      </div>
    </div>
  `;
}

function renderMemoryEntries(agentId, memories) {
  if (memories.length === 0) {
    return '<div style="text-align:center;padding:var(--space-6);color:var(--color-text-faint);font-size:var(--text-xs);">No memories stored yet</div>';
  }
  return memories.map(mem => `
    <div class="memory-entry">
      <div class="memory-entry-key">${escapeHtml(mem.key)}</div>
      <div class="memory-entry-value">${escapeHtml(mem.value)}</div>
      <div class="memory-entry-time">${formatTimeAgo(mem.timestamp)}</div>
      <div class="memory-entry-actions">
        <button class="memory-entry-btn" onclick="editMemory('${agentId}', '${mem.id}')">Edit</button>
        <button class="memory-entry-btn delete" onclick="deleteMemoryEntry('${agentId}', '${mem.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function renderSessionHistory(agentId, sessions) {
  if (sessions.length === 0) {
    return '<div style="text-align:center;padding:var(--space-6);color:var(--color-text-faint);font-size:var(--text-xs);">No sessions yet</div>';
  }
  const currentSession = MemoryStore.getCurrentSession(agentId);
  return sessions.map(session => `
    <div class="history-item ${session.id === currentSession ? 'active' : ''}" onclick="switchSession('${agentId}', '${session.id}')" style="${session.id === currentSession ? 'background:var(--color-primary-muted)' : ''}">
      <div class="history-item-title">${escapeHtml(session.title)}</div>
      <div class="history-item-time">${session.messageCount} messages · ${formatTimeAgo(session.createdAt)}</div>
    </div>
  `).join('');
}

// ============================================
// SEND MESSAGE — Real AI or Demo Mode
// ============================================
async function sendMessage(agentId) {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const content = input.value.trim();
  if ((!content && pendingFiles.length === 0) || isTyping) return;
  
  // Process pending files
  let fileContext = '';
  const processedFiles = [];
  if (pendingFiles.length > 0) {
    const sessionId = MemoryStore.getCurrentSession(agentId);
    for (const file of pendingFiles) {
      const fileData = await readFileContent(file);
      const ext = file.name.split('.').pop().toLowerCase();
      // Save to backend (skip if file too large for CGI 1MB limit)
      if (file.size <= 900000) {
        await saveFileToBackend(agentId, sessionId, file.name, ext, file.size, fileData.content, 'upload');
      }
      if (!fileCache[agentId]) fileCache[agentId] = [];
      fileCache[agentId].unshift({ filename: file.name, filetype: ext, filesize: file.size, source: 'upload', created_at: new Date().toISOString() });
      processedFiles.push({ filename: file.name, filesize: file.size, readType: fileData.type, content: fileData.content });
    }
    fileContext = buildFileContextForMessage(processedFiles);
    pendingFiles = [];
    renderPendingFiles();
    refreshArtifactsPanel(agentId);
  }
  
  // Collect image data URLs for multimodal support
  const imageDataUrls = processedFiles
    .filter(f => f.readType === 'image' && f.content)
    .map(f => ({ filename: f.filename, dataUrl: f.content }));
  
  // Build final message content (user sees just their text, AI gets file context too)
  const displayContent = content || '(Files attached)';
  const aiContent = fileContext ? fileContext + (content || 'Please analyze the attached files.') : content;
  
  // Add user message (display version)
  MemoryStore.addMessage(agentId, 'user', displayContent);
  input.value = '';
  autoResize(input);
  
  // Re-render messages
  const messagesEl = document.getElementById('chat-messages');
  const agent = AgentDefs.find(a => a.id === agentId);
  const messages = MemoryStore.getMessages(agentId);
  
  messagesEl.innerHTML = messages.map((msg, i) => renderMessage(msg, agent, i)).join('');
  messagesEl.scrollTop = messagesEl.scrollHeight;
  
  isTyping = true;
  
  const isOpenCodeAgent = agent?.backend === 'opencode';
  const hasOpenCode = OpenCodeAPI.isConfigured();
  const hasApiKey = !!aiConfig.openrouterKey;
  
  if (isOpenCodeAgent && hasOpenCode) {
    await sendOpenCodeMessage(agentId, agent, messagesEl, messages, aiContent);
  } else if (hasApiKey) {
    // ---- REAL AI MODE ----
    await sendRealAIMessage(agentId, agent, messagesEl, messages, aiContent, imageDataUrls);
  } else {
    // ---- DEMO MODE ----
    sendDemoMessage(agentId, agent, messagesEl);
  }
}

async function sendRealAIMessage(agentId, agent, messagesEl, messages, aiContent, imageDataUrls = []) {
  // Determine model
  const model = aiConfig.perAgentModels[agentId] || aiConfig.defaultModel || 'claude-3.5-sonnet';
  
  // Build system prompt with memory context
  let systemPrompt = SystemPrompts[agentId] || `You are the ABOS ${agent.name} agent. Be helpful and use markdown formatting.`;
  
  // Append memory context
  const memories = MemoryStore.getMemories(agentId);
  if (memories.length > 0) {
    systemPrompt += '\n\n**Agent Memory (persistent context):**\n';
    memories.forEach(m => {
      systemPrompt += `- ${m.key}: ${m.value}\n`;
    });
  }
  
  // Build conversation context (last 20 messages)
  const historyMessages = messages.slice(-20).map(m => ({
    role: m.role,
    content: m.content
  }));
  // Replace last user message content with file-augmented version if applicable
  if (aiContent && historyMessages.length > 0) {
    const lastMsg = historyMessages[historyMessages.length - 1];
    if (lastMsg.role === 'user') {
      // If we have images, use OpenRouter multimodal content format
      if (imageDataUrls && imageDataUrls.length > 0) {
        const contentParts = [{ type: 'text', text: aiContent }];
        imageDataUrls.forEach(img => {
          contentParts.push({
            type: 'image_url',
            image_url: { url: img.dataUrl }
          });
        });
        lastMsg.content = contentParts;
      } else {
        lastMsg.content = aiContent;
      }
    }
  }
  
  // Create the streaming message bubble
  const streamBubbleId = 'stream-bubble-' + Date.now();
  const streamMsgDiv = document.createElement('div');
  streamMsgDiv.className = 'message assistant';
  streamMsgDiv.innerHTML = `
    <div class="message-avatar">${agent.icon}</div>
    <div style="flex:1;min-width:0;">
      <div class="message-bubble" id="${streamBubbleId}"><span class="streaming-cursor"></span></div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
        <div class="message-time" id="${streamBubbleId}-time">Generating...</div>
        <button class="btn btn-sm btn-ghost" id="${streamBubbleId}-stop" onclick="stopGeneration()" style="font-size:10px;padding:2px 8px;color:var(--color-error);">Stop</button>
      </div>
    </div>
  `;
  messagesEl.appendChild(streamMsgDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  
  try {
    const stream = await OpenRouterAPI.streamChat(
      aiConfig.openrouterKey,
      model,
      historyMessages,
      systemPrompt,
      { temperature: aiConfig.temperature, maxTokens: aiConfig.maxTokens }
    );
    
    currentStreamReader = stream.reader;
    
    await stream.process(
      // onChunk
      (chunk, fullText) => {
        const bubble = document.getElementById(streamBubbleId);
        if (bubble) {
          const parsed = typeof marked !== 'undefined' ? marked.parse(fullText) : fullText.replace(/\n/g, '<br>');
          bubble.innerHTML = parsed + '<span class="streaming-cursor"></span>';
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      },
      // onDone
      (fullText) => {
        const bubble = document.getElementById(streamBubbleId);
        if (bubble && fullText) {
          const parsed = typeof marked !== 'undefined' ? marked.parse(fullText) : fullText.replace(/\n/g, '<br>');
          bubble.innerHTML = parsed;
        }
        const timeEl = document.getElementById(`${streamBubbleId}-time`);
        if (timeEl) timeEl.textContent = formatTime(new Date().toISOString());
        const stopBtn = document.getElementById(`${streamBubbleId}-stop`);
        if (stopBtn) stopBtn.remove();
        
        // Save the complete message
        if (fullText) {
          MemoryStore.addMessage(agentId, 'assistant', fullText);
          MemoryStore.addActivity(agentId, 'chat', 'Responded to user message', 'success');
          // Detect and save artifacts from the response
          processArtifacts(agentId, fullText);
        }
        
        isTyping = false;
        currentStreamReader = null;
      },
      // onError
      (err) => {
        const bubble = document.getElementById(streamBubbleId);
        const errorMsg = err instanceof OpenRouterError ? err.userMessage : `Error: ${err.message}`;
        if (bubble) {
          bubble.innerHTML = `<span style="color:var(--color-error);">${escapeHtml(errorMsg)}</span>`;
        }
        const stopBtn = document.getElementById(`${streamBubbleId}-stop`);
        if (stopBtn) stopBtn.remove();
        const timeEl = document.getElementById(`${streamBubbleId}-time`);
        if (timeEl) timeEl.textContent = 'Failed';
        
        showToast(errorMsg, 'error');
        isTyping = false;
        currentStreamReader = null;
      }
    );
  } catch (err) {
    const bubble = document.getElementById(streamBubbleId);
    const errorMsg = err instanceof OpenRouterError ? err.userMessage : `Error: ${err.message}`;
    if (bubble) {
      bubble.innerHTML = `<span style="color:var(--color-error);">${escapeHtml(errorMsg)}</span>`;
    }
    const stopBtn = document.getElementById(`${streamBubbleId}-stop`);
    if (stopBtn) stopBtn.remove();
    
    showToast(errorMsg, 'error');
    isTyping = false;
    currentStreamReader = null;
  }
}

// ─── OpenCode Message Handler ────────────────────────────────────────────────

async function sendOpenCodeMessage(agentId, agent, messagesEl, messages, prompt) {
  // Per-agent OpenCode session map
  if (!window._opencodeSessions) window._opencodeSessions = {};

  // Create the streaming bubble
  const streamBubbleId = 'oc-bubble-' + Date.now();
  const streamMsgDiv = document.createElement('div');
  streamMsgDiv.className = 'message assistant';
  streamMsgDiv.innerHTML = `
    <div class="message-avatar">${agent.icon}</div>
    <div style="flex:1;min-width:0;">
      <div class="message-bubble" id="${streamBubbleId}">
        <span style="color:var(--color-text-muted);font-size:12px;">⚡ OpenCode working...</span>
        <span class="streaming-cursor"></span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
        <div class="message-time" id="${streamBubbleId}-time">Connecting to OpenCode...</div>
        <button class="btn btn-sm btn-ghost" id="${streamBubbleId}-abort"
          onclick="opencodeAbortSession('${agentId}')"
          style="font-size:10px;padding:2px 8px;color:var(--color-error);">Abort</button>
      </div>
    </div>
  `;
  messagesEl.appendChild(streamMsgDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  const getBubble  = () => document.getElementById(streamBubbleId);
  const getTimeEl  = () => document.getElementById(`${streamBubbleId}-time`);
  const getAbortBtn = () => document.getElementById(`${streamBubbleId}-abort`);

  const setStatus = (msg) => {
    const t = getTimeEl();
    if (t) t.textContent = msg;
  };

  const setError = (msg) => {
    const b = getBubble();
    if (b) b.innerHTML = `<span style="color:var(--color-error);">${escapeHtml(msg)}</span>`;
    setStatus('Failed');
    const ab = getAbortBtn();
    if (ab) ab.remove();
    isTyping = false;
  };

  try {
    // Get or create a session for this agent
    let sessionId = window._opencodeSessions[agentId];
    if (!sessionId) {
      setStatus('Creating OpenCode session...');
      const session = await OpenCodeAPI.createSession(`ABOS — ${agent.name}`);
      sessionId = session.id || session.ID || session.sessionId;
      if (!sessionId) throw new Error('Failed to create OpenCode session — no ID returned');
      window._opencodeSessions[agentId] = sessionId;
    }

    setStatus('Sending prompt to OpenCode...');

    // Determine model from config
    const modelOverride = aiConfig.perAgentModels[agentId];
    let providerID, modelID;
    if (modelOverride) {
      const modelMap = {
        'claude-3.5-sonnet': { providerID: 'anthropic', modelID: 'claude-3-5-sonnet-20241022' },
        'claude-4-opus':     { providerID: 'anthropic', modelID: 'claude-opus-4-5' },
        'gpt-4o':            { providerID: 'openai',    modelID: 'gpt-4o' },
        'gpt-5':             { providerID: 'openai',    modelID: 'gpt-4o' },
        'gemini-2.0-flash':  { providerID: 'google',    modelID: 'gemini-2.0-flash' },
        'deepseek-v3':       { providerID: 'deepseek',  modelID: 'deepseek-chat' },
      };
      const mapped = modelMap[modelOverride];
      if (mapped) { providerID = mapped.providerID; modelID = mapped.modelID; }
    }

    // Send the prompt and await full response
    const result = await OpenCodeAPI.sendPrompt(sessionId, prompt, providerID, modelID);

    // result should be { info: Message, parts: Part[] }
    const parts = (result && result.parts) ? result.parts : [];
    const textParts = [];
    const toolParts = [];

    for (const part of parts) {
      const ptype = part.type || '';
      if (ptype === 'text') {
        textParts.push(part.text || '');
      } else if (
        ptype === 'tool-invocation' || ptype === 'tool_use' ||
        ptype === 'tool-use' || ptype === 'tool_result'
      ) {
        toolParts.push(part);
      } else if (part.text) {
        textParts.push(part.text);
      }
    }

    // Fallback if result came back as a plain string
    if (textParts.length === 0 && result && typeof result === 'string') {
      textParts.push(result);
    }

    const responseText = textParts.join('\n\n').trim();
    let toolHtml = '';

    if (toolParts.length > 0) {
      toolHtml = toolParts.map(tp => {
        const toolName   = (tp.toolInvocation && tp.toolInvocation.toolName) || tp.name || tp.tool || 'tool';
        const toolInput  = (tp.toolInvocation && tp.toolInvocation.args)     || tp.input || tp.args || {};
        const toolResult = (tp.toolInvocation && tp.toolInvocation.result)   || tp.result || null;
        const inputStr   = typeof toolInput  === 'string' ? toolInput  : JSON.stringify(toolInput, null, 2);
        const resultStr  = toolResult ? (typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)) : '';
        return `
          <details style="margin:8px 0;border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">
            <summary style="padding:6px 12px;cursor:pointer;background:var(--color-surface-2);font-size:12px;color:var(--color-text-muted);display:flex;align-items:center;gap:6px;">
              <span style="color:var(--color-primary);">⚙</span> <strong>${escapeHtml(toolName)}</strong>
            </summary>
            <div style="padding:8px 12px;">
              <pre style="margin:0;font-size:11px;white-space:pre-wrap;color:var(--color-text-secondary);">${escapeHtml(inputStr)}</pre>
              ${resultStr ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--color-border);"><pre style="margin:0;font-size:11px;white-space:pre-wrap;color:var(--color-success);">${escapeHtml(resultStr)}</pre></div>` : ''}
            </div>
          </details>
        `;
      }).join('');
    }

    // Render into bubble
    const b = getBubble();
    if (b) {
      const parsedText = responseText
        ? (typeof marked !== 'undefined' ? marked.parse(responseText) : responseText.replace(/\n/g, '<br>'))
        : '';
      b.innerHTML = (toolHtml || '') + (parsedText || '<em style="color:var(--color-text-muted);">OpenCode completed the task with no text response.</em>');
    }

    const finalText = (toolParts.length > 0 ? '[OpenCode executed tools]\n\n' : '') + responseText;
    setStatus(formatTime(new Date().toISOString()));
    const ab = getAbortBtn();
    if (ab) ab.remove();

    // Save to memory
    if (finalText.trim()) {
      MemoryStore.addMessage(agentId, 'assistant', finalText);
    }
    MemoryStore.addActivity(agentId, 'chat', 'OpenCode completed task', 'success');
    processArtifacts(agentId, finalText);

    // Auto-open and refresh preview panel after OpenCode completes
    if (!previewPanelOpen) {
      previewPanelOpen = true;
      renderAgentChat(document.getElementById('main-content'));
    } else {
      // Just refresh the preview content
      loadPreviewFiles(agentId);
    }

  } catch (err) {
    // If session is stale, clear it so next send creates a fresh one
    if (err.message && (
      err.message.includes('404') ||
      err.message.includes('not found') ||
      err.message.toLowerCase().includes('session')
    )) {
      delete window._opencodeSessions[agentId];
    }
    setError(`OpenCode error: ${err.message || 'Unknown error'}`);
    showToast(`OpenCode: ${err.message || 'Unknown error'}`, 'error');
  } finally {
    isTyping = false;
  }
}

// Abort the running OpenCode task for an agent
async function opencodeAbortSession(agentId) {
  const sessionId = window._opencodeSessions && window._opencodeSessions[agentId];
  if (sessionId) {
    try {
      await OpenCodeAPI.abortSession(sessionId);
      showToast('OpenCode task aborted', 'info');
    } catch (e) {
      // ignore abort errors
    }
  }
  isTyping = false;
}

// ─────────────────────────────────────────────────────────────────────────────

function sendDemoMessage(agentId, agent, messagesEl) {
  // Show typing indicator
  const typingEl = document.createElement('div');
  typingEl.className = 'typing-indicator';
  typingEl.id = 'typing-indicator';
  typingEl.innerHTML = `
    <div class="message-avatar" style="background:var(--color-primary-muted);color:var(--color-primary);width:28px;height:28px;border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;font-size:13px;">${agent.icon}</div>
    <div class="typing-dots"><span></span><span></span><span></span></div>
  `;
  messagesEl.appendChild(typingEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  
  // Simulate response after delay
  const delay = 1000 + Math.random() * 1500;
  setTimeout(() => {
    isTyping = false;
    const responseContent = getAgentMockResponse(agentId);
    MemoryStore.addMessage(agentId, 'assistant', responseContent);
    MemoryStore.addActivity(agentId, 'chat', 'Responded to user message', 'success');
    // Detect and save artifacts from the response
    processArtifacts(agentId, responseContent);
    
    // Remove typing indicator and render new message
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
    
    const updatedMessages = MemoryStore.getMessages(agentId);
    messagesEl.innerHTML = updatedMessages.map((msg, i) => renderMessage(msg, agent, i)).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }, delay);
}

function stopGeneration() {
  if (currentStreamReader) {
    try {
      currentStreamReader.cancel();
    } catch (e) {}
    currentStreamReader = null;
  }
}

function sendQuickAction(agentId, action) {
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = action;
    sendMessage(agentId);
  }
}

function handleChatKeydown(e, agentId) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(agentId);
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function toggleMemoryPanel() {
  memoryPanelOpen = !memoryPanelOpen;
  renderAgentChat(document.getElementById('main-content'));
}

function switchMemoryTab(tab) {
  memoryActiveTab = tab;
  const agent = AgentDefs.find(a => a.id === currentAgentId);
  if (!agent) return;
  
  const content = document.getElementById('memory-content');
  if (!content) return;
  
  document.querySelectorAll('.memory-tab').forEach(t => {
    t.classList.toggle('active', t.textContent.toLowerCase() === tab);
  });
  
  if (tab === 'memory') {
    content.innerHTML = renderMemoryEntries(agent.id, MemoryStore.getMemories(agent.id));
  } else {
    content.innerHTML = renderSessionHistory(agent.id, MemoryStore.getSessions(agent.id));
  }
}

function startNewSession(agentId) {
  const title = prompt('Session name:', `Session ${MemoryStore.getSessions(agentId).length + 1}`);
  if (!title) return;
  MemoryStore.createSession(agentId, title);
  renderAgentChat(document.getElementById('main-content'));
}

function switchSession(agentId, sessionId) {
  MemoryStore.currentSessions[agentId] = sessionId;
  renderAgentChat(document.getElementById('main-content'));
}

function showAddMemoryDialog(agentId) {
  const key = prompt('Memory key (e.g., "Company Name"):');
  if (!key) return;
  const value = prompt('Memory value:');
  if (!value) return;
  MemoryStore.addMemory(agentId, key, value);
  renderAgentChat(document.getElementById('main-content'));
}

function editMemory(agentId, memoryId) {
  const mem = MemoryStore.getMemories(agentId).find(m => m.id === memoryId);
  if (!mem) return;
  const key = prompt('Edit key:', mem.key);
  if (!key) return;
  const value = prompt('Edit value:', mem.value);
  if (!value) return;
  MemoryStore.updateMemory(agentId, memoryId, key, value);
  renderAgentChat(document.getElementById('main-content'));
}

function deleteMemoryEntry(agentId, memoryId) {
  MemoryStore.deleteMemory(agentId, memoryId);
  renderAgentChat(document.getElementById('main-content'));
}

// ============================================
// AI CONFIGURATION PAGE
// ============================================
function renderAIConfig(container) {
  container.innerHTML = `
    <div class="main-content settings-layout">
      <div class="page-header">
        <h1 class="page-title">AI Configuration</h1>
        <p class="page-desc">Manage API keys, model selection, and usage</p>
      </div>
      
      <!-- API Keys -->
      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">API Keys</div>
          <div class="settings-section-desc">Connect your AI providers. Keys are stored persistently via backend.</div>
        </div>
        <div class="settings-section-body">
          ${renderAPIKeyField('OpenRouter', 'openrouterKey', 'sk-or-v1-...')}
          ${renderAPIKeyField('OpenAI', 'openaiKey', 'sk-...')}
          ${renderAPIKeyField('Anthropic', 'anthropicKey', 'sk-ant-...')}
          ${renderAPIKeyField('Google AI', 'googleKey', 'AIza...')}
          ${renderAPIKeyField('xAI', 'xaiKey', 'xai-...')}
          ${renderAPIKeyField('DeepSeek', 'deepseekKey', 'sk-...')}
        </div>
      </div>
      
      <!-- Model Selection -->
      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">Model Selection</div>
          <div class="settings-section-desc">Configure default and per-agent models</div>
        </div>
        <div class="settings-section-body">
          <div class="form-group">
            <label class="form-label">Default Model</label>
            <select class="form-select w-full" onchange="updateConfigAndSave('defaultModel', this.value)">
              <optgroup label="HIGH">
                <option ${aiConfig.defaultModel === 'claude-4-opus' ? 'selected' : ''} value="claude-4-opus">Claude 4 Opus</option>
                <option ${aiConfig.defaultModel === 'gpt-5' ? 'selected' : ''} value="gpt-5">GPT-5</option>
              </optgroup>
              <optgroup label="STANDARD">
                <option ${aiConfig.defaultModel === 'claude-3.5-sonnet' ? 'selected' : ''} value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                <option ${aiConfig.defaultModel === 'gpt-4o' ? 'selected' : ''} value="gpt-4o">GPT-4o</option>
              </optgroup>
              <optgroup label="FAST">
                <option ${aiConfig.defaultModel === 'gemini-2.0-flash' ? 'selected' : ''} value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                <option ${aiConfig.defaultModel === 'deepseek-v3' ? 'selected' : ''} value="deepseek-v3">DeepSeek V3</option>
              </optgroup>
              <optgroup label="FREE">
                <option ${aiConfig.defaultModel === 'llama-3.3-70b' ? 'selected' : ''} value="llama-3.3-70b">Llama 3.3 70B</option>
                <option ${aiConfig.defaultModel === 'gemma-2-27b' ? 'selected' : ''} value="gemma-2-27b">Gemma 2 27B</option>
              </optgroup>
            </select>
          </div>
          
          <div class="form-group">
            <label class="form-label">Temperature: <span id="temp-val">${aiConfig.temperature}</span></label>
            <input type="range" min="0" max="2" step="0.1" value="${aiConfig.temperature}" 
              oninput="document.getElementById('temp-val').textContent = this.value"
              onchange="updateConfigAndSave('temperature', parseFloat(this.value))">
          </div>
          
          <div class="form-group">
            <label class="form-label">Max Tokens: <span id="tokens-val">${aiConfig.maxTokens}</span></label>
            <input type="range" min="256" max="32768" step="256" value="${aiConfig.maxTokens}"
              oninput="document.getElementById('tokens-val').textContent = this.value"
              onchange="updateConfigAndSave('maxTokens', parseInt(this.value))">
          </div>
          
          <!-- Per-Agent Model Override -->
          <label class="form-label" style="margin-top:var(--space-4)">Per-Agent Model Override</label>
          <table class="data-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Current Model</th>
                <th>Override</th>
              </tr>
            </thead>
            <tbody>
              ${AgentDefs.map(agent => {
                const currentOverride = aiConfig.perAgentModels[agent.id] || '';
                return `
                <tr>
                  <td>${agent.icon} ${agent.name}</td>
                  <td><span class="mono text-xs">${agent.model}</span></td>
                  <td>
                    <select class="form-select" style="height:28px;font-size:11px;" onchange="updatePerAgentModel('${agent.id}', this.value)">
                      <option value="">Default</option>
                      <option value="claude-4-opus" ${currentOverride === 'claude-4-opus' ? 'selected' : ''}>Claude 4 Opus</option>
                      <option value="claude-3.5-sonnet" ${currentOverride === 'claude-3.5-sonnet' ? 'selected' : ''}>Claude 3.5 Sonnet</option>
                      <option value="gpt-5" ${currentOverride === 'gpt-5' ? 'selected' : ''}>GPT-5</option>
                      <option value="gpt-4o" ${currentOverride === 'gpt-4o' ? 'selected' : ''}>GPT-4o</option>
                      <option value="gemini-2.0-flash" ${currentOverride === 'gemini-2.0-flash' ? 'selected' : ''}>Gemini 2.0 Flash</option>
                      <option value="deepseek-v3" ${currentOverride === 'deepseek-v3' ? 'selected' : ''}>DeepSeek V3</option>
                    </select>
                  </td>
                </tr>
              `}).join('')}
            </tbody>
          </table>
        </div>
      </div>
      
      <!-- OpenCode (Coding Agent) -->
      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">🏗️ OpenCode (Coding Agent)</div>
          <div class="settings-section-desc">Connect your OpenCode instance for autonomous code building. Used by SaaS Builder, Website Builder, and App Builder agents.</div>
        </div>
        <div class="settings-section-body">
          <!-- Server URL -->
          <div class="form-group">
            <label class="form-label">OpenCode Server URL</label>
            <input type="url" class="form-input" placeholder="https://your-opencode.up.railway.app"
              value="${aiConfig.opencodeUrl || ''}"
              onchange="updateConfigAndSave('opencodeUrl', this.value);">
          </div>
          <!-- Username -->
          <div class="form-group">
            <label class="form-label">Username</label>
            <input type="text" class="form-input" placeholder="admin"
              value="${aiConfig.opencodeUsername || ''}"
              onchange="updateConfigAndSave('opencodeUsername', this.value);">
          </div>
          <!-- Password -->
          <div class="form-group">
            <label class="form-label">Password</label>
            <div style="display:flex;gap:8px;">
              <input type="password" class="form-input" placeholder="••••••••" id="opencode-pw-input"
                value="${aiConfig.opencodePassword || ''}"
                onchange="updateConfigAndSave('opencodePassword', this.value);">
              <button class="btn btn-sm btn-ghost" onclick="togglePasswordVisibility('opencode-pw-input')">👁</button>
            </div>
          </div>
          <!-- Test Connection -->
          <div style="display:flex;align-items:center;gap:0;">
            <button class="btn btn-primary" onclick="testOpenCodeConnection()" id="opencode-test-btn">Test Connection</button>
            <span id="opencode-test-result" style="margin-left:12px;font-size:12px;"></span>
          </div>
        </div>
      </div>
      
      <!-- Cost Dashboard -->
      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">Cost Dashboard</div>
          <div class="settings-section-desc">Token usage and spending overview</div>
        </div>
        <div class="settings-section-body">
          <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
            <div class="kpi-card">
              <div class="kpi-label">Today</div>
              <div class="kpi-value">$18.40</div>
              <div class="kpi-delta negative">↑ 12% vs avg</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">This Week</div>
              <div class="kpi-value">$124.50</div>
              <div class="kpi-delta positive">↓ 5% vs last week</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">This Month</div>
              <div class="kpi-value">$487.20</div>
              <div class="kpi-delta neutral">On track for $620</div>
            </div>
          </div>
          <table class="data-table mt-3">
            <thead>
              <tr><th>Model</th><th>Input Tokens</th><th>Output Tokens</th><th>Cost</th></tr>
            </thead>
            <tbody>
              <tr><td><span class="mono text-xs">claude-3.5-sonnet</span></td><td class="tabular-nums">2,847,000</td><td class="tabular-nums">1,423,500</td><td class="tabular-nums">$198.40</td></tr>
              <tr><td><span class="mono text-xs">gpt-4o</span></td><td class="tabular-nums">1,920,000</td><td class="tabular-nums">860,000</td><td class="tabular-nums">$142.30</td></tr>
              <tr><td><span class="mono text-xs">gemini-2.0-flash</span></td><td class="tabular-nums">3,450,000</td><td class="tabular-nums">1,100,000</td><td class="tabular-nums">$68.20</td></tr>
              <tr><td><span class="mono text-xs">deepseek-v3</span></td><td class="tabular-nums">1,800,000</td><td class="tabular-nums">720,000</td><td class="tabular-nums">$45.80</td></tr>
              <tr><td><span class="mono text-xs">llama-3.3-70b</span></td><td class="tabular-nums">1,200,000</td><td class="tabular-nums">480,000</td><td class="tabular-nums">$32.50</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderAPIKeyField(label, configKey, placeholder) {
  const isOpenRouter = configKey === 'openrouterKey';
  return `
    <div class="form-group">
      <label class="form-label">${label} API Key ${isOpenRouter ? '<span style="color:var(--color-primary);font-size:10px;">(Required for AI)</span>' : ''}</label>
      <div class="form-input-group">
        <input type="password" class="form-input" id="key-${configKey}" 
          placeholder="${placeholder}" value="${aiConfig[configKey]}"
          oninput="aiConfig['${configKey}'] = this.value"
          onchange="saveAPIKey('${configKey}', this.value)">
        <button class="btn btn-secondary btn-sm" onclick="toggleKeyVisibility('key-${configKey}')">Show</button>
        <button class="btn btn-primary btn-sm" onclick="testConnection('${label}', '${configKey}')">Test</button>
      </div>
    </div>
  `;
}

function saveAPIKey(configKey, value) {
  aiConfig[configKey] = value;
  const saveObj = {};
  saveObj[configKey] = value;
  MemoryStore.saveSettings(saveObj);
}

function updateConfigAndSave(key, value) {
  aiConfig[key] = value;
  const saveObj = {};
  saveObj[key] = value;
  MemoryStore.saveSettings(saveObj);
}

function updatePerAgentModel(agentId, model) {
  if (model) {
    aiConfig.perAgentModels[agentId] = model;
  } else {
    delete aiConfig.perAgentModels[agentId];
  }
  MemoryStore.saveSettings({ perAgentModels: aiConfig.perAgentModels });
}

function toggleKeyVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const btn = input.nextElementSibling;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
}

async function testConnection(provider, configKey) {
  if (provider === 'OpenRouter') {
    const key = aiConfig.openrouterKey;
    if (!key) {
      showToast('Please enter an OpenRouter API key first', 'error');
      return;
    }
    showToast(`Testing ${provider} connection...`, 'info');
    try {
      const result = await OpenRouterAPI.testKey(key);
      if (result.valid) {
        showToast(`${provider} connected! ${result.modelCount} models available.`, 'success');
      } else {
        showToast(`${provider} connection failed: ${result.error}`, 'error');
      }
    } catch (err) {
      showToast(`${provider} test failed: ${err.message}`, 'error');
    }
  } else {
    // For non-OpenRouter providers, show informational message
    const key = aiConfig[configKey];
    if (!key) {
      showToast(`Please enter a ${provider} API key first`, 'error');
      return;
    }
    showToast(`${provider} key saved. All models are routed through OpenRouter.`, 'info');
  }
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (input) input.type = input.type === 'password' ? 'text' : 'password';
}

async function testOpenCodeConnection() {
  const btn    = document.getElementById('opencode-test-btn');
  const result = document.getElementById('opencode-test-result');
  if (btn) btn.disabled = true;
  if (result) {
    result.textContent = 'Saving credentials & testing...';
    result.style.color = 'var(--color-text-muted)';
  }

  // Save credentials to backend first so the proxy can use them
  await MemoryStore.saveSettings({
    opencodeUrl: aiConfig.opencodeUrl,
    opencodeUsername: aiConfig.opencodeUsername,
    opencodePassword: aiConfig.opencodePassword,
  });

  const test = await OpenCodeAPI.testConnection();

  if (test.ok) {
    if (result) {
      result.textContent = `✅ Connected — OpenCode v${test.version}`;
      result.style.color = 'var(--color-success)';
    }
    showToast(`OpenCode connected! v${test.version}`, 'success');
  } else {
    if (result) {
      result.textContent = `❌ Failed — ${test.error}`;
      result.style.color = 'var(--color-error)';
    }
    showToast(`OpenCode connection failed: ${test.error}`, 'error');
  }
  if (btn) btn.disabled = false;
}

// ============================================
// MEMORY PAGE
// ============================================
function renderMemoryPage(container) {
  const allMemories = MemoryStore.getAllMemories();
  
  container.innerHTML = `
    <div class="main-content">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <h1 class="page-title">Memory & Context</h1>
          <p class="page-desc">${allMemories.length} entries across all agents</p>
        </div>
        <button class="btn btn-secondary" onclick="exportMemory()">Export JSON</button>
      </div>
      
      <div class="filter-bar">
        <select id="memory-agent-filter" onchange="filterMemoryPage()">
          <option value="">All Agents</option>
          ${AgentDefs.map(a => `<option value="${a.id}">${a.icon} ${a.name}</option>`).join('')}
        </select>
        <input type="text" id="memory-search" placeholder="Search memories..." oninput="filterMemoryPage()">
      </div>
      
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Key</th>
              <th>Value</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="memory-table-body">
            ${allMemories.map(mem => {
              const agent = AgentDefs.find(a => a.id === mem.agentId);
              return `
                <tr data-agent="${mem.agentId}" data-key="${escapeHtml(mem.key).toLowerCase()}" data-value="${escapeHtml(mem.value).toLowerCase()}">
                  <td>${agent?.icon || '🤖'} <span class="text-xs">${agent?.name || mem.agentId}</span></td>
                  <td><strong class="text-primary">${escapeHtml(mem.key)}</strong></td>
                  <td class="text-muted" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(mem.value)}</td>
                  <td class="text-faint text-xs">${formatTimeAgo(mem.timestamp)}</td>
                  <td>
                    <button class="btn btn-sm btn-ghost" onclick="deleteMemoryFromPage('${mem.agentId}', '${mem.id}')">Delete</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function filterMemoryPage() {
  const agentFilter = document.getElementById('memory-agent-filter')?.value;
  const searchQuery = document.getElementById('memory-search')?.value.toLowerCase() || '';
  
  document.querySelectorAll('#memory-table-body tr').forEach(row => {
    const matchAgent = !agentFilter || row.dataset.agent === agentFilter;
    const matchSearch = !searchQuery || row.dataset.key?.includes(searchQuery) || row.dataset.value?.includes(searchQuery);
    row.style.display = (matchAgent && matchSearch) ? '' : 'none';
  });
}

function deleteMemoryFromPage(agentId, memoryId) {
  MemoryStore.deleteMemory(agentId, memoryId);
  renderMemoryPage(document.getElementById('main-content'));
}

function exportMemory() {
  const data = JSON.stringify(MemoryStore.getAllMemories(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'abos-memory-export.json';
  a.click();
  showToast('Memory exported as JSON', 'success');
}

// ============================================
// INTEGRATIONS PAGE
// ============================================
function renderIntegrationsPage(container) {
  const integrations = [
    { name: 'Slack', icon: '💬', status: 'connected', desc: 'Send notifications and receive commands' },
    { name: 'Google Workspace', icon: '📨', status: 'connected', desc: 'Email, Calendar, Drive integration' },
    { name: 'Stripe', icon: '💳', status: 'connected', desc: 'Payment processing and invoicing' },
    { name: 'HubSpot', icon: '🔶', status: 'disconnected', desc: 'CRM and marketing automation' },
    { name: 'Notion', icon: '📓', status: 'disconnected', desc: 'Knowledge base and documentation' },
    { name: 'GitHub', icon: '🐙', status: 'connected', desc: 'Code repositories and CI/CD' },
    { name: 'Zapier', icon: '⚡', status: 'disconnected', desc: 'Connect 5,000+ apps' },
    { name: 'Twilio', icon: '📱', status: 'connected', desc: 'Voice and SMS communications' },
  ];
  
  container.innerHTML = `
    <div class="main-content settings-layout">
      <div class="page-header">
        <h1 class="page-title">Integrations</h1>
        <p class="page-desc">Connect your business tools to ABOS agents</p>
      </div>
      
      <div style="display:grid; gap:var(--space-3);">
        ${integrations.map(int => `
          <div class="card" style="padding:var(--space-4); display:flex; align-items:center; gap:var(--space-3);">
            <div style="font-size:24px;">${int.icon}</div>
            <div style="flex:1;">
              <div style="font-size:var(--text-sm); font-weight:600; color:var(--color-text);">${int.name}</div>
              <div style="font-size:var(--text-xs); color:var(--color-text-muted);">${int.desc}</div>
            </div>
            <span class="badge ${int.status === 'connected' ? 'badge-success' : 'badge-neutral'}">${int.status === 'connected' ? 'Connected' : 'Disconnected'}</span>
            <button class="btn btn-sm ${int.status === 'connected' ? 'btn-ghost' : 'btn-primary'}">${int.status === 'connected' ? 'Configure' : 'Connect'}</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ============================================
// ACCOUNT PAGE
// ============================================
function renderAccountPage(container) {
  container.innerHTML = `
    <div class="main-content settings-layout">
      <div class="page-header">
        <h1 class="page-title">Account</h1>
        <p class="page-desc">Manage your ABOS account settings</p>
      </div>
      
      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">Profile</div>
        </div>
        <div class="settings-section-body">
          <div style="display:flex;align-items:center;gap:var(--space-4);margin-bottom:var(--space-4);">
            <div class="header-avatar" style="width:56px;height:56px;font-size:20px;">AB</div>
            <div>
              <div style="font-size:var(--text-sm);font-weight:600;">ABOS Admin</div>
              <div style="font-size:var(--text-xs);color:var(--color-text-muted);">admin@abos.ai</div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Display Name</label>
            <input type="text" class="form-input" value="ABOS Admin">
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="form-input" value="admin@abos.ai">
          </div>
          <button class="btn btn-primary">Save Changes</button>
        </div>
      </div>
      
      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">Preferences</div>
        </div>
        <div class="settings-section-body">
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Dark Mode</div>
              <div class="settings-row-desc">Use dark color scheme</div>
            </div>
            <div class="toggle ${currentTheme === 'dark' ? 'active' : ''}" onclick="toggleTheme(); this.classList.toggle('active');"></div>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Agent Notifications</div>
              <div class="settings-row-desc">Receive alerts when agents complete tasks</div>
            </div>
            <div class="toggle active" onclick="this.classList.toggle('active')"></div>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Auto-save Conversations</div>
              <div class="settings-row-desc">Automatically save all chat history</div>
            </div>
            <div class="toggle active" onclick="this.classList.toggle('active')"></div>
          </div>
        </div>
      </div>
      
      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">Danger Zone</div>
        </div>
        <div class="settings-section-body">
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Clear All Data</div>
              <div class="settings-row-desc">Delete all memories, conversations, and settings</div>
            </div>
            <button class="btn btn-danger btn-sm">Clear Data</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// BLUEPRINT CREATOR
// ============================================
let blueprintData = null; // Holds the generated blueprint
let blueprintFormState = {
  businessName: '',
  businessIdea: '',
  industry: '',
  targetMarket: '',
  revenueModels: [],
  revenueTarget: '',
  budgetConstraint: '',
  automationLevel: 'full-auto',
  constraints: ''
};
let blueprintView = 'form'; // 'form' | 'loading' | 'output'

function renderBlueprintCreator(container) {
  container.innerHTML = `
    <style>
      .blueprint-form { max-width: 720px; margin: 0 auto; }
      .blueprint-section { background: var(--color-surface-2); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-lg, 12px); padding: 28px; margin-bottom: 24px; }
      .blueprint-section-title { font-size: 15px; font-weight: 700; color: var(--color-text); margin-bottom: 6px; display: flex; align-items: center; gap: 10px; }
      .blueprint-section-title .bp-icon { font-size: 18px; }
      .blueprint-section-desc { font-size: 12px; color: var(--color-text-muted); margin-bottom: 20px; }
      .blueprint-field { margin-bottom: 18px; }
      .blueprint-field:last-child { margin-bottom: 0; }
      .blueprint-label { display: block; font-size: 12px; font-weight: 600; color: var(--color-text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
      .blueprint-input, .blueprint-textarea {
        width: 100%; box-sizing: border-box;
        background: var(--color-surface-1, var(--color-bg)); border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md, 8px); padding: 10px 14px;
        font-size: 13px; color: var(--color-text); font-family: 'Inter', sans-serif;
        transition: border-color 0.2s, box-shadow 0.2s;
        outline: none;
      }
      .blueprint-input:focus, .blueprint-textarea:focus {
        border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(0,212,170,0.12);
      }
      .blueprint-input::placeholder, .blueprint-textarea::placeholder { color: var(--color-text-faint, #555570); }
      .blueprint-textarea { resize: vertical; min-height: 80px; line-height: 1.5; }
      .blueprint-money-wrap { position: relative; }
      .blueprint-money-wrap .bp-dollar { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--color-text-faint); font-size: 13px; font-weight: 600; pointer-events: none; }
      .blueprint-money-wrap .blueprint-input { padding-left: 28px; }
      .blueprint-checkbox-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .blueprint-checkbox { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--radius-md, 8px); border: 1px solid var(--color-border-subtle); background: var(--color-surface-1, var(--color-bg)); cursor: pointer; transition: all 0.15s; font-size: 12px; color: var(--color-text-muted); }
      .blueprint-checkbox:hover { border-color: var(--color-primary); color: var(--color-text); }
      .blueprint-checkbox.checked { border-color: var(--color-primary); background: rgba(0,212,170,0.08); color: var(--color-text); }
      .blueprint-checkbox input { display: none; }
      .blueprint-checkbox .bp-check { width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid var(--color-border-subtle); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.15s; }
      .blueprint-checkbox.checked .bp-check { background: var(--color-primary); border-color: var(--color-primary); }
      .blueprint-checkbox.checked .bp-check::after { content: '\\2713'; color: #000; font-size: 10px; font-weight: 700; }
      .blueprint-radio-group { display: flex; gap: 8px; flex-wrap: wrap; }
      .blueprint-radio { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: var(--radius-md, 8px); border: 1px solid var(--color-border-subtle); background: var(--color-surface-1, var(--color-bg)); cursor: pointer; transition: all 0.15s; font-size: 12px; color: var(--color-text-muted); flex: 1; }
      .blueprint-radio:hover { border-color: var(--color-primary); }
      .blueprint-radio.selected { border-color: var(--color-primary); background: rgba(0,212,170,0.08); color: var(--color-text); }
      .blueprint-radio input { display: none; }
      .blueprint-radio .bp-dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--color-border-subtle); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.15s; }
      .blueprint-radio.selected .bp-dot { border-color: var(--color-primary); }
      .blueprint-radio.selected .bp-dot::after { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--color-primary); }
      .blueprint-radio-detail { font-size: 10px; color: var(--color-text-faint); margin-top: 2px; }
      .blueprint-btn {
        width: 100%; padding: 14px 24px; border: none; border-radius: var(--radius-md, 8px);
        background: var(--color-primary); color: #000; font-size: 14px; font-weight: 700;
        cursor: pointer; transition: all 0.2s; font-family: 'Inter', sans-serif;
        display: flex; align-items: center; justify-content: center; gap: 8px;
      }
      .blueprint-btn:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,212,170,0.3); }
      .blueprint-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

      /* Loading */
      .blueprint-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; text-align: center; }
      .blueprint-loading-spinner { width: 48px; height: 48px; border-radius: 50%; border: 3px solid var(--color-border-subtle); border-top-color: var(--color-primary); animation: bp-spin 0.8s linear infinite; margin-bottom: 24px; }
      @keyframes bp-spin { to { transform: rotate(360deg); } }
      .blueprint-loading-text { font-size: 15px; font-weight: 600; color: var(--color-text); margin-bottom: 8px; }
      .blueprint-loading-sub { font-size: 12px; color: var(--color-text-muted); }
      .blueprint-loading-dots::after { content: ''; animation: bp-dots 1.4s steps(4,end) infinite; }
      @keyframes bp-dots { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } }
      .blueprint-loading-steps { margin-top: 32px; text-align: left; display: flex; flex-direction: column; gap: 10px; }
      .blueprint-loading-step { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--color-text-faint); transition: color 0.3s; }
      .blueprint-loading-step.active { color: var(--color-primary); }
      .blueprint-loading-step.done { color: var(--color-success, #22c55e); }
      .blueprint-loading-step .bp-step-icon { width: 20px; text-align: center; }

      /* Output */
      .blueprint-output { max-width: 900px; margin: 0 auto; }
      .blueprint-top-actions { display: flex; gap: 10px; margin-bottom: 24px; flex-wrap: wrap; }
      .blueprint-top-btn { padding: 8px 16px; border-radius: var(--radius-md, 8px); border: 1px solid var(--color-border-subtle); background: var(--color-surface-2); color: var(--color-text-muted); font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; font-family: 'Inter', sans-serif; display: flex; align-items: center; gap: 6px; }
      .blueprint-top-btn:hover { border-color: var(--color-primary); color: var(--color-text); }
      .blueprint-top-btn.primary { background: var(--color-primary); color: #000; border-color: var(--color-primary); }
      .blueprint-top-btn.primary:hover { opacity: 0.9; }
      .blueprint-card { background: var(--color-surface-2); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-lg, 12px); padding: 24px; margin-bottom: 20px; }
      .blueprint-card-title { font-size: 13px; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
      .blueprint-card-title .bp-card-icon { font-size: 16px; }

      /* Summary header */
      .blueprint-summary { display: flex; gap: 16px; align-items: stretch; }
      .blueprint-summary-bar { width: 4px; border-radius: 4px; background: var(--color-primary); flex-shrink: 0; }
      .blueprint-summary-content { flex: 1; }
      .blueprint-summary h2 { font-size: 22px; font-weight: 800; color: var(--color-text); margin: 0 0 8px 0; }
      .blueprint-summary p { font-size: 13px; color: var(--color-text-muted); margin: 0; line-height: 1.6; }

      /* Agent grid */
      .blueprint-agent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
      .bp-agent-card { padding: 14px; border-radius: var(--radius-md, 8px); border: 1px solid var(--color-border-subtle); background: var(--color-surface-1, var(--color-bg)); cursor: pointer; transition: all 0.15s; }
      .bp-agent-card:hover { border-color: var(--color-primary); transform: translateY(-1px); }
      .bp-agent-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
      .bp-agent-card-name { font-size: 13px; font-weight: 600; color: var(--color-text); }
      .bp-agent-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.3px; }
      .bp-agent-badge.critical { background: rgba(239,68,68,0.15); color: #ef4444; }
      .bp-agent-badge.high { background: rgba(249,115,22,0.15); color: #f97316; }
      .bp-agent-badge.medium { background: rgba(0,212,170,0.15); color: var(--color-primary); }
      .bp-agent-badge.low { background: rgba(107,114,128,0.15); color: #6b7280; }
      .bp-agent-card-role { font-size: 11px; color: var(--color-text-muted); line-height: 1.4; }
      .bp-agent-card-phase { font-size: 10px; color: var(--color-text-faint); margin-top: 6px; }

      /* Revenue table */
      .blueprint-table { width: 100%; border-collapse: collapse; }
      .blueprint-table th { text-align: left; font-size: 10px; font-weight: 600; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 12px; border-bottom: 1px solid var(--color-border-subtle); }
      .blueprint-table td { font-size: 12px; color: var(--color-text-muted); padding: 10px 12px; border-bottom: 1px solid var(--color-border-subtle); }
      .blueprint-table tr:last-child td { border-bottom: none; }
      .blueprint-table .bp-money { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--color-primary); }

      /* Goals & KPIs */
      .blueprint-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
      .bp-goal-item { padding: 12px; border-radius: var(--radius-md, 8px); border: 1px solid var(--color-border-subtle); background: var(--color-surface-1, var(--color-bg)); margin-bottom: 8px; }
      .bp-goal-item:last-child { margin-bottom: 0; }
      .bp-goal-text { font-size: 12px; font-weight: 600; color: var(--color-text); margin-bottom: 4px; }
      .bp-goal-meta { font-size: 10px; color: var(--color-text-faint); display: flex; gap: 12px; }
      .bp-kpi-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: var(--radius-md, 8px); border: 1px solid var(--color-border-subtle); background: var(--color-surface-1, var(--color-bg)); margin-bottom: 8px; }
      .bp-kpi-item:last-child { margin-bottom: 0; }
      .bp-kpi-name { font-size: 12px; color: var(--color-text-muted); }
      .bp-kpi-target { font-size: 12px; font-weight: 700; color: var(--color-text); font-family: 'JetBrains Mono', monospace; }
      .bp-kpi-freq { font-size: 9px; color: var(--color-text-faint); text-transform: uppercase; background: var(--color-surface-2); padding: 2px 6px; border-radius: 4px; margin-left: 8px; }

      /* Phases */
      .blueprint-phase { position: relative; padding: 20px; padding-left: 32px; border-left: 2px solid var(--color-border-subtle); margin-left: 8px; margin-bottom: 0; }
      .blueprint-phase:last-child { border-left-color: transparent; }
      .blueprint-phase::before { content: ''; position: absolute; left: -7px; top: 22px; width: 12px; height: 12px; border-radius: 50%; background: var(--color-primary); border: 2px solid var(--color-surface-2); }
      .blueprint-phase-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
      .blueprint-phase-num { font-size: 10px; font-weight: 700; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.5px; }
      .blueprint-phase-name { font-size: 14px; font-weight: 700; color: var(--color-text); }
      .blueprint-phase-dur { font-size: 11px; color: var(--color-text-faint); margin-left: auto; background: var(--color-surface-1, var(--color-bg)); padding: 2px 10px; border-radius: 99px; border: 1px solid var(--color-border-subtle); }
      .blueprint-phase-tasks { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
      .blueprint-phase-task { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: var(--color-text-muted); }
      .blueprint-phase-task::before { content: '\\2610'; color: var(--color-text-faint); flex-shrink: 0; margin-top: 1px; }
      .blueprint-phase-agents { display: flex; gap: 6px; flex-wrap: wrap; }
      .blueprint-phase-agent-tag { font-size: 10px; padding: 2px 8px; border-radius: 99px; background: rgba(0,212,170,0.1); color: var(--color-primary); font-weight: 600; }

      /* Cost estimate */
      .bp-cost-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--color-border-subtle); font-size: 12px; }
      .bp-cost-row:last-child { border-bottom: none; }
      .bp-cost-label { color: var(--color-text-muted); }
      .bp-cost-value { font-family: 'JetBrains Mono', monospace; color: var(--color-text); font-weight: 600; }
      .bp-cost-total { background: rgba(0,212,170,0.08); margin: 12px -12px -12px; padding: 14px 12px; border-radius: 0 0 var(--radius-md, 8px) var(--radius-md, 8px); display: flex; justify-content: space-between; font-weight: 700; }
      .bp-cost-total .bp-cost-label { color: var(--color-text); font-size: 13px; }
      .bp-cost-total .bp-cost-value { color: var(--color-primary); font-size: 15px; }

      /* Risks */
      .bp-risk-card { padding: 14px; border-radius: var(--radius-md, 8px); border: 1px solid var(--color-border-subtle); background: var(--color-surface-1, var(--color-bg)); margin-bottom: 10px; }
      .bp-risk-card:last-child { margin-bottom: 0; }
      .bp-risk-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
      .bp-risk-severity { font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 99px; text-transform: uppercase; }
      .bp-risk-severity.high { background: rgba(239,68,68,0.15); color: #ef4444; }
      .bp-risk-severity.medium { background: rgba(249,115,22,0.15); color: #f97316; }
      .bp-risk-severity.low { background: rgba(0,212,170,0.15); color: var(--color-primary); }
      .bp-risk-text { font-size: 12px; font-weight: 600; color: var(--color-text); }
      .bp-risk-mitigation { font-size: 11px; color: var(--color-text-muted); line-height: 1.5; }
      .bp-risk-mitigation strong { color: var(--color-text-faint); font-weight: 600; }

      @media (max-width: 640px) {
        .blueprint-checkbox-grid { grid-template-columns: 1fr; }
        .blueprint-radio-group { flex-direction: column; }
        .blueprint-two-col { grid-template-columns: 1fr; }
        .blueprint-agent-grid { grid-template-columns: 1fr; }
        .blueprint-top-actions { flex-direction: column; }
        .blueprint-summary h2 { font-size: 18px; }
      }
    </style>
    <div class="main-content">
      <div class="page-header">
        <h1 class="page-title">Blueprint Creator</h1>
        <p class="page-desc">Describe your business idea and get an AI-generated operational blueprint</p>
      </div>
      <div id="blueprint-container">
        ${blueprintView === 'form' ? renderBlueprintForm() : ''}
        ${blueprintView === 'loading' ? renderBlueprintLoading() : ''}
        ${blueprintView === 'output' ? renderBlueprintOutput() : ''}
      </div>
    </div>
  `;

  if (blueprintView === 'form') {
    requestAnimationFrame(() => restoreBlueprintFormState());
  }
  if (blueprintView === 'loading') {
    requestAnimationFrame(() => animateBlueprintLoadingSteps());
  }
}

function renderBlueprintForm() {
  const revenueOptions = [
    'Display Ads', 'Affiliate Commissions', 'Premium Listings', 'Lead Generation',
    'SaaS Subscriptions', 'Sponsored Content', 'Digital Products', 'E-Commerce'
  ];

  return `
    <div class="blueprint-form">
      <!-- Section 1: Business Overview -->
      <div class="blueprint-section">
        <div class="blueprint-section-title"><span class="bp-icon">\uD83C\uDFE2</span> Business Overview</div>
        <div class="blueprint-section-desc">Tell us about your business idea and who you're targeting.</div>

        <div class="blueprint-field">
          <label class="blueprint-label">Business Name</label>
          <input class="blueprint-input" id="bp-name" type="text" placeholder="e.g., PoolPro Directory" oninput="blueprintFormState.businessName=this.value">
        </div>
        <div class="blueprint-field">
          <label class="blueprint-label">Business Idea</label>
          <textarea class="blueprint-textarea" id="bp-idea" placeholder="Describe your business concept in a few sentences..." oninput="blueprintFormState.businessIdea=this.value"></textarea>
        </div>
        <div class="blueprint-field">
          <label class="blueprint-label">Industry / Niche</label>
          <input class="blueprint-input" id="bp-industry" type="text" placeholder="e.g., Home Services, AI Tools, Healthcare" oninput="blueprintFormState.industry=this.value">
        </div>
        <div class="blueprint-field">
          <label class="blueprint-label">Target Market</label>
          <input class="blueprint-input" id="bp-market" type="text" placeholder="e.g., Pool service companies in Florida" oninput="blueprintFormState.targetMarket=this.value">
        </div>
      </div>

      <!-- Section 2: Revenue & Goals -->
      <div class="blueprint-section">
        <div class="blueprint-section-title"><span class="bp-icon">\uD83D\uDCB0</span> Revenue & Goals</div>
        <div class="blueprint-section-desc">Define how you plan to monetize and what targets you're aiming for.</div>

        <div class="blueprint-field">
          <label class="blueprint-label">Revenue Model</label>
          <div class="blueprint-checkbox-grid" id="bp-revenue-grid">
            ${revenueOptions.map(opt => {
              const checked = blueprintFormState.revenueModels.includes(opt);
              return `<div class="blueprint-checkbox${checked ? ' checked' : ''}" onclick="toggleBlueprintCheckbox(this, '${opt}')">
                <input type="checkbox" ${checked ? 'checked' : ''}>
                <span class="bp-check"></span>
                <span>${opt}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div class="blueprint-field">
          <label class="blueprint-label">Monthly Revenue Target</label>
          <div class="blueprint-money-wrap">
            <span class="bp-dollar">$</span>
            <input class="blueprint-input" id="bp-revenue" type="text" placeholder="10,000" oninput="blueprintFormState.revenueTarget=this.value">
          </div>
        </div>
        <div class="blueprint-field">
          <label class="blueprint-label">Monthly Budget Constraint</label>
          <div class="blueprint-money-wrap">
            <span class="bp-dollar">$</span>
            <input class="blueprint-input" id="bp-budget" type="text" placeholder="500" oninput="blueprintFormState.budgetConstraint=this.value">
          </div>
        </div>
      </div>

      <!-- Section 3: Operations -->
      <div class="blueprint-section">
        <div class="blueprint-section-title"><span class="bp-icon">\u2699\uFE0F</span> Operations</div>
        <div class="blueprint-section-desc">Choose your automation level and any operational constraints.</div>

        <div class="blueprint-field">
          <label class="blueprint-label">Automation Level</label>
          <div class="blueprint-radio-group" id="bp-auto-group">
            <div class="blueprint-radio${blueprintFormState.automationLevel === 'full-auto' ? ' selected' : ''}" onclick="selectBlueprintRadio('full-auto')">
              <input type="radio" name="bp-auto" value="full-auto">
              <span class="bp-dot"></span>
              <div>
                <div>Full Auto</div>
                <div class="blueprint-radio-detail">90%+ AI-driven</div>
              </div>
            </div>
            <div class="blueprint-radio${blueprintFormState.automationLevel === 'semi-auto' ? ' selected' : ''}" onclick="selectBlueprintRadio('semi-auto')">
              <input type="radio" name="bp-auto" value="semi-auto">
              <span class="bp-dot"></span>
              <div>
                <div>Semi-Auto</div>
                <div class="blueprint-radio-detail">50\u201370% AI-driven</div>
              </div>
            </div>
            <div class="blueprint-radio${blueprintFormState.automationLevel === 'assisted' ? ' selected' : ''}" onclick="selectBlueprintRadio('assisted')">
              <input type="radio" name="bp-auto" value="assisted">
              <span class="bp-dot"></span>
              <div>
                <div>Assisted</div>
                <div class="blueprint-radio-detail">30\u201350% AI-driven</div>
              </div>
            </div>
          </div>
        </div>
        <div class="blueprint-field">
          <label class="blueprint-label">Key Constraints</label>
          <textarea class="blueprint-textarea" id="bp-constraints" placeholder="e.g., BYOK only, no cold calling, US market only..." oninput="blueprintFormState.constraints=this.value"></textarea>
        </div>
      </div>

      <button class="blueprint-btn" onclick="generateBlueprint()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        Generate Blueprint
      </button>
    </div>
  `;
}

function restoreBlueprintFormState() {
  const s = blueprintFormState;
  const el = (id) => document.getElementById(id);
  if (el('bp-name')) el('bp-name').value = s.businessName;
  if (el('bp-idea')) el('bp-idea').value = s.businessIdea;
  if (el('bp-industry')) el('bp-industry').value = s.industry;
  if (el('bp-market')) el('bp-market').value = s.targetMarket;
  if (el('bp-revenue')) el('bp-revenue').value = s.revenueTarget;
  if (el('bp-budget')) el('bp-budget').value = s.budgetConstraint;
  if (el('bp-constraints')) el('bp-constraints').value = s.constraints;
}

function toggleBlueprintCheckbox(el, value) {
  const idx = blueprintFormState.revenueModels.indexOf(value);
  if (idx > -1) {
    blueprintFormState.revenueModels.splice(idx, 1);
    el.classList.remove('checked');
  } else {
    blueprintFormState.revenueModels.push(value);
    el.classList.add('checked');
  }
}

function selectBlueprintRadio(value) {
  blueprintFormState.automationLevel = value;
  document.querySelectorAll('#bp-auto-group .blueprint-radio').forEach(r => {
    r.classList.toggle('selected', r.querySelector('input').value === value);
  });
}

function renderBlueprintLoading() {
  return `
    <div class="blueprint-loading">
      <div class="blueprint-loading-spinner"></div>
      <div class="blueprint-loading-text">Generating your blueprint<span class="blueprint-loading-dots"></span></div>
      <div class="blueprint-loading-sub">Analyzing business model and selecting optimal agents</div>
      <div class="blueprint-loading-steps" id="bp-loading-steps">
        <div class="blueprint-loading-step" data-step="0"><span class="bp-step-icon">\u25CB</span> Analyzing business model</div>
        <div class="blueprint-loading-step" data-step="1"><span class="bp-step-icon">\u25CB</span> Selecting agent configuration</div>
        <div class="blueprint-loading-step" data-step="2"><span class="bp-step-icon">\u25CB</span> Calculating revenue projections</div>
        <div class="blueprint-loading-step" data-step="3"><span class="bp-step-icon">\u25CB</span> Building phased rollout plan</div>
        <div class="blueprint-loading-step" data-step="4"><span class="bp-step-icon">\u25CB</span> Assessing risks and costs</div>
      </div>
    </div>
  `;
}

function animateBlueprintLoadingSteps() {
  const steps = document.querySelectorAll('#bp-loading-steps .blueprint-loading-step');
  if (!steps.length) return;
  let i = 0;
  const interval = setInterval(() => {
    if (i > 0 && steps[i - 1]) {
      steps[i - 1].classList.remove('active');
      steps[i - 1].classList.add('done');
      steps[i - 1].querySelector('.bp-step-icon').textContent = '\u2713';
    }
    if (i < steps.length) {
      steps[i].classList.add('active');
      steps[i].querySelector('.bp-step-icon').textContent = '\u25CF';
      i++;
    } else {
      clearInterval(interval);
    }
  }, 600);
}

function renderBlueprintOutput() {
  if (!blueprintData) return '<div>No blueprint data.</div>';
  const bp = blueprintData;

  const agentIconMap = {};
  if (typeof AgentDefs !== 'undefined') {
    AgentDefs.forEach(a => { agentIconMap[a.id] = a.icon; });
  }

  return `
    <div class="blueprint-output">
      <div class="blueprint-top-actions">
        <button class="blueprint-top-btn" onclick="blueprintView='form';renderBlueprintCreator(document.getElementById('main-content'));">
          \u2190 New Blueprint
        </button>
        <button class="blueprint-top-btn" onclick="exportBlueprintJSON()">
          \uD83D\uDCBE Export JSON
        </button>
        <button class="blueprint-top-btn primary" onclick="showToast('Agent activation coming in Phase 4', 'info')">
          \u26A1 Activate Agents
        </button>
      </div>

      <!-- Summary -->
      <div class="blueprint-card">
        <div class="blueprint-summary">
          <div class="blueprint-summary-bar"></div>
          <div class="blueprint-summary-content">
            <h2>${escapeHtml(bp.businessName)}</h2>
            <p>${escapeHtml(bp.summary)}</p>
          </div>
        </div>
      </div>

      <!-- Activated Agents -->
      <div class="blueprint-card">
        <div class="blueprint-card-title"><span class="bp-card-icon">\uD83E\uDD16</span> Activated Agents (${bp.agents.length})</div>
        <div class="blueprint-agent-grid">
          ${bp.agents.map(agent => {
            const icon = agentIconMap[agent.id] || '\uD83E\uDD16';
            return `
              <div class="bp-agent-card" onclick="navigate('agent/${agent.id}')">
                <div class="bp-agent-card-top">
                  <div class="bp-agent-card-name">${icon} ${escapeHtml(agent.name)}</div>
                  <span class="bp-agent-badge ${agent.priority}">${agent.priority}</span>
                </div>
                <div class="bp-agent-card-role">${escapeHtml(agent.role)}</div>
                <div class="bp-agent-card-phase">Activate in Phase ${agent.activatePhase}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Revenue Streams -->
      <div class="blueprint-card">
        <div class="blueprint-card-title"><span class="bp-card-icon">\uD83D\uDCB0</span> Revenue Streams</div>
        <table class="blueprint-table">
          <thead><tr><th>Stream</th><th>Est. Monthly</th><th>Timeline</th><th>Confidence</th></tr></thead>
          <tbody>
            ${bp.revenueStreams.map(rs => {
              const dot = rs.confidence === 'high' ? '\uD83D\uDFE2' : rs.confidence === 'medium' ? '\uD83D\uDFE1' : '\uD83D\uDD34';
              return `<tr><td>${escapeHtml(rs.stream)}</td><td class="bp-money">${escapeHtml(rs.estimatedMonthly)}</td><td>${escapeHtml(rs.timeline)}</td><td>${dot} ${rs.confidence}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Goals & KPIs -->
      <div class="blueprint-two-col">
        <div class="blueprint-card">
          <div class="blueprint-card-title"><span class="bp-card-icon">\uD83C\uDFAF</span> Goals</div>
          ${bp.goals.map(g => `
            <div class="bp-goal-item">
              <div class="bp-goal-text">${escapeHtml(g.goal)}</div>
              <div class="bp-goal-meta">
                <span>\uD83D\uDCCF ${escapeHtml(g.metric)}</span>
                <span>\uD83C\uDFAF ${escapeHtml(g.target)}</span>
                <span>\u23F0 ${escapeHtml(g.timeline)}</span>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="blueprint-card">
          <div class="blueprint-card-title"><span class="bp-card-icon">\uD83D\uDCCA</span> KPIs</div>
          ${bp.kpis.map(k => `
            <div class="bp-kpi-item">
              <div class="bp-kpi-name">${escapeHtml(k.name)}</div>
              <div style="display:flex;align-items:center;">
                <span class="bp-kpi-target">${escapeHtml(k.target)}</span>
                <span class="bp-kpi-freq">${k.frequency}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Phased Rollout -->
      <div class="blueprint-card">
        <div class="blueprint-card-title"><span class="bp-card-icon">\uD83D\uDE80</span> Phased Rollout</div>
        ${bp.phases.map(phase => `
          <div class="blueprint-phase">
            <div class="blueprint-phase-header">
              <span class="blueprint-phase-num">Phase ${phase.phase}</span>
              <span class="blueprint-phase-name">${escapeHtml(phase.name)}</span>
              <span class="blueprint-phase-dur">${escapeHtml(phase.duration)}</span>
            </div>
            <div class="blueprint-phase-tasks">
              ${phase.tasks.map(t => `<div class="blueprint-phase-task">${escapeHtml(t)}</div>`).join('')}
            </div>
            <div class="blueprint-phase-agents">
              ${phase.agents.map(aid => {
                const icon = agentIconMap[aid] || '\uD83E\uDD16';
                return `<span class="blueprint-phase-agent-tag">${icon} ${aid}</span>`;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Cost Estimate -->
      <div class="blueprint-card">
        <div class="blueprint-card-title"><span class="bp-card-icon">\uD83D\uDCB3</span> Cost Estimate</div>
        <div style="padding: 0 12px;">
          <div class="bp-cost-row"><span class="bp-cost-label">Infrastructure</span><span class="bp-cost-value">${escapeHtml(bp.costEstimate.infrastructure)}</span></div>
          <div class="bp-cost-row"><span class="bp-cost-label">AI API Costs</span><span class="bp-cost-value">${escapeHtml(bp.costEstimate.aiApiCosts)}</span></div>
          <div class="bp-cost-row"><span class="bp-cost-label">Tools & Services</span><span class="bp-cost-value">${escapeHtml(bp.costEstimate.toolsAndServices)}</span></div>
          <div class="bp-cost-total"><span class="bp-cost-label">Total Monthly</span><span class="bp-cost-value">${escapeHtml(bp.costEstimate.total)}</span></div>
        </div>
      </div>

      <!-- Risks -->
      <div class="blueprint-card">
        <div class="blueprint-card-title"><span class="bp-card-icon">\u26A0\uFE0F</span> Risks & Mitigations</div>
        ${bp.risks.map(r => `
          <div class="bp-risk-card">
            <div class="bp-risk-top">
              <span class="bp-risk-severity ${r.severity}">${r.severity}</span>
              <span class="bp-risk-text">${escapeHtml(r.risk)}</span>
            </div>
            <div class="bp-risk-mitigation"><strong>Mitigation:</strong> ${escapeHtml(r.mitigation)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function getDemoBlueprintData() {
  return {
    businessName: 'PoolPro Directory \u2014 Florida Pool Services',
    summary: 'A comprehensive online directory and lead-generation platform connecting pool service companies with homeowners across Florida. The platform combines SEO-driven organic traffic with paid premium listings, affiliate partnerships, and lead generation to build a sustainable multi-revenue business within 6 months.',
    agents: [
      { id: 'website-builder', name: 'Website Builder', role: 'Build and maintain the PoolPro directory site with listings, search, and lead capture forms', priority: 'critical', activatePhase: 1 },
      { id: 'seo', name: 'SEO Agent', role: 'Optimize all directory pages for local SEO (\"pool service + city\" keywords) and manage Google Business integrations', priority: 'critical', activatePhase: 1 },
      { id: 'content', name: 'Content Agent', role: 'Generate blog posts, pool care guides, and city-specific landing pages to drive organic traffic', priority: 'high', activatePhase: 1 },
      { id: 'lead-gen', name: 'Lead Gen Agent', role: 'Capture homeowner leads via quote request forms and route them to subscribed pool companies', priority: 'critical', activatePhase: 2 },
      { id: 'marketing', name: 'Marketing Agent', role: 'Run social media campaigns, email newsletters, and seasonal promotions for the directory', priority: 'high', activatePhase: 2 },
      { id: 'email', name: 'Email Agent', role: 'Automate onboarding sequences for new pool companies, lead notifications, and review requests', priority: 'high', activatePhase: 2 },
      { id: 'sales', name: 'Sales Agent', role: 'Handle outbound outreach to pool companies for premium listing upgrades and sponsorships', priority: 'medium', activatePhase: 2 },
      { id: 'analytics', name: 'Analytics Agent', role: 'Track traffic, conversion funnels, lead quality scores, and revenue attribution per channel', priority: 'high', activatePhase: 1 },
      { id: 'backlink', name: 'Backlink Agent', role: 'Build domain authority through local business citations, guest posts, and pool industry partnerships', priority: 'medium', activatePhase: 2 },
      { id: 'back-office', name: 'Back Office Agent', role: 'Handle billing, invoicing for premium listings, and financial reporting', priority: 'medium', activatePhase: 3 }
    ],
    goals: [
      { goal: 'Index 500+ pool companies across Florida', metric: 'Total active listings', target: '500 listings', timeline: 'Month 1-3' },
      { goal: 'Reach 10,000 monthly organic visitors', metric: 'Google Analytics monthly sessions', target: '10,000 sessions', timeline: 'Month 3-6' },
      { goal: 'Generate 200+ qualified leads per month', metric: 'Lead form submissions', target: '200 leads/mo', timeline: 'Month 4-6' },
      { goal: 'Achieve $10,000 MRR', metric: 'Monthly recurring revenue', target: '$10,000 MRR', timeline: 'Month 6-9' }
    ],
    revenueStreams: [
      { stream: 'Premium Listings', estimatedMonthly: '$4,200', timeline: 'Month 2', confidence: 'high' },
      { stream: 'Lead Generation Fees', estimatedMonthly: '$3,500', timeline: 'Month 3', confidence: 'high' },
      { stream: 'Display Ads', estimatedMonthly: '$1,200', timeline: 'Month 4', confidence: 'medium' },
      { stream: 'Affiliate Commissions', estimatedMonthly: '$800', timeline: 'Month 3', confidence: 'medium' },
      { stream: 'Sponsored Content', estimatedMonthly: '$600', timeline: 'Month 5', confidence: 'low' }
    ],
    kpis: [
      { name: 'Organic Traffic', target: '10,000/mo', frequency: 'weekly' },
      { name: 'Lead Conversion Rate', target: '> 4.5%', frequency: 'weekly' },
      { name: 'Premium Listing Sign-ups', target: '30/mo', frequency: 'monthly' },
      { name: 'Domain Authority', target: 'DA 25+', frequency: 'monthly' },
      { name: 'Revenue per Lead', target: '$17.50', frequency: 'weekly' },
      { name: 'Customer Acquisition Cost', target: '< $45', frequency: 'monthly' }
    ],
    phases: [
      {
        phase: 1, name: 'Foundation & Content', duration: '4 weeks',
        tasks: [
          'Build directory site with search and company profiles',
          'Create 50 city-specific landing pages for top Florida markets',
          'Set up analytics dashboards and conversion tracking',
          'Publish 20 SEO-optimized blog posts on pool maintenance',
          'Claim and optimize Google Business profiles'
        ],
        agents: ['website-builder', 'seo', 'content', 'analytics']
      },
      {
        phase: 2, name: 'Growth & Monetization', duration: '6 weeks',
        tasks: [
          'Launch premium listing tiers ($49/mo, $99/mo, $199/mo)',
          'Activate lead capture and routing system',
          'Begin outbound sales to top-50 pool companies',
          'Launch email onboarding and drip campaigns',
          'Start backlink building with local citations',
          'Run Facebook/Instagram campaigns targeting Florida homeowners'
        ],
        agents: ['lead-gen', 'marketing', 'email', 'sales', 'backlink']
      },
      {
        phase: 3, name: 'Scale & Optimize', duration: '8 weeks',
        tasks: [
          'Expand to 25+ Florida cities with dedicated pages',
          'Implement automated billing and invoicing',
          'Launch affiliate program with pool supply retailers',
          'A/B test landing pages and lead forms',
          'Introduce sponsored content partnerships'
        ],
        agents: ['back-office', 'analytics', 'content', 'marketing']
      }
    ],
    costEstimate: {
      infrastructure: '$85/mo',
      aiApiCosts: '$120/mo',
      toolsAndServices: '$95/mo',
      total: '$300/mo'
    },
    risks: [
      { risk: 'Low initial organic traffic delays revenue', mitigation: 'Supplement with paid advertising ($200/mo budget) during months 1-3 and focus on long-tail local keywords with less competition', severity: 'high' },
      { risk: 'Pool companies reluctant to pay for premium listings', mitigation: 'Offer 30-day free trial of premium features and use lead delivery proof-of-value to convert free users', severity: 'medium' },
      { risk: 'Seasonal demand fluctuation in pool services', mitigation: 'Diversify content to include winterization and year-round maintenance. Expand to other home services if needed.', severity: 'low' }
    ]
  };
}

async function generateBlueprint() {
  const s = blueprintFormState;
  if (!s.businessName.trim() && !s.businessIdea.trim()) {
    showToast('Please enter a business name and idea', 'error');
    return;
  }

  // Switch to loading view
  blueprintView = 'loading';
  renderBlueprintCreator(document.getElementById('main-content'));

  const hasApiKey = !!aiConfig.openrouterKey;

  if (hasApiKey) {
    // REAL AI MODE
    try {
      const systemPrompt = `You are the ABOS Blueprint Architect. Given a business description, generate a comprehensive operational blueprint as a JSON object with this exact structure:
{
  "businessName": "...",
  "summary": "2-3 sentence executive summary",
  "agents": [
    {"id": "agent-id-from-abos", "name": "Agent Name", "role": "What this agent does for THIS business", "priority": "critical|high|medium|low", "activatePhase": 1}
  ],
  "goals": [
    {"goal": "Goal description", "metric": "How to measure", "target": "Target value", "timeline": "e.g., Month 1-3"}
  ],
  "revenueStreams": [
    {"stream": "Revenue type", "estimatedMonthly": "$X,XXX", "timeline": "When it starts", "confidence": "high|medium|low"}
  ],
  "kpis": [
    {"name": "KPI name", "target": "Target value", "frequency": "daily|weekly|monthly"}
  ],
  "phases": [
    {"phase": 1, "name": "Phase Name", "duration": "X weeks", "tasks": ["task1", "task2"], "agents": ["agent-ids"]}
  ],
  "costEstimate": {
    "infrastructure": "$XX/mo",
    "aiApiCosts": "$XX/mo",
    "toolsAndServices": "$XX/mo",
    "total": "$XX/mo"
  },
  "risks": [
    {"risk": "Description", "mitigation": "How to handle", "severity": "high|medium|low"}
  ]
}

Available ABOS agents: general-chat, saas-builder, website-builder, app-builder, seo, backlink, marketing, lead-gen, back-office, analytics, sales, email, content, compliance, scraper, voice-ai.
Select only the agents relevant to this business. Be specific and realistic.
Respond ONLY with the JSON object, no markdown, no explanation.`;

      const userMessage = `Business Name: ${s.businessName}
Business Idea: ${s.businessIdea}
Industry/Niche: ${s.industry}
Target Market: ${s.targetMarket}
Revenue Models: ${s.revenueModels.join(', ') || 'Not specified'}
Monthly Revenue Target: $${s.revenueTarget || 'Not specified'}
Monthly Budget Constraint: $${s.budgetConstraint || 'Not specified'}
Automation Level: ${s.automationLevel}
Key Constraints: ${s.constraints || 'None'}`;

      const model = aiConfig.defaultModel || 'claude-3.5-sonnet';
      const responseText = await OpenRouterAPI.chat(
        aiConfig.openrouterKey,
        model,
        [{ role: 'user', content: userMessage }],
        systemPrompt,
        { temperature: 0.7, maxTokens: 4096 }
      );

      // Parse JSON from response (strip markdown fences if present)
      let jsonStr = responseText.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      blueprintData = JSON.parse(jsonStr);
      blueprintView = 'output';
      renderBlueprintCreator(document.getElementById('main-content'));
    } catch (err) {
      showToast('Blueprint generation failed: ' + err.message, 'error');
      blueprintView = 'form';
      renderBlueprintCreator(document.getElementById('main-content'));
    }
  } else {
    // DEMO MODE — simulate delay then show mock data
    setTimeout(() => {
      blueprintData = getDemoBlueprintData();
      // If user entered a name, use it
      if (s.businessName.trim()) {
        blueprintData.businessName = s.businessName;
      }
      blueprintView = 'output';
      renderBlueprintCreator(document.getElementById('main-content'));
    }, 3200);
  }
}

function exportBlueprintJSON() {
  if (!blueprintData) return;
  const data = JSON.stringify(blueprintData, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (blueprintData.businessName || 'blueprint').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() + '-blueprint.json';
  a.click();
  showToast('Blueprint exported as JSON', 'success');
}

// ============================================
// FILE SYSTEM UTILITIES
// ============================================
function getFileIcon(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  const iconMap = {
    pdf: '\uD83D\uDCD5', doc: '\uD83D\uDCD8', docx: '\uD83D\uDCD8',
    xls: '\uD83D\uDCCA', xlsx: '\uD83D\uDCCA', csv: '\uD83D\uDCCA', tsv: '\uD83D\uDCCA',
    txt: '\uD83D\uDCDD', md: '\uD83D\uDCDD',
    json: '\uD83D\uDCCB', xml: '\uD83D\uDCCB',
    py: '\uD83D\uDC0D', js: '\uD83D\uDFE8', ts: '\uD83D\uDD37',
    html: '\uD83C\uDF10', css: '\uD83C\uDFA8', sql: '\uD83D\uDDC3\uFE0F',
    png: '\uD83D\uDDBC\uFE0F', jpg: '\uD83D\uDDBC\uFE0F', jpeg: '\uD83D\uDDBC\uFE0F',
    gif: '\uD83D\uDDBC\uFE0F', svg: '\uD83D\uDDBC\uFE0F', webp: '\uD83D\uDDBC\uFE0F',
    yaml: '\u2699\uFE0F', yml: '\u2699\uFE0F', sh: '\uD83D\uDCBB'
  };
  return iconMap[ext] || '\uD83D\uDCC4';
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function isTextFile(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  return ['txt','md','csv','tsv','json','xml','html','css','js','ts','py','sql','yaml','yml','sh','jsx','tsx','rb','go','rs','java','c','cpp','h','hpp','swift','kt','r','pl','php','bat','ps1','toml','ini','cfg','conf','env','log'].includes(ext);
}

function isImageFile(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  return ['png','jpg','jpeg','gif','svg','webp','bmp','ico'].includes(ext);
}

async function readFileContent(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  
  // --- DOCX: extract text with mammoth.js ---
  if (ext === 'docx') {
    try {
      if (typeof mammoth !== 'undefined') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        if (result.value && result.value.trim()) {
          return { type: 'text', content: result.value };
        }
      }
    } catch (e) { console.warn('DOCX parse failed:', e); }
    return { type: 'text', content: `[DOCX file: ${file.name} — could not extract text. Please copy/paste the content.]` };
  }
  
  // --- Legacy DOC: not supported by mammoth ---
  if (ext === 'doc') {
    return { type: 'text', content: `[Legacy .doc file: ${file.name} — please save as .docx for full text extraction. You can describe the contents and I'll help.]` };
  }
  
  // --- PPT/PPTX: no client-side parser available ---
  if (ext === 'pptx' || ext === 'ppt') {
    return { type: 'text', content: `[PowerPoint file: ${file.name} (${Math.round(file.size / 1024)} KB) — direct text extraction is not available for presentations. Please describe the content or copy/paste the key slides.]` };
  }
  
  // --- XLSX/XLS/CSV: extract with SheetJS ---
  if (['xlsx', 'xls', 'xlsm'].includes(ext)) {
    try {
      if (typeof XLSX !== 'undefined') {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        let allText = '';
        workbook.SheetNames.forEach(name => {
          const sheet = workbook.Sheets[name];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          allText += `--- Sheet: ${name} ---\n${csv}\n\n`;
        });
        if (allText.trim()) {
          return { type: 'text', content: allText };
        }
      }
    } catch (e) { console.warn('XLSX parse failed:', e); }
    return { type: 'text', content: `[Excel file: ${file.name} — could not extract data.]` };
  }
  
  // --- PDF: extract text with pdf.js ---
  if (ext === 'pdf') {
    try {
      if (typeof pdfjsLib !== 'undefined') {
        // Disable worker to avoid cross-origin/sandboxed iframe issues
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer),
          useWorkerFetch: false,
          isEvalSupported: false,
          useSystemFonts: true
        });
        const pdf = await loadingTask.promise;
        let fullText = '';
        const maxPages = Math.min(pdf.numPages, 50);
        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          // Better text reconstruction: respect vertical positions for line breaks
          let lastY = null;
          let pageText = '';
          textContent.items.forEach(item => {
            if (item.str === undefined) return;
            const currentY = item.transform ? item.transform[5] : null;
            if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 2) {
              pageText += '\n';
            } else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
              pageText += ' ';
            }
            pageText += item.str;
            lastY = currentY;
          });
          fullText += `--- Page ${i} ---\n${pageText.trim()}\n\n`;
        }
        if (pdf.numPages > maxPages) {
          fullText += `\n[... ${pdf.numPages - maxPages} more pages not shown]\n`;
        }
        if (fullText.trim()) {
          return { type: 'text', content: fullText };
        }
      } else {
        console.warn('pdfjsLib not loaded');
      }
    } catch (e) { console.warn('PDF parse failed:', e); }
    // Fallback message
    return { type: 'text', content: `[PDF file: ${file.name} (${Math.round(file.size / 1024)} KB) — text extraction failed. Please copy/paste key content.]` };
  }
  
  // --- Text files: read as text ---
  if (isTextFile(file.name)) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ type: 'text', content: reader.result });
      reader.onerror = () => resolve({ type: 'text', content: '[Could not read file]' });
      reader.readAsText(file);
    });
  }
  
  // --- Images: read as base64 data URL ---
  if (isImageFile(file.name)) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ type: 'image', content: reader.result });
      reader.onerror = () => resolve({ type: 'image', content: '' });
      reader.readAsDataURL(file);
    });
  }
  
  // --- Binary fallback ---
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = btoa(
        new Uint8Array(reader.result).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      resolve({ type: 'binary', content: base64 });
    };
    reader.onerror = () => resolve({ type: 'binary', content: '' });
    reader.readAsArrayBuffer(file);
  });
}

function handleFileUpload(event, agentId) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  files.forEach(file => {
    if (file.size > 10 * 1024 * 1024) {
      showToast(`File ${file.name} is too large (max 10MB)`, 'error');
      return;
    }
    pendingFiles.push(file);
  });
  renderPendingFiles();
  // Reset the input so the same file can be re-selected
  event.target.value = '';
}

function removePendingFile(index) {
  pendingFiles.splice(index, 1);
  renderPendingFiles();
}

function renderPendingFiles() {
  const strip = document.getElementById('chat-file-preview');
  if (!strip) return;
  if (pendingFiles.length === 0) {
    strip.style.display = 'none';
    strip.innerHTML = '';
    return;
  }
  strip.style.display = 'flex';
  strip.innerHTML = pendingFiles.map((f, i) => `
    <div class="file-preview-item">
      <span>${getFileIcon(f.name)}</span>
      <span style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.name)}</span>
      <span style="color:var(--color-text-faint);">${formatFileSize(f.size)}</span>
      <span class="file-preview-remove" onclick="removePendingFile(${i})" title="Remove">&times;</span>
    </div>
  `).join('');
}

async function saveFileToBackend(agentId, sessionId, filename, filetype, filesize, content, source) {
  try {
    const res = await fetch(`${CGI_BIN}/api.py/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, sessionId, filename, filetype, filesize, content, source })
    });
    return await res.json();
  } catch (err) {
    console.warn('Failed to save file to backend:', err.message);
    return null;
  }
}

async function loadFilesForAgent(agentId) {
  try {
    const sessionId = MemoryStore.getCurrentSession(agentId);
    const res = await fetch(`${CGI_BIN}/api.py/files?agent_id=${encodeURIComponent(agentId)}${sessionId ? '&session_id=' + encodeURIComponent(sessionId) : ''}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      fileCache[agentId] = data;
    }
  } catch (err) {
    console.warn('Failed to load files:', err.message);
  }
  return fileCache[agentId] || [];
}

async function downloadFile(fileId) {
  try {
    let file;
    
    // Check if this is a locally-stored file (too large for backend)
    const localFile = Object.values(fileCache).flat().find(f => f.id === fileId && f._local);
    if (localFile) {
      file = localFile;
    } else {
      const res = await fetch(`${CGI_BIN}/api.py/files?id=${encodeURIComponent(fileId)}`);
      file = await res.json();
      if (file.error) { showToast(file.error, 'error'); return; }
    }
    
    let blob;
    
    // PDF data URI (generated by jsPDF)
    if (file.content && file.content.startsWith('data:application/pdf')) {
      const parts = file.content.split(',');
      const binary = atob(parts[1]);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      blob = new Blob([arr], { type: 'application/pdf' });
    } else if (isImageFile(file.filename) && file.content && file.content.startsWith('data:')) {
      const parts = file.content.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
      const binary = atob(parts[1]);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      blob = new Blob([arr], { type: mime });
    } else if (isTextFile(file.filename)) {
      blob = new Blob([file.content], { type: 'text/plain' });
    } else {
      // Base64 binary fallback
      try {
        const binary = atob(file.content);
        const arr = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
        blob = new Blob([arr], { type: 'application/octet-stream' });
      } catch(e) {
        blob = new Blob([file.content], { type: 'text/plain' });
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast('Download failed: ' + err.message, 'error');
  }
}

async function deleteFile(fileId, agentId) {
  try {
    await fetch(`${CGI_BIN}/api.py/files?id=${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    if (fileCache[agentId]) {
      fileCache[agentId] = fileCache[agentId].filter(f => f.id !== fileId);
    }
    refreshArtifactsPanel(agentId);
    showToast('File deleted', 'success');
  } catch (err) {
    showToast('Delete failed', 'error');
  }
}

function downloadAllArtifacts(agentId) {
  const files = fileCache[agentId] || [];
  if (files.length === 0) { showToast('No files to download', 'info'); return; }
  showToast(`Downloading ${files.length} files...`, 'info');
  files.forEach((f, i) => {
    setTimeout(() => downloadFile(f.id), i * 300);
  });
}

function detectAndCreateArtifacts(agentId, responseContent) {
  const artifacts = [];
  // Match code blocks: ```lang\n# filename: xxx.ext or // filename: xxx.ext or // output: xxx.ext
  const codeBlockRegex = /```(\w+)?\n(?:#|\/\/|\/\*|--|;)\s*(?:filename|output):\s*([^\n*\/]+?)(?:\s*\*\/)?\n([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockRegex.exec(responseContent)) !== null) {
    const lang = match[1] || 'txt';
    const filename = match[2].trim();
    const code = match[3];
    artifacts.push({
      filename,
      filetype: filename.split('.').pop() || lang,
      content: code,
      source: 'generated'
    });
  }
  return artifacts;
}

// Generate a real PDF binary (base64) from markdown/text content using jsPDF
function generatePDFFromText(textContent, filename) {
  if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
    console.warn('jsPDF not loaded');
    return null;
  }
  const { jsPDF } = window.jspdf || jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const usableWidth = pageWidth - margin * 2;
  let y = margin;
  const lineHeight = 6;
  const headingLineHeight = 9;
  
  // Parse simple markdown-like formatting
  const lines = textContent.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Check if we need a new page
    if (y > pageHeight - margin - 10) {
      doc.addPage();
      y = margin;
    }
    
    // Heading detection (# ## ###)
    if (line.startsWith('### ')) {
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      const text = line.replace(/^###\s+/, '').replace(/\*\*/g, '');
      const wrapped = doc.splitTextToSize(text, usableWidth);
      wrapped.forEach(wl => {
        if (y > pageHeight - margin - 10) { doc.addPage(); y = margin; }
        doc.text(wl, margin, y);
        y += lineHeight + 1;
      });
      y += 2;
      continue;
    }
    if (line.startsWith('## ')) {
      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      const text = line.replace(/^##\s+/, '').replace(/\*\*/g, '');
      const wrapped = doc.splitTextToSize(text, usableWidth);
      wrapped.forEach(wl => {
        if (y > pageHeight - margin - 10) { doc.addPage(); y = margin; }
        doc.text(wl, margin, y);
        y += headingLineHeight;
      });
      y += 3;
      continue;
    }
    if (line.startsWith('# ')) {
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      const text = line.replace(/^#\s+/, '').replace(/\*\*/g, '');
      const wrapped = doc.splitTextToSize(text, usableWidth);
      wrapped.forEach(wl => {
        if (y > pageHeight - margin - 10) { doc.addPage(); y = margin; }
        doc.text(wl, margin, y);
        y += headingLineHeight + 2;
      });
      y += 4;
      continue;
    }
    
    // Horizontal rule
    if (line.match(/^[-*_]{3,}$/)) {
      doc.setDrawColor(180);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;
      continue;
    }
    
    // Empty line = paragraph break
    if (line.trim() === '') {
      y += 3;
      continue;
    }
    
    // Bullet points
    let isBullet = false;
    if (line.match(/^\s*[-*•]\s+/)) {
      isBullet = true;
      line = line.replace(/^\s*[-*•]\s+/, '');
    }
    if (line.match(/^\s*\d+\.\s+/)) {
      isBullet = true;
      // Keep numbered prefix
    }
    
    // Strip bold markdown markers for PDF text
    const cleanLine = line.replace(/\*\*/g, '');
    
    // Determine if this line should be bold (was wrapped in **)
    const hasBold = line.includes('**');
    
    doc.setFontSize(11);
    doc.setFont('helvetica', hasBold ? 'bold' : 'normal');
    
    const indent = isBullet ? margin + 5 : margin;
    const textWidth = isBullet ? usableWidth - 5 : usableWidth;
    const wrapped = doc.splitTextToSize(cleanLine, textWidth);
    
    wrapped.forEach((wl, wi) => {
      if (y > pageHeight - margin - 10) { doc.addPage(); y = margin; }
      if (isBullet && wi === 0) {
        doc.setFont('helvetica', 'normal');
        doc.text('•', margin, y);
        doc.setFont('helvetica', hasBold ? 'bold' : 'normal');
      }
      doc.text(wl, indent, y);
      y += lineHeight;
    });
  }
  
  // Return as base64 data URI
  const pdfBase64 = doc.output('datauristring');
  return pdfBase64;
}

async function processArtifacts(agentId, responseContent) {
  const sessionId = MemoryStore.getCurrentSession(agentId);
  const artifacts = detectAndCreateArtifacts(agentId, responseContent);
  for (const art of artifacts) {
    let contentToSave = art.content;
    let filesizeToSave = art.content.length;
    
    // For PDF files, generate real PDF binary from text content
    if (art.filetype === 'pdf') {
      const pdfDataUri = generatePDFFromText(art.content, art.filename);
      if (pdfDataUri) {
        contentToSave = pdfDataUri;
        filesizeToSave = pdfDataUri.length;
      }
    }
    
    // Try to save to backend (may fail for large files like PDFs)
    let saved = null;
    if (filesizeToSave <= 800000) {
      saved = await saveFileToBackend(agentId, sessionId, art.filename, art.filetype, filesizeToSave, contentToSave, 'generated');
    }
    
    if (!saved || !saved.id) {
      // Store locally in fileCache with a client-side ID for download
      const localId = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      saved = { id: localId, filename: art.filename, filetype: art.filetype, filesize: filesizeToSave, content: contentToSave, source: 'generated', created_at: new Date().toISOString(), _local: true };
    }
    
    if (!fileCache[agentId]) fileCache[agentId] = [];
    fileCache[agentId].unshift(saved);
  }
  if (artifacts.length > 0) {
    refreshArtifactsPanel(agentId);
  }
  return artifacts;
}

function buildFileContextForMessage(filesData) {
  if (!filesData || filesData.length === 0) return '';
  let context = '\n[Attached files]\n';
  filesData.forEach(fd => {
    const icon = getFileIcon(fd.filename);
    context += `${icon} ${fd.filename} (${formatFileSize(fd.filesize)}):\n`;
    if (fd.readType === 'text') {
      const ext = fd.filename.split('.').pop().toLowerCase();
      const lines = fd.content.split('\n');
      const maxLines = (ext === 'csv' || ext === 'tsv') ? 100 : 200;
      const truncated = lines.slice(0, maxLines).join('\n');
      context += '```' + ext + '\n' + truncated;
      if (lines.length > maxLines) context += `\n... (${lines.length - maxLines} more lines)`;
      context += '\n```\n\n';
    } else if (fd.readType === 'image') {
      context += `[Image attached: ${fd.filename} — the image is included in this message for your visual analysis]\n\n`;
    } else {
      const ext = fd.filename.split('.').pop().toLowerCase();
      context += `[Binary file attached: ${fd.filename} (${ext.toUpperCase()}) - content available for reference]\n\n`;
    }
  });
  context += '[User message]\n';
  return context;
}

function toggleArtifactsPanel() {
  artifactsPanelOpen = !artifactsPanelOpen;
  if (artifactsPanelOpen && currentAgentId) {
    loadFilesForAgent(currentAgentId).then(() => {
      renderAgentChat(document.getElementById('main-content'));
    });
  } else {
    renderAgentChat(document.getElementById('main-content'));
  }
}

// ============================================
// PREVIEW PANEL (OpenCode workspace preview)
// ============================================

// Cache of OpenCode workspace files per agent: agentId -> [{name, path, type}]
let previewFileCache = {};

function togglePreviewPanel(agentId) {
  previewPanelOpen = !previewPanelOpen;
  previewCurrentFile = null;
  renderAgentChat(document.getElementById('main-content'));
}

async function loadPreviewFiles(agentId) {
  const tabsEl = document.getElementById('preview-file-tabs');
  const wrapEl = document.getElementById('preview-iframe-wrap');
  const statusEl = document.getElementById('preview-status');
  if (!tabsEl || !wrapEl) return;

  if (statusEl) statusEl.textContent = 'Loading files...';

  try {
    const listing = await OpenCodeAPI.listFiles('/');
    // listing is an array of {name, path, absolute, type, ignored}
    // Filter to previewable files (html, css, js, json, txt, md, images)
    const previewable = (listing || []).filter(f => {
      if (f.type === 'directory') return false;
      if (f.ignored) return false;
      const ext = (f.name || '').split('.').pop().toLowerCase();
      return ['html','htm','css','js','json','txt','md','svg','xml','jsx','tsx','ts','py','yaml','yml'].includes(ext);
    });

    previewFileCache[agentId] = previewable;

    if (previewable.length === 0) {
      tabsEl.innerHTML = '';
      wrapEl.innerHTML = `
        <div class="preview-empty">
          <div class="preview-empty-icon">\uD83D\uDCC2</div>
          <div class="preview-empty-text">No previewable files in the workspace yet.<br>Ask the agent to build something!</div>
        </div>`;
      if (statusEl) statusEl.textContent = 'No files found';
      return;
    }

    // Render file tabs
    tabsEl.innerHTML = previewable.map(f => {
      const isActive = previewCurrentFile && previewCurrentFile.name === f.name;
      return `<button class="preview-file-tab ${isActive ? 'active' : ''}" onclick="previewFile('${agentId}', '${escapeHtml(f.name)}')">${escapeHtml(f.name)}</button>`;
    }).join('');

    // Auto-select: prioritize index.html, then any .html, then first file
    let autoSelect = previewable.find(f => f.name === 'index.html')
      || previewable.find(f => f.name.endsWith('.html') || f.name.endsWith('.htm'))
      || previewable[0];

    // If we already had a file selected, keep it
    if (previewCurrentFile) {
      const still = previewable.find(f => f.name === previewCurrentFile.name);
      if (still) autoSelect = still;
    }

    if (autoSelect) {
      await previewFile(agentId, autoSelect.name);
    }
    if (statusEl) statusEl.textContent = `${previewable.length} file${previewable.length !== 1 ? 's' : ''}`;

  } catch (err) {
    wrapEl.innerHTML = `
      <div class="preview-empty">
        <div class="preview-empty-icon">\u26A0\uFE0F</div>
        <div class="preview-empty-text">Failed to load files<br><span style="font-size:11px;color:var(--color-error);">${escapeHtml(err.message)}</span></div>
      </div>`;
    if (statusEl) statusEl.textContent = 'Error';
  }
}

async function previewFile(agentId, filename) {
  const wrapEl = document.getElementById('preview-iframe-wrap');
  const statusEl = document.getElementById('preview-status');
  if (!wrapEl) return;

  // Update tab highlighting
  document.querySelectorAll('.preview-file-tab').forEach(t => {
    t.classList.toggle('active', t.textContent === filename);
  });

  // Show loading
  wrapEl.innerHTML = '<div class="preview-loading">Loading ' + escapeHtml(filename) + '...</div>';
  if (statusEl) statusEl.textContent = 'Loading...';

  try {
    const data = await OpenCodeAPI.readFile(filename);
    // data is {type, content} — content is the file text
    const content = (data && data.content) || (typeof data === 'string' ? data : '');
    const ext = filename.split('.').pop().toLowerCase();

    previewCurrentFile = { name: filename, content };

    if (['html', 'htm'].includes(ext)) {
      // Inject a link-interceptor script so clicking local links (e.g. about.html)
      // sends a message to the parent instead of navigating (which would fail in srcdoc)
      const linkInterceptor = `<script>
        document.addEventListener('click', function(e) {
          var a = e.target.closest('a');
          if (!a) return;
          var href = a.getAttribute('href');
          if (!href) return;
          // Skip anchors (#), javascript:, mailto:, tel:, and absolute URLs
          if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
          if (/^https?:\/\//i.test(href)) return;
          // It's a local file link — intercept it
          e.preventDefault();
          e.stopPropagation();
          window.parent.postMessage({ type: 'preview-navigate', file: href }, '*');
        }, true);
      <\/script>`;

      // Insert interceptor just before </body> or at the end
      let augmented = content;
      if (augmented.includes('</body>')) {
        augmented = augmented.replace('</body>', linkInterceptor + '</body>');
      } else {
        augmented = augmented + linkInterceptor;
      }

      wrapEl.innerHTML = `<iframe sandbox="allow-scripts allow-same-origin" srcdoc="" style="width:100%;height:100%;border:none;background:#fff;"></iframe>`;
      const iframe = wrapEl.querySelector('iframe');
      if (iframe) iframe.srcdoc = augmented;
    } else if (['svg'].includes(ext)) {
      // Render SVG inline
      wrapEl.innerHTML = `<div style="padding:20px;display:flex;align-items:center;justify-content:center;height:100%;background:#fff;">${content}</div>`;
    } else {
      // Show as syntax-highlighted code
      const escaped = escapeHtml(content);
      wrapEl.innerHTML = `
        <div style="padding:16px;overflow:auto;height:100%;background:var(--color-surface-1);">
          <pre style="margin:0;font-size:12px;font-family:'JetBrains Mono',monospace;white-space:pre-wrap;word-break:break-word;color:var(--color-text-muted);line-height:1.6;">${escaped}</pre>
        </div>`;
    }

    if (statusEl) statusEl.textContent = filename;

  } catch (err) {
    wrapEl.innerHTML = `
      <div class="preview-empty">
        <div class="preview-empty-icon">\u26A0\uFE0F</div>
        <div class="preview-empty-text">Failed to load ${escapeHtml(filename)}<br><span style="font-size:11px;color:var(--color-error);">${escapeHtml(err.message)}</span></div>
      </div>`;
    if (statusEl) statusEl.textContent = 'Error';
  }
}

async function refreshPreview(agentId) {
  await loadPreviewFiles(agentId);
  showToast('Preview refreshed', 'success');
}

function switchArtifactsTab(tab) {
  artifactsActiveTab = tab;
  const agentId = currentAgentId;
  if (!agentId) return;
  document.querySelectorAll('.artifacts-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  renderArtifactsList(agentId);
}

function renderArtifactsList(agentId) {
  const listEl = document.getElementById('artifacts-list');
  if (!listEl) return;
  const files = fileCache[agentId] || [];
  const filtered = files.filter(f => {
    if (artifactsActiveTab === 'uploaded') return f.source === 'upload';
    if (artifactsActiveTab === 'generated') return f.source === 'generated';
    return true;
  });
  const countEl = document.getElementById('artifacts-count');
  if (countEl) countEl.textContent = filtered.length + ' file' + (filtered.length !== 1 ? 's' : '');
  if (filtered.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:var(--space-6);color:var(--color-text-faint);font-size:var(--text-xs);">No files yet</div>';
    return;
  }
  listEl.innerHTML = filtered.map(f => `
    <div class="artifact-item" onclick="downloadFile('${f.id}')">
      <div class="artifact-icon">${getFileIcon(f.filename)}</div>
      <div class="artifact-info">
        <div class="artifact-name">${escapeHtml(f.filename)}</div>
        <div class="artifact-meta">${formatFileSize(f.filesize)} \u00B7 ${f.source === 'upload' ? 'Uploaded' : 'Generated'} \u00B7 ${formatTimeAgo(f.created_at)}</div>
      </div>
      <button class="artifact-delete" onclick="event.stopPropagation(); deleteFile('${f.id}', '${agentId}')" title="Delete">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <button class="artifact-download" title="Download">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
    </div>
  `).join('');
}

function refreshArtifactsPanel(agentId) {
  if (artifactsPanelOpen) {
    renderArtifactsList(agentId);
  }
}

function setupDragDrop(agentId) {
  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl) return;
  let dragCounter = 0;
  messagesEl.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      let overlay = document.getElementById('chat-drop-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'chat-drop-overlay';
        overlay.className = 'chat-drop-overlay';
        overlay.innerHTML = '<div class="drop-overlay-content"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><span>Drop files here</span></div>';
        messagesEl.style.position = 'relative';
        messagesEl.appendChild(overlay);
      }
    }
  });
  messagesEl.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      const overlay = document.getElementById('chat-drop-overlay');
      if (overlay) overlay.remove();
    }
  });
  messagesEl.addEventListener('dragover', (e) => { e.preventDefault(); });
  messagesEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    const overlay = document.getElementById('chat-drop-overlay');
    if (overlay) overlay.remove();
    const files = Array.from(e.dataTransfer.files || []);
    files.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        showToast(`File ${file.name} is too large (max 10MB)`, 'error');
        return;
      }
      pendingFiles.push(file);
    });
    renderPendingFiles();
  });
}

// ============================================
// UTILITIES
// ============================================
function formatTimeAgo(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
  return date.toLocaleDateString();
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span style="color:var(--color-${type === 'success' ? 'success' : type === 'error' ? 'error' : 'primary'}); margin-right:var(--space-2);">●</span> ${message}`;
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function getLogoSVG(size = 24) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g>
      <!-- Outer hexagon -->
      <path d="M24 2L43.6 13V35L24 46L4.4 35V13L24 2Z" stroke="var(--color-primary)" stroke-width="2.5" fill="none"/>
      <!-- Inner network nodes -->
      <circle cx="24" cy="14" r="3" fill="var(--color-primary)"/>
      <circle cx="15" cy="28" r="3" fill="var(--color-primary)"/>
      <circle cx="33" cy="28" r="3" fill="var(--color-primary)"/>
      <circle cx="24" cy="24" r="4" fill="var(--color-primary)" opacity="0.3"/>
      <!-- Connection lines -->
      <line x1="24" y1="14" x2="15" y2="28" stroke="var(--color-primary)" stroke-width="1.5" opacity="0.6"/>
      <line x1="24" y1="14" x2="33" y2="28" stroke="var(--color-primary)" stroke-width="1.5" opacity="0.6"/>
      <line x1="15" y1="28" x2="33" y2="28" stroke="var(--color-primary)" stroke-width="1.5" opacity="0.6"/>
      <!-- Center pulse -->
      <circle cx="24" cy="24" r="2" fill="var(--color-primary)"/>
    </g>
  </svg>`;
}
