import { createClient } from '@supabase/supabase-js';
import './style.css';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const env = import.meta.env;
const supabaseReady = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY &&
  !env.VITE_SUPABASE_URL.includes('SEU-PROJETO') && !env.VITE_SUPABASE_ANON_KEY.includes('SUA_CHAVE'));
const supabase = supabaseReady ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY) : null;

const defaults = {
  theme: 'dark', comfort: false, compact: false, accent: '#8b7cff',
  tasks: [
    { id: crypto.randomUUID(), title: 'Organizar meu espaço digital', done: false, priority: 'Alta', date: '' },
    { id: crypto.randomUUID(), title: 'Planejar as tarefas da semana', done: true, priority: 'Normal', date: '' },
    { id: crypto.randomUUID(), title: 'Separar arquivos importantes', done: false, priority: 'Normal', date: '' }
  ],
  files: [], notes: '', userName: 'Visitante'
};
let currentUser = null;
let state = loadState();
let activeView = 'overview';
let filter = 'Todas';
let searchTerm = '';
let authMode = 'login';
let cloudHydrated = false;
let syncTimer = null;
let syncInFlight = false;
let syncAgain = false;
let realtimeChannel = null;
let activationPromise = null;
let activatingUserId = null;
let lastCloudUpdate = null;
let syncStatus = 'Modo local · entre para sincronizar';
let syncListenersInstalled = false;

function accountStorageKey(userId) { return `my-espace-state:${userId}`; }
function loadState(key = 'my-espace-state') {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    return { ...structuredClone(defaults), ...(saved || {}) };
  } catch { return structuredClone(defaults); }
}
function saveState({ sync = true } = {}) {
  try {
    localStorage.setItem(currentUser ? accountStorageKey(currentUser.id) : 'my-espace-state', JSON.stringify(state));
  } catch (error) {
    console.warn('Não foi possível salvar o estado local:', error);
    toast('O navegador não conseguiu salvar todos os dados locais.', 'error');
  }
  applyPreferences();
  if (sync && currentUser && cloudHydrated) scheduleCloudSync();
}
function setSyncStatus(message) {
  syncStatus = message;
  const footer = $('#sync-status-label');
  if (footer) footer.textContent = message;
  const detail = $('#sync-status-detail');
  if (detail) detail.textContent = message;
}
function syncStatusForCurrentSession() {
  if (!supabaseReady) return 'Nuvem não configurada';
  if (!currentUser) return 'Modo local · entre para sincronizar';
  if (!cloudHydrated) return 'Preparando conexão com a nuvem…';
  return syncInFlight ? 'Sincronizando…' : 'Nuvem conectada';
}
function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function initials(name = 'ME') {
  return name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('') || 'ME';
}
function toast(message, kind = '') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.className = 'toast', 3200);
}
function applyPreferences() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.comfort = state.comfort ? 'on' : 'off';
  document.documentElement.dataset.compact = state.compact ? 'on' : 'off';
  document.documentElement.style.setProperty('--accent', state.accent);
}
function icon(name, size = 20) {
  const paths = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    check:'<path d="m5 12 4 4L19 6"/>', file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    note:'<path d="M8 6h13M8 12h13M8 18h8"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.5.9L16 20.7h-2.8l-.4-1.8a8 8 0 0 1-1.6-.9l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.6-.9l.4-1.8H16l.4 1.8a8 8 0 0 1 1.5.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1-.2 1.7Z" transform="translate(-2 -1)"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>', plus:'<path d="M12 5v14M5 12h14"/>',
    upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
    moon:'<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>', sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>', logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    trash:'<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/>', download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    cloud:'<path d="M20 16.2A4.5 4.5 0 0 0 18 7.5a6 6 0 0 0-11.6 1.8A4 4 0 0 0 7 17h12"/>',
    arrow:'<path d="M7 17 17 7M7 7h10v10"/>', close:'<path d="m18 6-12 12M6 6l12 12"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
}

function renderShell() {
  $('#app').innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <a class="brand" href="#" aria-label="My espace início"><span class="brand-mark">m<span>e</span></span><span class="brand-name">My espace<small>SEU ESPAÇO DIGITAL</small></span></a>
        <div class="workspace-label">ESPAÇO DE TRABALHO</div>
        <nav class="nav-list" aria-label="Navegação principal">
          ${navItem('overview','grid','Visão geral')}
          ${navItem('tasks','check','Minhas tarefas', taskCount())}
          ${navItem('files','file','Meus arquivos')}
          ${navItem('calendar','calendar','Planejamento')}
          ${navItem('notes','note','Bloco de notas')}
        </nav>
        <div class="sidebar-bottom">
          <button class="nav-item" data-view="settings">${icon('settings')}<span>Personalização</span></button>
          <div class="sidebar-tip"><div class="tip-icon">${icon('cloud',18)}</div><strong>Seu espaço, suas regras</strong><p>Organize sua rotina do seu jeito.</p><button class="text-button" data-view="settings">Personalizar ${icon('arrow',14)}</button></div>
          <div class="profile" id="profile">
            <div class="avatar">${initials(state.userName)}</div><div class="profile-copy"><strong>${escapeHTML(state.userName)}</strong><small>${currentUser ? escapeHTML(currentUser.email) : 'Modo local'}</small></div>
            <button class="icon-button small" id="auth-action" title="${currentUser ? 'Sair' : 'Entrar'}">${icon(currentUser ? 'logout' : 'arrow',17)}</button>
          </div>
        </div>
      </aside>
      <main class="main-panel">
        <header class="topbar">
          <button class="icon-button mobile-menu" id="mobile-menu" aria-label="Abrir menu">${icon('menu')}</button>
          <div class="breadcrumbs"><span>Meu espaço</span><span class="crumb-sep">/</span><strong id="crumb-title">Visão geral</strong></div>
          <div class="top-actions">
            <label class="search-box">${icon('search',18)}<input id="global-search" placeholder="Buscar tarefas e arquivos..." value="${escapeHTML(searchTerm)}" aria-label="Buscar tarefas e arquivos"/><kbd>⌘ K</kbd></label>
            <button class="icon-button theme-quick" id="quick-theme" aria-label="Alternar tema">${icon(state.theme === 'dark' ? 'sun' : 'moon')}</button>
            <button class="user-pill" id="open-auth"><span class="avatar mini">${initials(state.userName)}</span><span>${escapeHTML(state.userName)}</span><span class="chevron">⌄</span></button>
          </div>
        </header>
        <section class="content" id="view-content"></section>
        <footer class="footer"><span>My espace <span class="footer-dot">•</span> Um lugar para tudo.</span><span id="sync-status-label">${escapeHTML(syncStatusForCurrentSession())}</span></footer>
      </main>
    </div>
    <div id="modal-root"></div><div id="toast" class="toast" role="status" aria-live="polite"></div>
  `;
  applyPreferences();
  renderView();
  bindShell();
}
function navItem(view, ico, label, count = '') {
  return `<button class="nav-item ${activeView === view ? 'active' : ''}" data-view="${view}">${icon(ico)}<span>${label}</span>${count !== '' ? `<span class="nav-count">${count}</span>` : ''}</button>`;
}
function taskCount() { return state.tasks.filter(t => !t.done).length; }
function bindShell() {
  $$('[data-view]').forEach(btn => btn.addEventListener('click', () => {
    activeView = btn.dataset.view; $('#sidebar').classList.remove('open'); renderShell();
  }));
  $('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#quick-theme').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; saveState(); renderShell(); });
  $('#global-search').addEventListener('input', e => { searchTerm = e.target.value; renderView(); });
  $('#auth-action').addEventListener('click', () => currentUser ? signOut() : openAuth());
  $('#open-auth').addEventListener('click', () => currentUser ? toast('Você está conectado como ' + currentUser.email) : openAuth());
  document.addEventListener('keydown', hotkeys);
}
function hotkeys(e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#global-search')?.focus(); }
  if (e.key === 'Escape') { closeModal(); $('#sidebar')?.classList.remove('open'); }
}
function titleFor(view) {
  return ({overview:'Visão geral',tasks:'Minhas tarefas',files:'Meus arquivos',calendar:'Planejamento',notes:'Bloco de notas',settings:'Personalização'})[view] || 'Visão geral';
}
function renderView() {
  const el = $('#view-content'); if (!el) return;
  $('#crumb-title').textContent = titleFor(activeView);
  $$('.nav-item[data-view]').forEach(n => n.classList.toggle('active', n.dataset.view === activeView));
  if (activeView === 'overview') el.innerHTML = overviewView();
  if (activeView === 'tasks') el.innerHTML = tasksView();
  if (activeView === 'files') el.innerHTML = filesView();
  if (activeView === 'calendar') el.innerHTML = calendarView();
  if (activeView === 'notes') el.innerHTML = notesView();
  if (activeView === 'settings') el.innerHTML = settingsView();
  bindView();
}
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
function overviewView() {
  const done = state.tasks.filter(t => t.done).length, total = state.tasks.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const recent = state.tasks.filter(matchesSearch).slice(0, 4);
  const today = new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });
  return `
    <div class="welcome-row"><div><div class="eyebrow"><span class="live-dot"></span> SEU PAINEL PESSOAL</div><h1>${greeting()}, ${escapeHTML(state.userName.split(' ')[0])} <span class="wave">✦</span></h1><p class="subheading">Tudo no seu ritmo. Vamos organizar as ideias de hoje?</p></div><div class="date-chip">${icon('calendar',17)} <span>${today}</span></div></div>
    <div class="hero-card"><div class="hero-glow"></div><div class="hero-copy"><span class="hero-tag">SEU ESPAÇO, EM EQUILÍBRIO</span><h2>Um lugar para suas<br/><span>ideias ganharem forma.</span></h2><p>Pequenos passos também levam longe. Comece pelo que importa.</p><button class="primary-button" id="hero-add-task">${icon('plus',17)} Criar uma tarefa</button></div><div class="hero-orbit"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="orbit-core">${icon('grid',34)}</div><span class="orbit-star star-one">✦</span><span class="orbit-star star-two">✧</span><span class="orbit-star star-three">·</span></div></div>
    <div class="section-heading"><div><h2>Seu resumo</h2><p>Uma visão rápida do que está acontecendo.</p></div><button class="text-button" data-view="tasks">Ver tarefas ${icon('arrow',15)}</button></div>
    <div class="stats-grid">
      <article class="stat-card"><div class="stat-top"><span class="stat-icon purple">${icon('check')}</span><span class="stat-kicker">PROGRESSO</span></div><div class="stat-value">${done}<span>/${total}</span></div><div class="stat-label">Tarefas concluídas</div><div class="progress-track"><span style="width:${pct}%"></span></div><div class="stat-foot">${pct}% do seu planejamento concluído</div></article>
      <article class="stat-card"><div class="stat-top"><span class="stat-icon cyan">${icon('file')}</span><span class="stat-kicker">ORGANIZAÇÃO</span></div><div class="stat-value">${state.files.length}</div><div class="stat-label">Arquivos neste espaço</div><div class="stat-foot muted-foot">Guardados neste dispositivo</div><button class="card-link" data-view="files">Abrir arquivos ${icon('arrow',14)}</button></article>
      <article class="stat-card"><div class="stat-top"><span class="stat-icon amber">${icon('note')}</span><span class="stat-kicker">CRIATIVIDADE</span></div><div class="stat-value">${state.notes.trim() ? state.notes.trim().split(/\s+/).length : 0}</div><div class="stat-label">Palavras nas suas notas</div><div class="stat-foot muted-foot">Suas ideias, sempre por perto</div><button class="card-link" data-view="notes">Abrir bloco de notas ${icon('arrow',14)}</button></article>
    </div>
    <div class="bottom-grid"><section class="panel tasks-panel"><div class="panel-heading"><div><h3>Próximas tarefas</h3><p>Um passo de cada vez.</p></div><button class="icon-button" id="add-task-short" aria-label="Adicionar tarefa">${icon('plus')}</button></div><div class="task-list">${recent.length ? recent.map(taskRow).join('') : emptyState('check','Tudo em dia!','Adicione uma tarefa para começar.')}</div><button class="panel-footer-link" data-view="tasks">Ver todas as tarefas ${icon('arrow',14)}</button></section>
    <section class="panel focus-panel"><div class="panel-heading"><div><h3>Seu cantinho</h3><p>Um espaço que combina com você.</p></div><span class="tiny-spark">✦</span></div><div class="focus-art"><div class="focus-circle"></div><div class="focus-window"><div class="window-dots"><i></i><i></i><i></i></div><div class="window-lines"><span></span><span></span><span></span></div><div class="window-orb"></div></div><span class="focus-star fs1">✦</span><span class="focus-star fs2">✧</span></div><h4>Personalize seu espaço</h4><p>Escolha cores, tema e conforto visual para deixar tudo com a sua cara.</p><button class="secondary-button" data-view="settings">Explorar ajustes ${icon('arrow',15)}</button></section></div>`;
}
function matchesSearch(t) { return !searchTerm || t.title.toLowerCase().includes(searchTerm.toLowerCase()); }
function taskRow(t) {
  return `<div class="task-row ${t.done ? 'is-done' : ''}"><button class="task-check ${t.done ? 'checked' : ''}" data-toggle-task="${t.id}" aria-label="${t.done ? 'Marcar como pendente' : 'Concluir tarefa'}">${t.done ? icon('check',14) : ''}</button><div class="task-row-copy"><strong>${escapeHTML(t.title)}</strong><small>${t.date ? new Date(t.date+'T12:00:00').toLocaleDateString('pt-BR') : 'Sem prazo definido'}</small></div><span class="priority ${t.priority.toLowerCase()}">${t.priority}</span><button class="icon-button task-delete" data-delete-task="${t.id}" aria-label="Excluir tarefa">${icon('trash',16)}</button></div>`;
}
function emptyState(ico, title, text) { return `<div class="empty-state">${icon(ico,28)}<strong>${title}</strong><p>${text}</p></div>`; }
function tasksView() {
  const list = state.tasks.filter(matchesSearch).filter(t => filter === 'Todas' || (filter === 'Pendentes' ? !t.done : t.done));
  return `<div class="page-heading"><div><div class="eyebrow">ORGANIZE SEU DIA</div><h1>Minhas tarefas<span class="heading-period">.</span></h1><p class="subheading">Transforme planos em pequenas conquistas.</p></div><button class="primary-button" id="add-task">${icon('plus',17)} Nova tarefa</button></div>
  <div class="task-summary-strip"><div><span class="summary-num">${state.tasks.filter(t=>!t.done).length}</span><span>Pendentes</span></div><div><span class="summary-num">${state.tasks.filter(t=>t.done).length}</span><span>Concluídas</span></div><div class="summary-progress"><div class="progress-track"><span style="width:${state.tasks.length ? state.tasks.filter(t=>t.done).length/state.tasks.length*100 : 0}%"></span></div><small>Progresso geral</small></div></div>
  <div class="filter-row">${['Todas','Pendentes','Concluídas'].map(f=>`<button class="filter-chip ${filter===f?'selected':''}" data-filter="${f}">${f}</button>`).join('')}<span class="filter-count">${list.length} ${list.length===1?'tarefa':'tarefas'}</span></div>
  <section class="panel full-panel"><div class="task-list large-list">${list.length ? list.map(taskRow).join('') : emptyState('check','Nenhuma tarefa por aqui','Experimente mudar o filtro ou criar uma tarefa.')}</div></section>`;
}
function filesView() {
  const list = state.files.filter(f => !searchTerm || f.name.toLowerCase().includes(searchTerm.toLowerCase()));
  return `<div class="page-heading"><div><div class="eyebrow">TUDO NO SEU LUGAR</div><h1>Meus arquivos<span class="heading-period">.</span></h1><p class="subheading">Um cantinho para os arquivos que acompanham você.</p></div><button class="primary-button" id="upload-files">${icon('upload',17)} Adicionar arquivos</button></div>
  <div class="notice-banner">${icon('cloud',20)}<div><strong>${currentUser && cloudHydrated ? 'Arquivos sincronizados com a nuvem' : 'Armazenamento neste dispositivo'}</strong><p>${currentUser && cloudHydrated ? 'Arquivos são enviados para o armazenamento privado da sua conta. Aguarde a sincronização terminar antes de fechar a página após um envio.' : 'Entre na sua conta e configure o Supabase para acessar estes arquivos em outros dispositivos. Os arquivos já guardados neste aparelho serão enviados quando a sincronização estiver configurada.'}</p></div></div>
  <div class="file-toolbar"><div><h3>Seus arquivos</h3><p>${list.length} ${list.length===1?'item':'itens'} guardados</p></div><label class="secondary-button upload-label">${icon('plus',16)} Adicionar<input type="file" id="file-input" multiple hidden /></label></div>
  <div class="file-grid">${list.length ? list.map(fileCard).join('') : emptyState('file','Seu espaço está vazio','Adicione arquivos para começar a organizar.')}</div>
  <input type="file" id="file-input-hidden" multiple hidden />`;
}
function fileCard(f) {
  const ext = f.name.split('.').pop().slice(0,5).toUpperCase();
  const size = f.size < 1024*1024 ? `${Math.max(1,Math.round(f.size/1024))} KB` : `${(f.size/1024/1024).toFixed(1)} MB`;
  return `<article class="file-card"><div class="file-visual ${fileType(f.name)}">${icon(fileType(f.name)==='image'?'file':'file',25)}<span>${escapeHTML(ext)}</span></div><div class="file-card-copy"><strong title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</strong><small>${size} · ${new Date(f.added).toLocaleDateString('pt-BR')}${f.localOnly ? ' · Só neste dispositivo' : f.storagePath ? ' · Na nuvem' : ''}</small></div><div class="file-card-actions"><button class="icon-button" data-download-file="${f.id}" title="Baixar arquivo">${icon('download',16)}</button><button class="icon-button" data-delete-file="${f.id}" title="Remover">${icon('trash',16)}</button></div></article>`;
}
function fileType(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return 'image';
  if (['pdf','doc','docx','txt','md'].includes(ext)) return 'document';
  if (['mp3','wav','mp4','mov'].includes(ext)) return 'media';
  if (['zip','rar','7z'].includes(ext)) return 'archive';
  return 'other';
}
function calendarView() {
  const dated = state.tasks.filter(t=>t.date && !t.done).sort((a,b)=>a.date.localeCompare(b.date));
  const undated = state.tasks.filter(t=>!t.date && !t.done);
  return `<div class="page-heading"><div><div class="eyebrow">NO SEU RITMO</div><h1>Planejamento<span class="heading-period">.</span></h1><p class="subheading">Veja o que vem pela frente e organize suas prioridades.</p></div><button class="primary-button" id="add-task">${icon('plus',17)} Planejar tarefa</button></div>
  <div class="planner-date-card"><div class="planner-date-icon">${icon('calendar',25)}</div><div><span class="eyebrow">HOJE É</span><h2>${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</h2><p>Planeje com calma. Não precisa fazer tudo de uma vez.</p></div></div>
  <section class="panel full-panel"><div class="panel-heading"><div><h3>Próximos compromissos</h3><p>Tarefas com data definida.</p></div></div><div class="task-list">${dated.length ? dated.map(taskRow).join('') : emptyState('calendar','Sem prazos próximos','Ao criar uma tarefa, escolha uma data para vê-la aqui.')}</div></section>
  <section class="panel full-panel later-panel"><div class="panel-heading"><div><h3>Sem data definida</h3><p>Quando estiver pronto, escolha um prazo.</p></div></div><div class="task-list">${undated.length ? undated.map(taskRow).join('') : '<p class="quiet-copy">Tudo organizado por aqui.</p>'}</div></section>`;
}
function notesView() {
  return `<div class="page-heading"><div><div class="eyebrow">CAPTURE SUAS IDEIAS</div><h1>Bloco de notas<span class="heading-period">.</span></h1><p class="subheading">Rascunhos, ideias soltas e pensamentos importantes.</p></div><span class="autosave-label"><span class="live-dot"></span> Salvamento automático</span></div>
  <section class="note-paper"><div class="note-paper-top"><span class="note-paper-icon">${icon('note',18)}</span><span>MEU CADERNO DIGITAL</span><span class="note-paper-date">${new Date().toLocaleDateString('pt-BR')}</span></div><input id="note-title" class="note-title" value="${escapeHTML(state.noteTitle || 'Minhas ideias')}" aria-label="Título das notas" placeholder="Dê um título às suas ideias"/><textarea id="notes-area" placeholder="Comece a escrever aqui...&#10;&#10;• O que você quer lembrar?&#10;• Qual é sua próxima ideia?&#10;• O que precisa resolver?">${escapeHTML(state.notes)}</textarea><div class="note-paper-bottom"><span id="word-count">${state.notes.trim()?state.notes.trim().split(/\s+/).length:0} palavras</span><button class="secondary-button" id="download-notes">${icon('download',15)} Exportar .txt</button></div></section>`;
}
function settingsView() {
  return `<div class="page-heading"><div><div class="eyebrow">DO SEU JEITO</div><h1>Personalização<span class="heading-period">.</span></h1><p class="subheading">Ajuste seu espaço para ficar confortável e prático.</p></div></div>
  <section class="settings-section"><div class="settings-intro"><span class="settings-symbol">${icon('sun',22)}</span><div><h3>Aparência</h3><p>Escolha o visual que combina com você.</p></div></div><div class="settings-card"><div class="setting-row"><div><strong>Tema da interface</strong><p>Alterne entre os modos claro e escuro.</p></div><div class="theme-options"><button data-theme-choice="light" class="theme-option ${state.theme==='light'?'chosen':''}"><span class="theme-preview light-preview"></span>Claro</button><button data-theme-choice="dark" class="theme-option ${state.theme==='dark'?'chosen':''}"><span class="theme-preview dark-preview"></span>Escuro</button></div></div>
  <div class="setting-row"><div><strong>Conforto visual</strong><p>Reduz contraste intenso e transparências.</p></div><button class="toggle ${state.comfort?'on':''}" id="comfort-toggle" role="switch" aria-checked="${state.comfort}" aria-label="Conforto visual"><span></span></button></div>
  <div class="setting-row"><div><strong>Interface compacta</strong><p>Mais conteúdo na tela, com espaços menores.</p></div><button class="toggle ${state.compact?'on':''}" id="compact-toggle" role="switch" aria-checked="${state.compact}" aria-label="Interface compacta"><span></span></button></div>
  <div class="setting-row accent-setting"><div><strong>Cor de destaque</strong><p>Personalize botões e detalhes da interface.</p></div><div class="accent-options">${['#8b7cff','#31c9c1','#f59e0b','#f472b6','#60a5fa','#a3e635'].map(c=>`<button class="accent-dot ${state.accent===c?'selected':''}" data-accent="${c}" style="--swatch:${c}" aria-label="Selecionar cor ${c}"></button>`).join('')}</div></div></div></section>
  <section class="settings-section"><div class="settings-intro"><span class="settings-symbol">${icon('grid',22)}</span><div><h3>Seu perfil</h3><p>Como você aparece dentro do My espace.</p></div></div><div class="settings-card"><form id="profile-form" class="profile-form"><label>Nome de exibição<input name="displayName" maxlength="48" value="${escapeHTML(state.userName)}" required /></label><button class="secondary-button" type="submit">Salvar nome</button></form><div class="setting-row"><div><strong>Conta e segurança</strong><p>${currentUser ? `Conectado como ${escapeHTML(currentUser.email)}` : 'Entre ou crie uma conta para sincronizar a autenticação.'}</p></div><button class="secondary-button" id="settings-auth">${currentUser?'Sair da conta':'Entrar / cadastrar'}</button></div></div></section>
  <section class="settings-section"><div class="settings-intro"><span class="settings-symbol">${icon('cloud',22)}</span><div><h3>Sincronização entre dispositivos</h3><p>Leve suas tarefas, notas, preferências e arquivos com você.</p></div></div><div class="settings-card"><div class="setting-row"><div><strong>Estado da sincronização</strong><p id="sync-status-detail">${escapeHTML(syncStatusForCurrentSession())}</p></div><button class="secondary-button" id="sync-now" ${(!currentUser || !supabaseReady) ? 'disabled' : ''}>${icon('cloud',15)} Sincronizar agora</button></div><p class="sync-explanation">${currentUser && cloudHydrated ? 'Sua conta está conectada. As alterações são enviadas automaticamente; mantenha a internet ativa para receber mudanças dos outros aparelhos.' : 'Para sincronizar, configure as variáveis do Supabase, execute supabase/schema.sql no projeto e entre na mesma conta em todos os aparelhos.'}</p></div></section>
  <section class="settings-section"><div class="settings-intro"><span class="settings-symbol">${icon('download',22)}</span><div><h3>Seus dados</h3><p>Faça uma cópia ou limpe os dados locais.</p></div></div><div class="settings-card"><div class="setting-row"><div><strong>Exportar dados</strong><p>Baixe uma cópia das suas tarefas, notas e preferências em JSON.</p></div><button class="secondary-button" id="export-data">${icon('download',15)} Exportar</button></div><div class="setting-row"><div><strong>Restaurar preferências</strong><p>Volte à aparência inicial. Suas tarefas e arquivos ficam preservados.</p></div><button class="secondary-button" id="reset-preferences">Restaurar</button></div></div></section>
  <div class="security-note">${icon('cloud',19)}<p><strong>Privacidade dos seus dados</strong><br/>Os dados sincronizados ficam vinculados ao identificador da sua conta, protegidos por políticas de acesso no Supabase. Arquivos são armazenados em um bucket privado. Sem configuração da nuvem ou sem conexão, o app continua usando o armazenamento local.</p></div>`;
}
function bindView() {
  $$('[data-view]', $('#view-content')).forEach(btn=>btn.addEventListener('click',()=>{activeView=btn.dataset.view;renderShell();}));
  $$('[data-toggle-task]').forEach(btn=>btn.addEventListener('click',()=>toggleTask(btn.dataset.toggleTask)));
  $$('[data-delete-task]').forEach(btn=>btn.addEventListener('click',()=>deleteTask(btn.dataset.deleteTask)));
  $('#hero-add-task')?.addEventListener('click',()=>openTaskModal());
  $('#add-task')?.addEventListener('click',()=>openTaskModal());
  $('#add-task-short')?.addEventListener('click',()=>openTaskModal());
  $$('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{filter=btn.dataset.filter;renderView();}));
  $('#upload-files')?.addEventListener('click',()=>$('#file-input-hidden').click());
  $('.upload-label input')?.addEventListener('change', e=>addFiles(e.target.files));
  $('#file-input-hidden')?.addEventListener('change', e=>addFiles(e.target.files));
  $$('[data-download-file]').forEach(btn=>btn.addEventListener('click',()=>downloadFile(btn.dataset.downloadFile)));
  $$('[data-delete-file]').forEach(btn=>btn.addEventListener('click',()=>deleteFile(btn.dataset.deleteFile)));
  $('#notes-area')?.addEventListener('input',e=>{state.notes=e.target.value;saveState();$('#word-count').textContent=`${state.notes.trim()?state.notes.trim().split(/\s+/).length:0} palavras`;});
  $('#note-title')?.addEventListener('input',e=>{state.noteTitle=e.target.value;saveState();});
  $('#download-notes')?.addEventListener('click',()=>downloadText(`${state.noteTitle||'Minhas ideias'}.txt`,state.notes));
  $$('[data-theme-choice]').forEach(btn=>btn.addEventListener('click',()=>{state.theme=btn.dataset.themeChoice;saveState();renderView();}));
  $('#comfort-toggle')?.addEventListener('click',()=>{state.comfort=!state.comfort;saveState();renderView();});
  $('#compact-toggle')?.addEventListener('click',()=>{state.compact=!state.compact;saveState();renderView();});
  $$('[data-accent]').forEach(btn=>btn.addEventListener('click',()=>{state.accent=btn.dataset.accent;saveState();renderView();}));
  $('#profile-form')?.addEventListener('submit',e=>{e.preventDefault();state.userName=new FormData(e.target).get('displayName').trim()||'Visitante';saveState();toast('Nome atualizado!');renderShell();});
  $('#settings-auth')?.addEventListener('click',()=>currentUser?signOut():openAuth());
  $('#export-data')?.addEventListener('click',exportData);
  $('#sync-now')?.addEventListener('click',forceSyncNow);
  $('#reset-preferences')?.addEventListener('click',()=>{state.theme=defaults.theme;state.comfort=false;state.compact=false;state.accent=defaults.accent;saveState();toast('Preferências restauradas.');renderView();});
}
function toggleTask(id) { const t=state.tasks.find(t=>t.id===id); if(t){t.done=!t.done;saveState();renderShell();} }
function deleteTask(id) { state.tasks=state.tasks.filter(t=>t.id!==id);saveState();renderShell();toast('Tarefa removida.'); }
function openTaskModal(task = null) {
  $('#modal-root').innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="task-modal-title"><div class="modal-head"><div><div class="eyebrow">${task?'EDITE SEU PLANO':'UM PASSO DE CADA VEZ'}</div><h2 id="task-modal-title">${task?'Editar tarefa':'Nova tarefa'}</h2></div><button class="icon-button" data-close-modal aria-label="Fechar">${icon('close')}</button></div><form id="task-form"><label>O que você precisa fazer?<input name="title" maxlength="140" required autofocus placeholder="Ex.: Estudar por 30 minutos" value="${escapeHTML(task?.title||'')}"/></label><div class="form-two"><label>Prioridade<select name="priority"><option ${task?.priority==='Baixa'?'selected':''}>Baixa</option><option ${!task||task.priority==='Normal'?'selected':''}>Normal</option><option ${task?.priority==='Alta'?'selected':''}>Alta</option></select></label><label>Prazo (opcional)<input name="date" type="date" value="${escapeHTML(task?.date||'')}"/></label></div><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Cancelar</button><button class="primary-button" type="submit">${task?'Salvar alterações':'Criar tarefa'}</button></div></form></section></div>`;
  bindCloseModal();
  $('#task-form').addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.target);const item={id:task?.id||crypto.randomUUID(),title:d.get('title').trim(),priority:d.get('priority'),date:d.get('date'),done:task?.done||false};if(task)state.tasks=state.tasks.map(t=>t.id===task.id?item:t);else state.tasks.unshift(item);saveState();closeModal();renderShell();toast(task?'Tarefa atualizada.':'Tarefa criada!');});
}
function bindCloseModal() { $$('[data-close-modal]').forEach(el=>el.addEventListener('click',e=>{if(e.target===el||el.tagName==='BUTTON')closeModal();})); }
function closeModal(){ $('#modal-root').innerHTML=''; }
async function addFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  let added = 0;
  for (const file of files) {
    const id = crypto.randomUUID();
    const addedAt = new Date().toISOString();
    try {
      await idbPut({ id, name: file.name, size: file.size, type: file.type, added: addedAt, blob: file });
      state.files.unshift({ id, name: file.name, size: file.size, type: file.type, added: addedAt, localOnly: !(currentUser && cloudHydrated) });
      added++;
      saveState();
    } catch {
      toast(`Não foi possível guardar ${file.name}. O navegador pode estar sem espaço.`, 'error');
    }
  }
  if (added) {
    renderView();
    toast(currentUser && cloudHydrated
      ? `${added} arquivo(s) adicionado(s). Enviando para a nuvem…`
      : `${added} arquivo(s) adicionado(s) neste dispositivo.`);
  }
}
let dbPromise;
function openDB() {
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open('my-espace-files',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('files',{keyPath:'id'});
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}
async function idbPut(file){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(file);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
async function idbGet(id){const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction('files').objectStore('files').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function idbDelete(id){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
async function downloadFile(id) {
  const meta = state.files.find(item => item.id === id);
  try {
    const local = await idbGet(id);
    if (local?.blob) { downloadBlob(local.blob, local.name || meta?.name || 'arquivo'); return; }
    if (supabase && currentUser && meta?.storagePath) {
      const { data, error } = await supabase.storage.from('user-files').download(meta.storagePath);
      if (error) throw error;
      if (data) { await idbPut({ id, name: meta.name, size: meta.size, type: meta.type, added: meta.added, blob: data }); downloadBlob(data, meta.name); return; }
    }
    toast('Este arquivo não está disponível neste aparelho nem na nuvem.','error');
  } catch (error) {
    console.error('Download do arquivo:', error);
    toast(`Não foi possível baixar o arquivo: ${error.message || 'erro de armazenamento'}`, 'error');
  }
}
async function deleteFile(id) {
  const meta = state.files.find(item => item.id === id);
  if (supabase && currentUser && cloudHydrated && meta?.storagePath) {
    const { error } = await supabase.storage.from('user-files').remove([meta.storagePath]);
    if (error) { toast(`Não foi possível remover o arquivo da nuvem: ${error.message}`, 'error'); return; }
  }
  try { await idbDelete(id); } catch (error) { console.warn('Remoção local do arquivo:', error); }
  state.files = state.files.filter(f => f.id !== id);
  saveState(); renderView(); toast('Arquivo removido.');
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function downloadText(name,text){downloadBlob(new Blob([text],{type:'text/plain;charset=utf-8'}),name);}
function exportData(){const data={exportedAt:new Date().toISOString(),tasks:state.tasks,notes:state.notes,noteTitle:state.noteTitle,preferences:{theme:state.theme,comfort:state.comfort,compact:state.compact,accent:state.accent},files:state.files.map(({id,name,size,type,added})=>({id,name,size,type,added,contentNotIncluded:true}))};downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'my-espace-backup.json');toast('Cópia dos dados exportada. Os arquivos binários não são incluídos.');}

function openAuth(mode='login') {
  authMode=mode;
  renderAuthModal();
}
function renderAuthModal() {
  const isReset=authMode==='reset';
  const isSignup=authMode==='signup';
  const title=isReset?'Recuperar acesso':isSignup?'Criar sua conta':'Bem-vindo de volta';
  $('#modal-root').innerHTML=`<div class="modal-backdrop" data-close-modal><section class="modal-card auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><div class="auth-brand"><span class="brand-mark">m<span>e</span></span><span>MY ESPACE</span></div><button class="icon-button auth-close" data-close-modal aria-label="Fechar">${icon('close')}</button><div class="auth-heading"><div class="eyebrow">${isReset?'RECUPERAÇÃO SEGURA':'SEU ESPAÇO PESSOAL'}</div><h2 id="auth-title">${title}</h2><p>${isReset?'Enviaremos um link para redefinir sua senha.':isSignup?'Crie sua conta para autenticar seu acesso.':'Entre para autenticar sua conta.'}</p></div>
  ${!supabaseReady?`<div class="auth-warning">${icon('cloud',18)}<div><strong>Autenticação ainda não configurada</strong><p>Conecte seu projeto Supabase para ativar cadastro, login e recuperação reais. A interface não simulará uma autenticação segura.</p></div></div>`:''}
  <form id="auth-form"><label>E-mail<input type="email" name="email" autocomplete="email" placeholder="voce@exemplo.com" required/></label>${!isReset?`<label>Senha<div class="password-wrap"><input type="password" name="password" autocomplete="${isSignup?'new-password':'current-password'}" minlength="8" placeholder="Mínimo de 8 caracteres" required/><button type="button" class="show-password" id="show-password">Mostrar</button></div></label>`:''}${isSignup?`<label>Nome de exibição<input name="displayName" maxlength="48" autocomplete="nickname" placeholder="Como devemos chamar você?"/></label>`:''}<button class="primary-button auth-submit" type="submit">${isReset?'Enviar link de recuperação':isSignup?'Criar conta':'Entrar'} ${icon('arrow',16)}</button><p class="auth-error" id="auth-error" role="alert"></p></form>
  <div class="auth-links">${!isReset?`<button data-auth-mode="${isSignup?'login':'signup'}">${isSignup?'Já tenho uma conta':'Criar uma conta'}</button>`:''}<button data-auth-mode="${isReset?'login':'reset'}">${isReset?'Voltar ao login':'Esqueci minha senha'}</button></div><p class="auth-legal">A senha é gerenciada pelo provedor de autenticação configurado. Nunca compartilhe sua senha.</p></section></div>`;
  bindCloseModal();
  $$('[data-auth-mode]').forEach(b=>b.addEventListener('click',()=>openAuth(b.dataset.authMode)));
  $('#show-password')?.addEventListener('click',()=>{const input=$('[name=password]');input.type=input.type==='password'?'text':'password';$('#show-password').textContent=input.type==='password'?'Mostrar':'Ocultar';});
  $('#auth-form').addEventListener('submit',handleAuth);
}
async function handleAuth(e) {
  e.preventDefault();
  const form = new FormData(e.target), email = String(form.get('email')).trim(), password = String(form.get('password') || '');
  const error = $('#auth-error'); error.textContent = '';
  if (!supabase) { error.textContent = 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY e execute supabase/schema.sql conforme o README antes de usar autenticação e sincronização.'; return; }
  const submit = $('.auth-submit'); submit.disabled = true; submit.textContent = 'Aguarde…';
  try {
    if (authMode === 'signup') {
      const name = String(form.get('displayName') || '').trim();
      const { data, error: err } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: window.location.origin + window.location.pathname } });
      if (err) throw err;
      if (data.session && data.user) {
        await activateSession(data.user); closeModal(); toast('Conta criada. Preparando a sincronização…');
      } else {
        error.textContent = 'Cadastro enviado. Confirme seu e-mail e depois entre para ativar a sincronização.';
        submit.disabled = false; submit.textContent = 'Criar conta';
      }
    } else if (authMode === 'reset') {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
      if (err) throw err;
      error.className = 'auth-success'; error.textContent = 'Se o endereço estiver cadastrado, você receberá um link de recuperação.';
      submit.disabled = false; submit.textContent = 'Enviar link de recuperação';
    } else {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      if (data.user) await activateSession(data.user);
      closeModal(); toast('Login realizado. Seus dados estão sendo sincronizados.');
    }
  } catch (err) {
    error.className = 'auth-error';
    error.textContent = err.message || 'Não foi possível concluir a autenticação.';
    submit.disabled = false;
    submit.textContent = authMode === 'reset' ? 'Enviar link de recuperação' : authMode === 'signup' ? 'Criar conta' : 'Entrar';
  }
}
async function signOut() {
  if (!supabase) { toast('A autenticação não está configurada.', 'error'); return; }
  const { error } = await supabase.auth.signOut();
  if (error) { toast('Não foi possível sair: ' + error.message, 'error'); return; }
  await deactivateSession();
  toast('Você saiu da conta. Seus dados da nuvem permanecem na sua conta.');
}
function normalizeWorkspaceData(data, user) {
  const remote = data && typeof data === 'object' ? data : {};
  const normalized = { ...structuredClone(defaults), ...remote };
  normalized.tasks = Array.isArray(remote.tasks) ? remote.tasks : [];
  normalized.files = Array.isArray(remote.files) ? remote.files : [];
  normalized.notes = typeof remote.notes === 'string' ? remote.notes : '';
  normalized.noteTitle = typeof remote.noteTitle === 'string' ? remote.noteTitle : 'Minhas ideias';
  normalized.theme = ['dark', 'light'].includes(remote.theme) ? remote.theme : defaults.theme;
  normalized.comfort = Boolean(remote.comfort);
  normalized.compact = Boolean(remote.compact);
  normalized.accent = typeof remote.accent === 'string' ? remote.accent : defaults.accent;
  normalized.userName = String(remote.userName || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Visitante');
  return normalized;
}
function mergeLocalWorkspaceIntoCloud(remoteData, localData, user) {
  const remote = normalizeWorkspaceData(remoteData, user);
  const local = localData && typeof localData === 'object' ? localData : {};
  // Merge tasks by ID, then by their meaningful content to avoid duplicate tasks
  // when a guest session is imported from another browser/device.
  const sampleTitles = new Set(defaults.tasks.map(task => task.title));
  const tasks = [...remote.tasks];
  const knownIds = new Set(tasks.map(task => task.id));
  const knownSignatures = new Set(tasks.map(task => `${task.title}|${task.date || ''}`));
  for (const task of (Array.isArray(local.tasks) ? local.tasks : [])) {
    const signature = `${task.title}|${task.date || ''}`;
    if (knownIds.has(task.id) || knownSignatures.has(signature)) continue;
    if (sampleTitles.has(task.title) && !(task.done || task.date || task.priority !== 'Normal')) continue;
    tasks.push(task);
    knownIds.add(task.id);
    knownSignatures.add(signature);
  }
  const files = [...remote.files];
  const fileIds = new Set(files.map(file => file.id));
  for (const file of (Array.isArray(local.files) ? local.files : [])) {
    if (fileIds.has(file.id)) continue;
    // Local binaries remain in IndexedDB and are uploaded by uploadPendingFiles().
    files.push({ ...file, localOnly: true });
    fileIds.add(file.id);
  }
  let notes = remote.notes;
  const localNotes = typeof local.notes === 'string' ? local.notes.trim() : '';
  if (!notes.trim() && localNotes) notes = local.notes;
  else if (localNotes && localNotes !== notes.trim() && localNotes !== notes) {
    notes = `${notes.trim()}\n\n—— Importado deste dispositivo ———\n${localNotes}`;
  }
  const localTitle = typeof local.noteTitle === 'string' ? local.noteTitle.trim() : '';
  return {
    ...remote,
    tasks,
    files,
    notes,
    noteTitle: remote.noteTitle || localTitle || 'Minhas ideias'
  };
}

function cloudWorkspacePayload() {
  return {
    version: 1,
    tasks: state.tasks,
    notes: state.notes,
    noteTitle: state.noteTitle || 'Minhas ideias',
    theme: state.theme,
    comfort: Boolean(state.comfort),
    compact: Boolean(state.compact),
    accent: state.accent,
    userName: state.userName,
    files: state.files.filter(file => file.storagePath && !file.localOnly).map(({ id, name, size, type, added, storagePath }) => ({ id, name, size, type, added, storagePath }))
  };
}
function scheduleCloudSync() {
  if (!supabase || !currentUser || !cloudHydrated) return;
  clearTimeout(syncTimer);
  setSyncStatus('Alterações salvas localmente · aguardando nuvem…');
  syncTimer = setTimeout(() => { syncTimer = null; syncWorkspace(); }, 850);
}
async function uploadPendingFiles() {
  if (!supabase || !currentUser) return;
  for (const meta of state.files) {
    if (meta.storagePath && !meta.localOnly) continue;
    try {
      const local = await idbGet(meta.id);
      if (!local?.blob) { meta.localOnly = true; continue; }
      const path = `${currentUser.id}/${meta.id}`;
      const { error } = await supabase.storage.from('user-files').upload(path, local.blob, {
        contentType: meta.type || 'application/octet-stream', upsert: true
      });
      if (error) {
        meta.localOnly = true;
        console.warn(`Não foi possível enviar ${meta.name}:`, error.message);
        continue;
      }
      meta.storagePath = path;
      delete meta.localOnly;
    } catch (error) {
      meta.localOnly = true;
      console.warn(`Não foi possível preparar ${meta.name} para a nuvem:`, error);
    }
  }
  // Keep metadata local even when a file could not be uploaded; cloud payload excludes it.
  localStorage.setItem(accountStorageKey(currentUser.id), JSON.stringify(state));
}
async function syncWorkspace() {
  if (!supabase || !currentUser || !cloudHydrated) return;
  if (syncInFlight) { syncAgain = true; return; }
  syncInFlight = true;
  setSyncStatus('Sincronizando…');
  try {
    const syncingUserId = currentUser.id;
    await uploadPendingFiles();
    if (!currentUser || currentUser.id !== syncingUserId) return;
    const updatedAt = new Date().toISOString();
    const { data, error } = await supabase.from('user_workspace').upsert({
      user_id: syncingUserId,
      data: cloudWorkspacePayload(),
      updated_at: updatedAt
    }, { onConflict: 'user_id' }).select('updated_at').single();
    if (error) throw error;
    lastCloudUpdate = data?.updated_at || updatedAt;
    const localOnlyCount = state.files.filter(file => file.localOnly || !file.storagePath).length;
    setSyncStatus(localOnlyCount ? `Dados sincronizados · ${localOnlyCount} arquivo(s) ainda só neste dispositivo` : 'Sincronizado com a nuvem');
  } catch (error) {
    console.error('Sincronização My espace:', error);
    setSyncStatus('Falha na sincronização · dados locais preservados');
  } finally {
    syncInFlight = false;
    if (syncAgain) {
      syncAgain = false;
      scheduleCloudSync();
    }
  }
}
async function forceSyncNow() {
  if (!currentUser || !supabaseReady) { openAuth(); return; }
  if (!cloudHydrated) { await activateSession(currentUser); return; }
  clearTimeout(syncTimer); syncTimer = null;
  await syncWorkspace();
  renderView();
}
function applyRemoteWorkspace(row, showToast = true) {
  if (!row?.data || !currentUser) return;
  const remoteMillis = row.updated_at ? Date.parse(row.updated_at) : 0;
  const localMillis = lastCloudUpdate ? Date.parse(lastCloudUpdate) : 0;
  if (remoteMillis && localMillis && remoteMillis <= localMillis) return;
  clearTimeout(syncTimer); syncTimer = null;
  const localOnlyFiles = state.files.filter(file => file.localOnly);
  state = normalizeWorkspaceData(row.data, currentUser);
  const seen = new Set(state.files.map(file => file.id));
  state.files.push(...localOnlyFiles.filter(file => !seen.has(file.id)));
  lastCloudUpdate = row.updated_at || new Date().toISOString();
  saveState({ sync: false });
  setSyncStatus('Dados atualizados pela nuvem');
  renderShell();
  if (showToast) toast('Dados atualizados de outro dispositivo.');
}
function subscribeToWorkspace(userId) {
  if (!supabase) return;
  if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
  realtimeChannel = supabase.channel(`my-espace-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_workspace', filter: `user_id=eq.${userId}` }, payload => {
      if (syncInFlight || !cloudHydrated || currentUser?.id !== userId) return;
      if (payload.new?.data) applyRemoteWorkspace(payload.new);
    })
    .subscribe(status => {
      if (currentUser?.id !== userId) return;
      if (status === 'SUBSCRIBED' && cloudHydrated && !syncInFlight) setSyncStatus('Nuvem conectada · sincronização ativa');
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSyncStatus('Nuvem conectada · atualização ao reabrir o app');
    });
}
async function refreshFromCloud() {
  if (!supabase || !currentUser || !cloudHydrated || !navigator.onLine || syncInFlight) return;
  const userId = currentUser.id;
  try {
    const { data, error } = await supabase.from('user_workspace').select('data, updated_at').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (currentUser?.id === userId && data?.data) applyRemoteWorkspace(data, false);
  } catch (error) { console.warn('Atualização da nuvem indisponível:', error.message); }
}
async function activateSession(user) {
  if (!user || !supabase) return;
  if (currentUser?.id === user.id && cloudHydrated) return;
  if (activatingUserId === user.id && activationPromise) return activationPromise;
  const previousState = structuredClone(state);
  activatingUserId = user.id;
  activationPromise = (async () => {
    currentUser = user;
    cloudHydrated = false;
    setSyncStatus('Conectando à sua área privada…');
    if (realtimeChannel) { await supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
    try {
      const accountKey = accountStorageKey(user.id);
      const hasAccountCache = Boolean(localStorage.getItem(accountKey));
      const cachedState = hasAccountCache ? loadState(accountKey) : null;
      const { data: row, error } = await supabase.from('user_workspace').select('data, updated_at').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (row?.data) {
        const guestState = previousState;
        const guestHasUsefulData = (guestState.tasks || []).some(task =>
          !defaults.tasks.some(sample => sample.title === task.title && sample.done === task.done && sample.date === task.date && sample.priority === task.priority)
        ) || Boolean(guestState.notes?.trim()) || Boolean((guestState.files || []).length);
        state = mergeLocalWorkspaceIntoCloud(row.data, guestState, user);
        lastCloudUpdate = row.updated_at || null;
        cloudHydrated = true;
        saveState({ sync: false });
        subscribeToWorkspace(user.id);
        // Import local-only files and any guest changes instead of silently leaving
        // them stranded on this browser when the account already has cloud data.
        if (guestHasUsefulData) await syncWorkspace();
        else setSyncStatus('Sincronizado com a nuvem');
        renderShell();
        if (guestHasUsefulData) toast('Seus dados locais foram combinados com os dados da conta.');
      } else {
        // First sign-in: migrate guest data once. Returning users prefer their account cache.
        state = normalizeWorkspaceData(hasAccountCache ? cachedState : previousState, user);
        lastCloudUpdate = null;
        cloudHydrated = true;
        saveState({ sync: false });
        subscribeToWorkspace(user.id);
        await syncWorkspace();
        renderShell();
        if (!hasAccountCache) toast('Seus dados deste aparelho foram importados para sua conta.');
      }
      if (!syncListenersInstalled) {
        window.addEventListener('online', () => { refreshFromCloud(); scheduleCloudSync(); });
        window.addEventListener('focus', refreshFromCloud);
        window.addEventListener('pageshow', refreshFromCloud);
        document.addEventListener('visibilitychange', handleVisibilityRefresh);
        syncListenersInstalled = true;
      }
    } catch (error) {
      cloudHydrated = false;
      state = normalizeWorkspaceData(localStorage.getItem(accountStorageKey(user.id)) ? loadState(accountStorageKey(user.id)) : previousState, user);
      saveState({ sync: false });
      setSyncStatus('Conta conectada · sincronização precisa ser configurada');
      renderShell();
      toast(`Login realizado, mas a nuvem ainda não está pronta. Execute supabase/schema.sql e confira as variáveis.`, 'error');
      console.error('Não foi possível inicializar a nuvem:', error);
    }
  })().finally(() => {
    activationPromise = null;
    activatingUserId = null;
  });
  return activationPromise;
}
function handleVisibilityRefresh() { if (document.visibilityState === 'visible') refreshFromCloud(); }
async function deactivateSession() {
  if (!currentUser && !cloudHydrated) return;
  if (realtimeChannel && supabase) { await supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
  clearTimeout(syncTimer); syncTimer = null;
  currentUser = null; cloudHydrated = false; lastCloudUpdate = null;
  state = loadState('my-espace-state');
  setSyncStatus(syncStatusForCurrentSession());
  applyPreferences(); renderShell();
}
async function initAuth() {
  if (!supabase) { setSyncStatus(syncStatusForCurrentSession()); return; }
  supabase.auth.onAuthStateChange((_event, session) => {
    // Defer Supabase calls until after its auth callback lock is released.
    setTimeout(() => {
      if (session?.user) activateSession(session.user);
      else if (currentUser) deactivateSession();
    }, 0);
  });
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user) await activateSession(data.session.user);
    else setSyncStatus(syncStatusForCurrentSession());
  } catch (error) {
    console.warn('Inicialização da autenticação:', error);
    setSyncStatus('Não foi possível verificar a sessão');
  }
}

renderShell();
initAuth();
