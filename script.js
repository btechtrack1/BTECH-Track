// ═══════════════════════════════════════════════════════════
// SUPABASE CONFIG
// ═══════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://rtyjrdejyhlwrjozdsyy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0eWpyZGVqeWhsd3Jqb3pkc3l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTczOTQsImV4cCI6MjA5NDA5MzM5NH0.BQoi0ihl18crOLKy4MUcKavBYCT8VWTwGBaEQrmU0gc';
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ═══════════════════════════════════════════════════════════
   TODO SQL SETUP — Run once in Supabase SQL Editor:
 
   create table if not exists public.todos (
     id uuid primary key default uuid_generate_v4(),
     user_id uuid not null references auth.users(id) on delete cascade,
     title text not null,
     description text default '',
     type text not null default 'daily' check (type in ('daily','weekly','monthly','yearly')),
     priority text not null default 'medium' check (priority in ('high','medium','low')),
     category text not null default 'Personal',
     due_date date,
     completed boolean not null default false,
     completed_at timestamptz,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );
   alter table public.todos enable row level security;
   create policy "Users manage own todos" on public.todos for all using (auth.uid() = user_id);
   create index if not exists todos_user_idx on public.todos(user_id);
   create index if not exists todos_type_idx on public.todos(type);
   create index if not exists todos_completed_idx on public.todos(completed);
═══════════════════════════════════════════════════════════ */

// ── Auth State ───────────────────────────────────────────────
let currentUser = null;
let currentProfile = null;
let _demoMode = false;
let _demoData = {
  income: [], expenses: [], goals: [], budgets: [], shopping: [], savings: [],
  todos: [], loans: [], loanPayments: [], nextId: 1
};

function isAdmin() { return _demoMode || currentProfile?.role === 'admin'; }

// ── DOM Helpers ──────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

function showLoader() {
  el('app-loading').setAttribute('style', 'display:flex!important');
  el('auth-screen').setAttribute('style', 'display:none!important');
  el('app-screen').setAttribute('style', 'display:none!important');
  const lp = el('landing-page');
  if (lp) lp.style.display = 'none';
}

function showAuth() {
  el('app-loading').setAttribute('style', 'display:none!important');
  el('app-screen').setAttribute('style', 'display:none!important');
  el('auth-screen').setAttribute('style', 'display:none!important');
  // On desktop show landing page; on mobile auth screen directly
  const isMob = window.innerWidth <= 1024;
  if (!isMob) {
    const lp = el('landing-page');
    if (lp) lp.style.display = 'block';
  } else {
    el('auth-screen').setAttribute('style', 'display:block!important');
  }
}

function showApp() {
  el('app-loading').setAttribute('style', 'display:none!important');
  el('auth-screen').setAttribute('style', 'display:none!important');
  el('app-screen').setAttribute('style', 'display:block!important');
  const lp = el('landing-page');
  if (lp) lp.style.display = 'none';
  const ob = el('mobile-onboarding');
  if (ob) ob.style.display = 'none';
}

function hideLoader() { el('app-loading').setAttribute('style', 'display:none!important'); }

// ── Sidebar ──────────────────────────────────────────────────
let _sidebarCollapsed = false;

function toggleSidebar() {
  _sidebarCollapsed = !_sidebarCollapsed;
  el('sidebar').classList.toggle('collapsed', _sidebarCollapsed);
  el('topbar').classList.toggle('sidebar-collapsed', _sidebarCollapsed);
  el('app-body').classList.toggle('sidebar-collapsed', _sidebarCollapsed);
  el('sidebar').querySelector('.sidebar-toggle').textContent = _sidebarCollapsed ? '›' : '‹';
  localStorage.setItem('bt_sidebar', _sidebarCollapsed ? '1' : '');
}

function openMobileSidebar() {
  el('sidebar').classList.add('mobile-open');
  el('sidebar-overlay').style.display = 'block';
  setTimeout(() => el('sidebar-overlay').style.opacity = '1', 10);
  el('sidebar-overlay').style.pointerEvents = 'auto';
}

function closeMobileSidebar() {
  el('sidebar').classList.remove('mobile-open');
  el('sidebar-overlay').style.opacity = '0';
  el('sidebar-overlay').style.pointerEvents = 'none';
  setTimeout(() => { if (!el('sidebar').classList.contains('mobile-open')) el('sidebar-overlay').style.display = 'none'; }, 250);
}

// ── Theme ────────────────────────────────────────────────────
function toggleTheme() {
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  const next = isDark ? '' : 'dark';
  // Set ONLY on body — CSS uses body[data-theme] selectors
  document.body.setAttribute('data-theme', next);
  // Also set html for any legacy selectors
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('bt_theme', next);
  if (_prefs) { _prefs.themeMode = next === 'dark' ? 'dark' : 'light'; savePrefs(); }
  const icon = el('theme-btn-icon');
  if (icon) icon.textContent = next === 'dark' ? '☀️' : '🌙';
  // Re-render chart for new theme colors
  try { setTimeout(() => renderMonthChart(), 80); } catch (e) { }
}

(function () {
  const t = localStorage.getItem('bt_theme') || '';
  // Apply theme to body (primary) and html (legacy compat)
  document.body.setAttribute('data-theme', t);
  document.documentElement.setAttribute('data-theme', t);
  const s = localStorage.getItem('bt_sidebar');
  if (s) {
    _sidebarCollapsed = true;
    document.addEventListener('DOMContentLoaded', () => {
      el('sidebar')?.classList.add('collapsed');
      el('topbar')?.classList.add('sidebar-collapsed');
      el('app-body')?.classList.add('sidebar-collapsed');
    });
  }
})();

// ── Auth Tab Switcher ────────────────────────────────────────
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('show'));
  const panel = el('panel-' + tab);
  if (panel) panel.classList.add('show');
  document.querySelectorAll('.auth-tab').forEach((btn, i) => {
    btn.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'signup' && i === 1));
  });
}

// ── Password show/hide toggle ───────────────────────────────
const EYE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0112 19c-7 0-11-7-11-7a18.6 18.6 0 015.06-5.94M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 7 11 7a18.7 18.7 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24"/><path d="M1 1l22 22"/></svg>';
function togglePw(id, btn) {
  const input = el(id);
  if (!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  if (btn) btn.innerHTML = showing ? EYE_ICON : EYE_OFF_ICON;
}

// ── OAuth (Google / Facebook / Apple) ───────────────────────
async function doOAuth(provider) {
  try {
    const { error } = await _sb.auth.signInWithOAuth({
      provider: provider,
      options: { redirectTo: window.location.href.split('#')[0].split('?')[0] }
    });
    if (error) {
      const activePanel = document.querySelector('.auth-panel.show');
      const alertId = activePanel ? activePanel.querySelector('.auth-alert')?.id : null;
      if (alertId) showAlert(alertId, 'error', 'Sign In Failed', error.message);
    }
  } catch (e) {
    showToast('OAuth sign-in failed: ' + e.message, 'danger');
  }
}

// ── Mobile onboarding ───────────────────────────────────────
function mobOnboardGo(n) {
  document.querySelectorAll('.mob-slide').forEach(s => s.classList.remove('active'));
  const next = el('mob-slide-' + n);
  if (next) next.classList.add('active');
}

function mobOnboardFinish() {
  try { localStorage.setItem('bt_onboard_seen', '1'); } catch (e) { }
  const ob = el('mobile-onboarding');
  if (ob) ob.style.display = 'none';
  showAuthScreen('login');
}

// ── Splash screen (mobile) ──────────────────────────────────
function hideSplash() {
  const sp = el('splash-screen');
  if (!sp) return;
  sp.classList.add('splash-exit');
  setTimeout(() => { sp.style.display = 'none'; }, 420);
}

(function () {
  try {
    const isMobile = window.innerWidth <= 1024;
    const seen = localStorage.getItem('bt_onboard_seen');
    document.addEventListener('DOMContentLoaded', () => {
      const sp = el('splash-screen');
      if (!isMobile) {
        if (sp) sp.style.display = 'none';
        return;
      }
      // Mobile: show splash for 2s, then either onboarding or straight to auth
      setTimeout(() => {
        hideSplash();
        if (!seen) {
          const ob = el('mobile-onboarding');
          if (ob) ob.style.display = 'block';
        }
      }, 2000);
    });
  } catch (e) { }
})();

// ── Info pages (About / Features / Security / Privacy / Terms / Contact / Support) ──
const INFO_PAGES = {
  about: { title: 'About BTECH Track', html: '<p>BTECH Track is a premium personal finance platform built to help you organise, understand, and grow your money — without the complexity of a bank or the volatility of a trading app.</p><p>Our mission is simple: give every user a single, secure place to manage income, expenses, budgets, goals, and loans, backed by cloud sync so your financial picture is always up to date wherever you are.</p><p>We focus on three things — financial organisation, clarity, and trust. Every feature, from automated budgeting to PDF reporting, is designed to reduce financial stress and help you make confident decisions.</p><p>BTECH Track is built on Supabase, giving us secure authentication and reliable cloud storage, while keeping the experience fast, simple, and free of unnecessary complexity.</p>' },
  features: { title: 'Features', html: '<ul class="info-list"><li><strong>Income &amp; Expense Tracking</strong> — Log and categorise every transaction in seconds.</li><li><strong>Goals</strong> — Set savings targets and track progress visually.</li><li><strong>Budgets</strong> — Automatic budget allocation with spending alerts.</li><li><strong>Shopping &amp; Tasks</strong> — Keep planned purchases and to-dos in one place.</li><li><strong>Loan Tracker</strong> — Monitor balances, repayments, and progress over time.</li><li><strong>PDF Reports</strong> — Export clean, shareable financial reports.</li><li><strong>Analytics</strong> — Visual breakdowns of spending and income trends.</li><li><strong>Cloud Sync</strong> — Your data stays in sync across every device, securely.</li></ul>' },
  security: { title: 'Security', html: '<p>Your financial data deserves serious protection, and BTECH Track is built with that as a priority.</p><ul class="info-list"><li><strong>Encryption</strong> — Data is encrypted in transit using industry-standard TLS.</li><li><strong>Authentication</strong> — Secure sign-in via email/password or trusted OAuth providers (Google, Facebook, Apple).</li><li><strong>Password Protection</strong> — Passwords are never stored in plain text and are handled entirely by our authentication provider.</li><li><strong>Secure Cloud Storage</strong> — Your records are stored on Supabase infrastructure with row-level access controls.</li><li><strong>Account Protection</strong> — Session management and recovery flows help keep your account in your hands only.</li></ul><p>BTECH Track is not a bank and is not subject to banking regulation — it is a personal tracking tool, not a custodian of funds.</p>' },
  privacy: { title: 'Privacy Policy', html: '<p><em>Last updated 2026.</em> This Privacy Policy explains how BTECH Track collects, uses, and protects your information.</p><h3>Information We Collect</h3><p>We collect the information you provide directly, such as your name and email address, along with the financial records you choose to enter (income, expenses, goals, budgets, loans, and similar data).</p><h3>Authentication</h3><p>Sign-in is handled via Supabase Authentication, supporting email/password and OAuth providers including Google, Facebook, and Apple. We do not see or store your OAuth provider passwords.</p><h3>Cloud Storage</h3><p>Your data is stored securely using Supabase\'s cloud infrastructure. Access is restricted to your authenticated account.</p><h3>Cookies &amp; Analytics</h3><p>We may use minimal local storage and cookies to keep you signed in and remember preferences. We do not sell your data to advertisers.</p><h3>Your Rights</h3><p>You may access, correct, export, or delete your data at any time from within the app, or by contacting support.</p><h3>Account Deletion</h3><p>You can request full account and data deletion at any time. Once processed, this action is permanent.</p><h3>Third-Party Services</h3><p>We rely on Supabase for authentication and database infrastructure, and on OAuth providers (Google, Facebook, Apple) for optional sign-in. These providers have their own privacy policies governing data they process.</p><p>BTECH Track is a personal finance tracker, not a bank, and is not subject to banking regulation.</p>' },
  terms: { title: 'Terms of Service', html: '<p><em>Last updated 2026.</em> By using BTECH Track, you agree to the following terms.</p><h3>User Responsibilities</h3><p>You are responsible for the accuracy of the financial information you enter and for keeping your login credentials confidential.</p><h3>Acceptable Use</h3><p>You agree not to misuse the platform, attempt unauthorised access, or use the service for unlawful purposes.</p><h3>Account Security</h3><p>You are responsible for all activity under your account. Notify us immediately if you suspect unauthorised access.</p><h3>Data Ownership</h3><p>You retain ownership of the financial data you enter. We process it solely to provide the service to you.</p><h3>Service Availability</h3><p>We aim for high availability but do not guarantee uninterrupted access. Features may change or be updated over time.</p><h3>Disclaimers</h3><p>BTECH Track is a personal organisation tool, not a bank, financial advisor, or investment broker. It does not provide financial advice, and is not subject to banking regulation.</p>' },
  contact: { title: 'Contact Us', html: '<p>We would love to hear from you.</p><ul class="info-list"><li><strong>Email:</strong> support@btechtrack.example</li><li><strong>Website:</strong> www.btechtrack.example</li><li><strong>Business Hours:</strong> Monday – Friday, 9:00 AM – 6:00 PM (EAT)</li></ul><p>For feedback, feature requests, or partnership enquiries, reach out via email and our team will respond as soon as possible.</p>' },
  support: { title: 'Support', html: '<h3>Help Centre</h3><p>Find answers to common questions below, or contact support for further help.</p><h3>Frequently Asked Questions</h3><ul class="info-list"><li><strong>How do I reset my password?</strong> Use "Forgot password?" on the sign-in screen to receive a reset link by email.</li><li><strong>I\'m having trouble signing in.</strong> Check that you\'re using the correct email or try signing in with Google, Facebook, or Apple if you originally registered that way.</li><li><strong>My data isn\'t syncing.</strong> Ensure you have an active internet connection. Cloud sync happens automatically when online.</li><li><strong>How do I report a bug?</strong> Email support with a description of the issue and the device/browser you were using.</li><li><strong>Can I request a new feature?</strong> Yes — we welcome feature requests via email.</li></ul>' }
};

function openInfoPage(key) {
  const page = INFO_PAGES[key];
  if (!page) return;
  el('info-modal-title').textContent = page.title;
  el('info-modal-content').innerHTML = page.html;
  const overlay = el('info-modal-overlay');
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeInfoPage() {
  const overlay = el('info-modal-overlay');
  overlay.classList.remove('show');
  document.body.style.overflow = '';
}

// ── initAuth ─────────────────────────────────────────────────
async function initAuth() {

  if (window.location.hash.includes('type=recovery')) {
    showAuth(); switchAuthTab('reset'); return;
  }
  try {
    const { data } = await _sb.auth.getSession();
    if (data?.session?.user) {
      currentUser = data.session.user;
      currentProfile = await safeLoadProfile(currentUser);
      enterApp();
    } else {
      showAuth(); switchAuthTab('login');
    }
  } catch (e) {
    showAuth(); switchAuthTab('login');
  }
}

async function safeLoadProfile(user) {
  try {
    const { data } = await _sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (data) return data;
  } catch (e) { }
  return {
    id: user.id,
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0],
    email: user.email,
    role: 'user'
  };
}

function enterApp() {
  showApp();
  loadPrefs();
  applyThemeMode(_prefs.themeMode);
  loadPrefsFromServer();
  logLoginEvent();
  applyCustomCategories();
  const name = currentProfile?.name || currentUser?.email?.split('@')[0] || 'User';
  const initial = name.charAt(0).toUpperCase();
  const email = currentUser?.email || '';
  el('user-badge').textContent = name;
  el('topbar-avatar').textContent = initial;
  el('sidebar-avatar-text').textContent = initial;
  el('sidebar-user-name').textContent = name;
  el('sidebar-user-role').textContent = isAdmin() ? 'Administrator' : 'Member';
  el('admin-nav').style.display = isAdmin() ? '' : 'none';
  // Update dropdown
  const dn = el('dropdown-name'), de = el('dropdown-email'), da = el('dropdown-avatar');
  if (dn) dn.textContent = name;
  if (de) de.textContent = email;
  if (da) da.textContent = initial;
  const heroWalletName = el('hero-wallet-name');
  if (heroWalletName) heroWalletName.textContent = name ? name + "'s Wallet" : 'BTECH Track Wallet';
  // Load profile picture if available
  if (currentProfile?.avatar_url) {
    applyProfilePic(currentProfile.avatar_url);
  }
  setGreeting();
  // Apply saved sidebar state
  if (_sidebarCollapsed) {
    el('sidebar').classList.add('collapsed');
    el('topbar').classList.add('sidebar-collapsed');
    el('app-body').classList.add('sidebar-collapsed');
  }
  // Show dashboard
  _showPage('dashboard');
  // Show PIN lock screen if enabled
  showLockScreenIfNeeded();
  // Load data
  refreshAllData().then(() => { try { renderDashboard(); } catch (e) { } }).catch(() => { });
  subscribeRealtime(() => {
    refreshAllData().then(() => {
      try {
        const pg = _currentPage;
        if (pg) renderPage(pg);
      } catch (e) { }
    }).catch(() => { });
  });
}

function enterDemo() {
  _demoMode = true;
  currentUser = { id: 'demo', email: 'demo@btechtrack.local' };
  currentProfile = { id: 'demo', name: 'Demo User', email: 'demo@btechtrack.local', role: 'admin' };
  _demoData = {
    income: [
      { id: '1', user_id: 'demo', description: 'Monthly Salary', amount: 85000, category: 'Salary', transaction_date: new Date().toISOString().split('T')[0] },
      { id: '2', user_id: 'demo', description: 'Freelance Project', amount: 22000, category: 'Freelance', transaction_date: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0] }
    ],
    expenses: [
      { id: '3', user_id: 'demo', description: 'Rent', amount: 25000, category: 'Rent', transaction_date: new Date().toISOString().split('T')[0] },
      { id: '4', user_id: 'demo', description: 'Groceries', amount: 8500, category: 'Food', transaction_date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0] },
      { id: '5', user_id: 'demo', description: 'Safaricom Data', amount: 1200, category: 'Data', transaction_date: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0] }
    ],
    goals: [
      { id: '6', user_id: 'demo', name: 'Emergency Fund', target: 100000, saved: 45000, target_date: null, created_at: new Date().toISOString() },
      { id: '7', user_id: 'demo', name: 'Laptop Upgrade', target: 80000, saved: 62000, target_date: null, created_at: new Date().toISOString() }
    ],
    budgets: [
      { id: '8', user_id: 'demo', category: 'Food', planned: 12000, period: 'monthly', created_at: new Date().toISOString() },
      { id: '9', user_id: 'demo', category: 'Transport', planned: 5000, period: 'monthly', created_at: new Date().toISOString() }
    ],
    shopping: [
      { id: '10', user_id: 'demo', name: 'Milk (2L)', qty: '4 packs', cost: 600, done: false, created_at: new Date().toISOString() },
      { id: '11', user_id: 'demo', name: 'Bread', qty: '2 loaves', cost: 120, done: true, created_at: new Date().toISOString() }
    ],
    savings: [
      { id: '12', user_id: 'demo', description: 'Emergency fund deposit', amount: 10000, category: 'Emergency Fund', transaction_date: new Date().toISOString().split('T')[0] }
    ],
    todos: [
      { id: '13', user_id: 'demo', title: 'Review monthly budget', description: 'Check all spending categories', type: 'monthly', priority: 'high', category: 'Finance', due_date: new Date().toISOString().split('T')[0], completed: false, created_at: new Date().toISOString() },
      { id: '14', user_id: 'demo', title: 'Pay rent', description: '', type: 'monthly', priority: 'high', category: 'Finance', due_date: null, completed: true, created_at: new Date().toISOString() },
      { id: '15', user_id: 'demo', title: 'Update savings goal', description: '', type: 'weekly', priority: 'medium', category: 'Finance', due_date: null, completed: false, created_at: new Date().toISOString() }
    ],
    nextId: 16
  };
  enterApp();
}

// ── Alert Helpers ─────────────────────────────────────────────
// Alert type icons (module-scoped so showAlert can access them)
const ALERT_ICONS = {
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 20h20L12 2z"/><path d="M12 9v5M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v5"/></svg>'
};

function showAlert(id, type, title, msg, autoDismiss) {
  if (autoDismiss === undefined) autoDismiss = 6000;
  const a = el(id);
  if (!a) return;
  // Set classes first
  a.className = 'auth-alert show alert-' + type;
  // Set icon
  const iconEl = el(id + '-icon');
  if (iconEl) iconEl.innerHTML = ALERT_ICONS[type] || ALERT_ICONS.error;
  // Set title — ensure it's a block element with visible text
  const titleEl = el(id + '-title');
  if (titleEl) {
    titleEl.textContent = title || '';
    titleEl.style.display = title ? 'block' : 'none';
  }
  // Set message — ensure visibility
  const msgEl = el(id + '-msg');
  if (msgEl) {
    msgEl.textContent = msg || '';
    msgEl.style.display = msg ? 'block' : 'none';
    msgEl.style.opacity = '1';
  }
  if (autoDismiss) setTimeout(function () { hideAlert(id); }, autoDismiss);
}
function hideAlert(id) { const a = el(id); if (a) a.classList.remove('show'); }
function updatePwStrength(val) {
  const bar = el('pw-strength-fill'), lbl = el('pw-strength-label');
  if (!bar || !lbl) return;
  let score = 0;
  if (val.length >= 6) score++;
  if (val.length >= 10) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^a-zA-Z0-9]/.test(val)) score++;
  const levels = [
    { pct: '20%', col: '#ef4444', txt: 'Very Weak' },
    { pct: '40%', col: '#f97316', txt: 'Weak' },
    { pct: '60%', col: '#eab308', txt: 'Fair' },
    { pct: '80%', col: '#22c55e', txt: 'Strong' },
    { pct: '100%', col: '#16a34a', txt: 'Very Strong' }
  ];
  const lv = levels[Math.max(0, score - 1)] || levels[0];
  bar.style.width = val.length ? lv.pct : '0%';
  bar.style.background = lv.col;
  lbl.textContent = val.length ? lv.txt : '';
  lbl.style.color = lv.col;
}
function toggleProfileDropdown() { const d = el('profile-dropdown'); if (d) d.classList.toggle('open'); }
function closeProfileDropdown() { const d = el('profile-dropdown'); if (d) d.classList.remove('open'); }
document.addEventListener('click', function (e) { const pill = el('profile-pill'); if (pill && !pill.contains(e.target)) closeProfileDropdown(); });
// ── Login ────────────────────────────────────────────────────
async function doLogin() {
  const email = el('li-email').value.trim();
  const pass = el('li-pass').value;
  hideAlert('auth-alert-login');
  if (!email && !pass) { showAlert('auth-alert-login', 'error', 'Missing Fields', 'Please enter your email and password.'); return; }
  if (!email) { showAlert('auth-alert-login', 'error', 'Email Required', 'Please enter your email address.'); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showAlert('auth-alert-login', 'error', 'Invalid Email', 'Please enter a valid email address.'); return; }
  if (!pass) { showAlert('auth-alert-login', 'error', 'Password Required', 'Please enter your password.'); return; }
  setBtn('btn-login', true, 'Signing in...');
  try {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password: pass });
    setBtn('btn-login', false, 'Sign In →');
    if (error) {
      let title = 'Sign In Failed', msg = error.message;
      if (msg.includes('Invalid login credentials') || msg.includes('Invalid')) { title = 'Wrong Credentials'; msg = 'The email or password you entered is incorrect. Please try again.'; }
      else if (msg.includes('Email not confirmed')) { title = 'Email Not Confirmed'; msg = 'Please check your inbox and confirm your email address before signing in.'; }
      else if (msg.includes('Too many requests')) { title = 'Too Many Attempts'; msg = 'You have made too many login attempts. Please wait a moment before trying again.'; }
      else if (msg.includes('User not found') || msg.includes('No user')) { title = 'Account Not Found'; msg = 'No account exists with this email address. Please check or create a new account.'; }
      else if (msg.includes('network') || msg.includes('fetch') || msg.includes('Failed')) { title = 'Network Error'; msg = 'Unable to connect. Please check your internet connection and try again.'; }
      else if (msg.includes('disabled') || msg.includes('blocked')) { title = 'Account Disabled'; msg = 'This account has been disabled. Please contact support.'; }
      showAlert('auth-alert-login', 'error', title, msg); return;
    }
    currentUser = data.user;
    currentProfile = await safeLoadProfile(data.user);
    showToast('Welcome back! Signed in successfully.', 'success');
    enterApp();
  } catch (e) {
    setBtn('btn-login', false, 'Sign In →');
    showAlert('auth-alert-login', 'error', 'Connection Error', 'Login failed. Please check your connection and try again.');
  }
}

// ── Signup ───────────────────────────────────────────────────
async function doSignup() {
  const name = el('su-name').value.trim();
  const email = el('su-email').value.trim();
  const pass = el('su-pass').value;
  const pass2 = el('su-pass2').value;
  hideAlert('auth-alert-signup');
  if (!name) { showAlert('auth-alert-signup', 'error', 'Name Required', 'Please enter your full name.'); return; }
  if (!email) { showAlert('auth-alert-signup', 'error', 'Email Required', 'Please enter your email address.'); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showAlert('auth-alert-signup', 'error', 'Invalid Email', 'Please enter a valid email address (e.g. you@example.com).'); return; }
  if (!pass) { showAlert('auth-alert-signup', 'error', 'Password Required', 'Please create a password for your account.'); return; }
  if (pass.length < 6) { showAlert('auth-alert-signup', 'warning', 'Weak Password', 'Your password must be at least 6 characters long.'); return; }
  if (pass !== pass2) { showAlert('auth-alert-signup', 'error', 'Passwords Do Not Match', 'The passwords you entered do not match. Please try again.'); return; }
  setBtn('btn-signup', true, 'Creating account...');
  try {
    const { data: su, error: suErr } = await _sb.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
    if (suErr) {
      setBtn('btn-signup', false, 'Create Account →');
      let title = 'Signup Failed', emsg = suErr.message;
      if (emsg.includes('already registered') || emsg.includes('already exists')) { title = 'Email Already Registered'; emsg = 'An account with this email already exists. Try signing in instead.'; }
      else if (emsg.includes('weak') || emsg.includes('password')) { title = 'Weak Password'; emsg = 'Please choose a stronger password with a mix of letters, numbers, and symbols.'; }
      else if (emsg.includes('network') || emsg.includes('fetch')) { title = 'Network Error'; emsg = 'Unable to connect. Please check your internet connection.'; }
      showAlert('auth-alert-signup', 'error', title, emsg); return;
    }
    const { data: si, error: siErr } = await _sb.auth.signInWithPassword({ email, password: pass });
    setBtn('btn-signup', false, 'Create Account →');
    if (siErr) {
      showAlert('auth-alert-signup', 'success', 'Account Created!', 'Check your email to confirm your account, then sign in.', 0);
      setTimeout(function () { switchAuthTab('login'); }, 4000); return;
    }
    currentUser = si.user;
    currentProfile = { id: si.user.id, name, email, role: 'user' };
    try { await _sb.from('profiles').upsert({ id: si.user.id, name, email, role: 'user' }); } catch (e) { }
    showToast('Account created! Welcome to BTECH Track.', 'success');
    enterApp();
  } catch (e) {
    setBtn('btn-signup', false, 'Create Account →');
    showAlert('auth-alert-signup', 'error', 'Signup Failed', 'Something went wrong: ' + e.message);
  }
}

async function doLogout() {
  currentUser = null; currentProfile = null;
  if (_demoMode) { _demoMode = false; showAuth(); switchAuthTab('login'); showToast('You have been signed out.', 'info'); return; }
  try { await _sb.auth.signOut(); } catch (e) { }
  showAuth(); switchAuthTab('login'); showToast('Signed out successfully.', 'success');
}

async function doForgotPassword() {
  const email = el('fp-email').value.trim();
  hideAlert('auth-alert-forgot');
  if (!email) { showAlert('auth-alert-forgot', 'error', 'Email Required', 'Please enter your email address.'); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showAlert('auth-alert-forgot', 'error', 'Invalid Email', 'Please enter a valid email address.'); return; }
  setBtn('btn-forgot', true, 'Sending...');
  const { error } = await _sb.auth.resetPasswordForEmail(email);
  setBtn('btn-forgot', false, 'Send Reset Link →');
  if (error) { showAlert('auth-alert-forgot', 'error', 'Request Failed', error.message); }
  else { showAlert('auth-alert-forgot', 'success', 'Reset Link Sent', 'Check your inbox for the password reset link. It may take a few minutes.', 0); }
}

async function doUpdatePassword() {
  const pass = el('rp-pass').value, pass2 = el('rp-pass2').value;
  hideAlert('auth-alert-reset');
  if (!pass) { showAlert('auth-alert-reset', 'error', 'Password Required', 'Please enter your new password.'); return; }
  if (pass.length < 6) { showAlert('auth-alert-reset', 'warning', 'Weak Password', 'Password must be at least 6 characters.'); return; }
  if (pass !== pass2) { showAlert('auth-alert-reset', 'error', 'Passwords Do Not Match', 'The two passwords do not match. Please try again.'); return; }
  setBtn('btn-reset-pass', true, 'Updating...');
  const { error } = await _sb.auth.updateUser({ password: pass });
  setBtn('btn-reset-pass', false, 'Update Password →');
  if (error) { showAlert('auth-alert-reset', 'error', 'Update Failed', error.message); }
  else { showAlert('auth-alert-reset', 'success', 'Password Updated!', 'Your password has been changed. Redirecting to login...', 0); setTimeout(function () { switchAuthTab('login'); }, 2500); }
}

// ═══════════════════════════════════════════════════════════
// DATABASE — CRUD HELPERS (all preserved)
// ═══════════════════════════════════════════════════════════
function uid() { return currentUser?.id || 'demo'; }
function demoId() { return String(_demoData.nextId++); }

async function fetchIncome() {
  if (_demoMode) return _demoData.income;
  try {
    const { data, error } = await _sb.from('income').select('*').eq('user_id', uid()).order('transaction_date', { ascending: false });
    if (error) { console.warn('fetchIncome error:', error.message); return []; }
    return data || [];
  } catch (e) { console.warn('fetchIncome exception:', e); return []; }
}

async function addIncome(row) {
  if (_demoMode) { _demoData.income.unshift({ id: demoId(), user_id: 'demo', ...row }); return true; }
  const { error } = await _sb.from('income').insert({ ...row, user_id: uid() });
  if (error) { showToast(error.message, 'danger'); return false; }
  return true;
}

async function deleteIncome(id) {
  if (_demoMode) { _demoData.income = _demoData.income.filter(r => r.id !== id); return true; }
  const { error } = await _sb.from('income').delete().eq('id', id).eq('user_id', uid());
  if (error) { showToast(error.message, 'danger'); return false; }
  return true;
}

async function fetchExpenses() {
  if (_demoMode) return _demoData.expenses;
  try {
    const { data, error } = await _sb.from('expenses').select('*').eq('user_id', uid()).order('transaction_date', { ascending: false });
    if (error) { console.warn('fetchExpenses error:', error.message); return []; }
    return data || [];
  } catch (e) { console.warn('fetchExpenses exception:', e); return []; }
}

async function addExpense(row) {
  if (_demoMode) { _demoData.expenses.unshift({ id: demoId(), user_id: 'demo', ...row }); return true; }
  const { error } = await _sb.from('expenses').insert({ ...row, user_id: uid() });
  if (error) { showToast(error.message, 'danger'); return false; }
  return true;
}

async function deleteExpense(id) {
  if (_demoMode) { _demoData.expenses = _demoData.expenses.filter(r => r.id !== id); return true; }
  const { error } = await _sb.from('expenses').delete().eq('id', id).eq('user_id', uid());
  if (error) { showToast(error.message, 'danger'); return false; }
  return true;
}

async function fetchGoals() {
  if (_demoMode) return _demoData.goals;
  const { data } = await _sb.from('goals').select('*').eq('user_id', uid()).order('created_at', { ascending: false });
  return data || [];
}

async function addGoal(row) {
  if (_demoMode) { _demoData.goals.unshift({ id: demoId(), user_id: 'demo', created_at: new Date().toISOString(), ...row }); return true; }
  const { error } = await _sb.from('goals').insert({ ...row, user_id: uid() });
  if (error) { showToast(error.message, 'danger'); return false; }
  return true;
}

async function deleteGoal(id) {
  if (_demoMode) { _demoData.goals = _demoData.goals.filter(r => r.id !== id); return true; }
  const { error } = await _sb.from('goals').delete().eq('id', id).eq('user_id', uid());
  if (error) { showToast(error.message, 'danger'); return false; }
  return true;
}

async function updateGoalSaved(id, newSaved) {
  if (_demoMode) {
    const g = _demoData.goals.find(r => r.id === id);
    if (g) g.saved = newSaved;
    return true;
  }
  const { error } = await _sb.from('goals').update({ saved: newSaved }).eq('id', id).eq('user_id', uid());
  if (error) { showToast(error.message, 'danger'); return false; }
  return true;
}

async function fetchBudgets() {
  if (_demoMode) return _demoData.budgets;
  const { data } = await _sb.from('budgets').select('*').eq('user_id', uid()).order('created_at', { ascending: false });
  return data || [];
}

async function updateBudgetSpent(id, addAmount) {
  // Add an expense entry tagged to the budget category
  const budget = _budgets.find(b => b.id === id);
  if (!budget) return false;
  const row = {
    description: 'Budget payment — ' + budget.category,
    amount: addAmount,
    category: budget.category,
    transaction_date: new Date().toISOString().split('T')[0]
  };
  return addExpense(row);
}

async function addBudget(row) {
  if (_demoMode) { _demoData.budgets.unshift({ id: demoId(), user_id: 'demo', created_at: new Date().toISOString(), ...row }); return true; }
  const { error } = await _sb.from('budgets').insert({ ...row, user_id: uid() });
  if (error) { showToast(error.message, 'danger'); return false; }
  return true;
}

async function deleteBudget(id) {
  if (_demoMode) { _demoData.budgets = _demoData.budgets.filter(r => r.id !== id); return true; }
  const { error } = await _sb.from('budgets').delete().eq('id', id).eq('user_id', uid());
  if (error) { showToast(error.message, 'danger'); return false; }
  return true;
}

async function fetchShopping() {
  if (_demoMode) return _demoData.shopping;
  const { data } = await _sb.from('shopping').select('*').eq('user_id', uid()).order('created_at', { ascending: false });
  return data || [];
}

async function addShoppingItem(row) {
  if (_demoMode) { _demoData.shopping.unshift({ id: demoId(), user_id: 'demo', done: false, created_at: new Date().toISOString(), ...row }); return true; }
  const { error } = await _sb.from('shopping').insert({ ...row, user_id: uid(), done: false });
  if (error) { showToast(error.message, 'danger'); return false; }
  return true;
}

async function toggleShoppingItem(id, done) {
  if (_demoMode) { const i = _demoData.shopping.find(r => r.id === id); if (i) i.done = done; return true; }
  await _sb.from('shopping').update({ done }).eq('id', id).eq('user_id', uid());
  return true;
}

async function deleteShoppingItem(id) {
  if (_demoMode) { _demoData.shopping = _demoData.shopping.filter(r => r.id !== id); return true; }
  const { error } = await _sb.from('shopping').delete().eq('id', id).eq('user_id', uid());
  if (error) { showToast(error.message, 'danger'); return false; }
  return true;
}

async function fetchSavings() {
  if (_demoMode) return _demoData.savings || [];
  try {
    const { data, error } = await _sb.from('savings').select('*').eq('user_id', uid()).order('transaction_date', { ascending: false });
    if (error) { console.warn('fetchSavings error:', error.message); return []; }
    return data || [];
  } catch (e) { return []; }
}

async function addSavings(row) {
  if (_demoMode) { if (!_demoData.savings) _demoData.savings = []; _demoData.savings.unshift({ id: demoId(), user_id: 'demo', ...row }); return true; }
  try {
    const { error } = await _sb.from('savings').insert({ ...row, user_id: uid() });
    if (error) { showToast('Savings error: ' + error.message, 'danger'); return false; }
    return true;
  } catch (e) { showToast('Savings error: ' + e.message, 'danger'); return false; }
}

async function deleteSavings(id) {
  if (_demoMode) { _demoData.savings = (_demoData.savings || []).filter(r => r.id !== id); return true; }
  try {
    const { error } = await _sb.from('savings').delete().eq('id', id).eq('user_id', uid());
    if (error) { showToast(error.message, 'danger'); return false; }
    return true;
  } catch (e) { showToast(e.message, 'danger'); return false; }
}

async function updateSavingsEntry(id, patch) {
  if (_demoMode) {
    const s = (_demoData.savings || []).find(r => r.id === id);
    if (s) Object.assign(s, patch);
    return true;
  }
  try {
    const { error } = await _sb.from('savings').update(patch).eq('id', id).eq('user_id', uid());
    if (error) { showToast(error.message, 'danger'); return false; }
    return true;
  } catch (e) { showToast(e.message, 'danger'); return false; }
}

// ── Todos CRUD ───────────────────────────────────────────────
async function fetchTodos() {
  if (_demoMode) return _demoData.todos || [];
  try {
    const { data, error } = await _sb.from('todos').select('*').eq('user_id', uid()).order('created_at', { ascending: false });
    if (error) { console.warn('fetchTodos error:', error.message); return []; }
    return data || [];
  } catch (e) { return []; }
}

async function addTodo(row) {
  if (_demoMode) {
    if (!_demoData.todos) _demoData.todos = [];
    _demoData.todos.unshift({ id: demoId(), user_id: 'demo', completed: false, created_at: new Date().toISOString(), ...row });
    return true;
  }
  try {
    const { error } = await _sb.from('todos').insert({ ...row, user_id: uid(), completed: false });
    if (error) { showToast('Task error: ' + error.message, 'danger'); return false; }
    return true;
  } catch (e) { showToast(e.message, 'danger'); return false; }
}

async function updateTodo(id, changes) {
  if (_demoMode) {
    const t = (_demoData.todos || []).find(r => r.id === id);
    if (t) Object.assign(t, changes, { updated_at: new Date().toISOString() });
    return true;
  }
  try {
    const { error } = await _sb.from('todos').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', uid());
    if (error) { showToast(error.message, 'danger'); return false; }
    return true;
  } catch (e) { return false; }
}

async function deleteTodo(id) {
  if (_demoMode) { _demoData.todos = (_demoData.todos || []).filter(r => r.id !== id); return true; }
  try {
    const { error } = await _sb.from('todos').delete().eq('id', id).eq('user_id', uid());
    if (error) { showToast(error.message, 'danger'); return false; }
    return true;
  } catch (e) { return false; }
}

// ── Real-time ────────────────────────────────────────────────
function subscribeRealtime(callback) {
  if (_demoMode) return;
  try {
    _sb.channel('btech-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => callback(payload.table))
      .subscribe();
  } catch (e) { }
}

// ── Admin Helpers ────────────────────────────────────────────
async function adminFetchAllUsers() {
  if (_demoMode) return [{ id: 'demo', name: 'Demo User', email: 'demo@btechtrack.local', role: 'admin', locked: false, created_at: new Date().toISOString() }];
  const { data } = await _sb.from('profiles').select('*').order('created_at', { ascending: false });
  return data || [];
}

async function adminFetchAllIncome() {
  if (_demoMode) return _demoData.income;
  const { data } = await _sb.from('income').select('*').order('transaction_date', { ascending: false });
  return data || [];
}

async function adminFetchAllExpenses() {
  if (_demoMode) return _demoData.expenses;
  const { data } = await _sb.from('expenses').select('*').order('transaction_date', { ascending: false });
  return data || [];
}

async function adminToggleLock(userId, locked) {
  if (_demoMode) return true;
  const { error } = await _sb.from('profiles').update({ locked }).eq('id', userId);
  return !error;
}

async function adminFetchAllSavings() {
  if (_demoMode) return _demoData.savings || [];
  try { const { data } = await _sb.from('savings').select('*'); return data || []; } catch (e) { return []; }
}

// ═══════════════════════════════════════════════════════════
// APP CORE — DATA CACHE & REFRESH
// ═══════════════════════════════════════════════════════════
let _income = [], _expenses = [], _goals = [], _budgets = [], _shopping = [], _savings = [], _todos = [];

async function refreshAllData() {
  const safe = async (fn) => { try { return await fn(); } catch (e) { return []; } };
  const [inc, exp, gls, bud, shp, sav, tds] = await Promise.all([
    safe(fetchIncome), safe(fetchExpenses), safe(fetchGoals), safe(fetchBudgets),
    safe(fetchShopping), safe(fetchSavings), safe(fetchTodos)
  ]);
  _income = Array.isArray(inc) ? inc : [];
  _expenses = Array.isArray(exp) ? exp : [];
  _goals = Array.isArray(gls) ? gls : [];
  _budgets = Array.isArray(bud) ? bud : [];
  _shopping = Array.isArray(shp) ? shp : [];
  _savings = Array.isArray(sav) ? sav : [];
  _todos = Array.isArray(tds) ? tds : [];
}

// ── Utilities ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════
// MULTI-CURRENCY SUPPORT
// ═══════════════════════════════════════════════════════════
const CURRENCIES = {
  KES: { symbol: 'KES', locale: 'en-KE', rate: 1, decimals: 0 },
  USD: { symbol: '$', locale: 'en-US', rate: 0.0077, decimals: 2 },
  EUR: { symbol: '€', locale: 'de-DE', rate: 0.0071, decimals: 2 },
  GBP: { symbol: '£', locale: 'en-GB', rate: 0.0061, decimals: 2 },
  TZS: { symbol: 'TZS', locale: 'en-TZ', rate: 20.0, decimals: 0 },
  UGX: { symbol: 'UGX', locale: 'en-UG', rate: 28.5, decimals: 0 },
  RWF: { symbol: 'RWF', locale: 'en-RW', rate: 10.2, decimals: 0 }
};
let _activeCurrency = localStorage.getItem('btech_currency') || 'KES';
function getCurrency() { return CURRENCIES[_activeCurrency] || CURRENCIES['KES']; }
function setCurrency(code) {
  if (CURRENCIES[code]) {
    _activeCurrency = code;
    localStorage.setItem('btech_currency', code);
    renderPage(_currentPage);
  }
}
function fmtN(n) {
  const c = getCurrency();
  const converted = Number(n || 0) * c.rate;
  return converted.toLocaleString(c.locale, { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals });
}
function fmt(n) {
  const c = getCurrency();
  return c.symbol + ' ' + fmtN(n);
}
// Always shows 2 decimal places — used on the wallet card, where a bank-card
// style balance (with cents) is expected regardless of the currency's
// normal rounding (e.g. KES normally rounds to whole shillings elsewhere).
function fmtHero(n) {
  const c = getCurrency();
  const converted = Number(n || 0) * c.rate;
  return c.symbol + ' ' + converted.toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) { const d = document.createElement('div'); d.textContent = String(s || ''); return d.innerHTML; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : ''; }
function fmtMonth(k) { const [y, m] = String(k).split('-'); return new Date(+y, +m - 1).toLocaleString('en', { month: 'long', year: 'numeric' }); }
function catIconFA(c) {
  const map = {
    Food: '<i class="fa-solid fa-utensils"></i>',
    Transport: '<i class="fa-solid fa-car"></i>',
    Rent: '<i class="fa-solid fa-house"></i>',
    Bills: '<i class="fa-solid fa-bolt"></i>',
    Shopping: '<i class="fa-solid fa-bag-shopping"></i>',
    Health: '<i class="fa-solid fa-heart-pulse"></i>',
    Entertainment: '<i class="fa-solid fa-film"></i>',
    Business: '<i class="fa-solid fa-briefcase"></i>',
    Data: '<i class="fa-solid fa-mobile-screen"></i>',
    Education: '<i class="fa-solid fa-graduation-cap"></i>',
    Savings: '<i class="fa-solid fa-piggy-bank"></i>',
    Salary: '<i class="fa-solid fa-money-bill-wave"></i>',
    Freelance: '<i class="fa-solid fa-laptop-code"></i>',
    Investment: '<i class="fa-solid fa-chart-line"></i>'
  };
  return map[c] || '<i class="fa-solid fa-circle-dot"></i>';
}

function catIcon(c) {
  const map = { Food: '🍔', Transport: '🚗', Rent: '🏠', Bills: '💡', Shopping: '🛍️', Health: '🏥', Entertainment: '🎬', Business: '💼', Data: '📱', Education: '📚' };
  return map[c] || '📌';
}

function showToast(msg, type = 'info', duration = 3500) {
  const icons = {
    success: '<i class="fa-solid fa-circle-check" style="color:#10B981;font-size:15px"></i>',
    danger: '<i class="fa-solid fa-circle-xmark" style="color:#EF4444;font-size:15px"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation" style="color:#F59E0B;font-size:15px"></i>',
    info: '<i class="fa-solid fa-circle-info" style="color:#06B6D4;font-size:15px"></i>'
  };
  const borders = { success: '#10B981', danger: '#EF4444', warning: '#F59E0B', info: '#06B6D4' };
  const div = document.createElement('div');
  div.className = `toast toast-${type}`;
  div.style.borderLeft = `3px solid ${borders[type] || borders.info}`;
  div.innerHTML = `<span class="toast-icon" style="display:flex;align-items:center">${icons[type] || icons.info}</span><span style="flex:1">${esc(msg)}</span>`;
  el('toast-container').appendChild(div);
  setTimeout(() => div.remove(), duration);
}

function setBtn(id, loading, text) {
  const btn = el(id);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = text;
}

function setGreeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  el('greeting-text').textContent = g + ', ' + (currentProfile?.name || 'there') + ' 👋';
  el('greeting-sub').textContent = new Date().toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ═══════════════════════════════════════════════════════════
// PAGE NAVIGATION
// ═══════════════════════════════════════════════════════════
let _currentPage = 'dashboard';
const pageTitles = {
  dashboard: 'Dashboard', transactions: 'Transactions', goals: 'Goals', budget: 'Budget',
  shopping: 'Shopping', savings: 'Savings', reports: 'Reports', advice: 'Financial Advice',
  admin: 'Admin Panel', todo: 'Task Manager', loans: 'Loan Manager',
  calculator: 'Smart Calculator', 'ai-adviser': 'AI Adviser',
  'auto-budget': 'Auto Budget', currency: 'Currency Settings', settings: 'Settings'
};

function _showPage(name) {
  _currentPage = name;
  document.querySelectorAll('[id^="page-"]').forEach(p => p.style.display = 'none');
  const pg = el('page-' + name);
  if (pg) { pg.style.display = ''; pg.classList.remove('fade-in'); void pg.offsetWidth; pg.classList.add('fade-in'); }
  // Update sidebar
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
  const sb = document.querySelector(`.sidebar-btn[data-page="${name}"]`);
  if (sb) sb.classList.add('active');
  // Update topbar title
  if (el('topbar-title')) el('topbar-title').textContent = pageTitles[name] || name;
  // Close mobile sidebar
  closeMobileSidebar();
}

async function showPage(name, btn) {
  _showPage(name);
  renderPage(name);
}

function updateMobileNav(btn) {
  document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function renderPage(name) {
  if (name === 'calculator') {
    ['math', 'date', 'currency'].forEach(t => {
      const p = document.getElementById('calc-panel-' + t);
      const b = document.getElementById('calc-tab-' + t);
      if (p) p.style.display = t === 'math' ? '' : 'none';
      if (b) b.classList.toggle('active', t === 'math');
    });
    const mainEl = document.getElementById('calc-main');
    if (mainEl && (!mainEl.textContent || mainEl.textContent.trim() === '')) mainEl.textContent = '0';
    setTimeout(() => { if (document.getElementById('clock-time')) calcStartClock(); }, 50);
    return;
  }
  await refreshAllData();
  switch (name) {
    case 'dashboard': renderDashboard(); break;
    case 'transactions': renderTx(); break;
    case 'goals': renderGoals(); break;
    case 'budget': renderBudget(); break;
    case 'shopping': renderShop(); break;
    case 'reports': renderReports(); break;
    case 'advice': renderAdvice(); break;
    case 'savings': renderSavings(); break;
    case 'todo': renderTodo(); break;
    case 'admin': if (isAdmin()) renderAdmin(); else showToast('Admin only.', 'danger'); break;
    case 'loans': renderLoans(); break;
    case 'ai-adviser': renderAIAdviser(); break;
    case 'auto-budget': renderAutoBudget(); break;
    case 'currency': renderCurrencySettings(); break;
    case 'settings': renderSettings(); break;
  }
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
let pieInst = null, monthInst = null;

// Savings ledger: deposits add to the pool, withdrawals/transfers draw it down.
// Legacy rows created before this feature have no `type` and count as deposits.
function signedSavingsAmount(r) {
  const amt = parseFloat(r.amount) || 0;
  const t = r.type || 'deposit';
  return (t === 'withdrawal' || t === 'transfer') ? -amt : amt;
}

function computeSavingsTotals() {
  let totalDeposits = 0, totalWithdrawn = 0;
  _savings.forEach(r => {
    const amt = parseFloat(r.amount) || 0;
    const t = r.type || 'deposit';
    if (t === 'withdrawal' || t === 'transfer') totalWithdrawn += amt;
    else totalDeposits += amt;
  });
  return { totalDeposits, totalWithdrawn, net: totalDeposits - totalWithdrawn };
}

function groupNetSavingsByMonth() {
  return _savings.reduce((m, r) => {
    const k = monthKeyOf(r.transaction_date || r.date || r.created_at);
    if (k) m[k] = (m[k] || 0) + signedSavingsAmount(r);
    return m;
  }, {});
}

function calcTotals() {
  const income = _income.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const expense = _expenses.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const savings = computeSavingsTotals().net;
  const startingBalance = parseFloat(_prefs?.financial?.startingBalance) || 0;
  return { income, expense, balance: startingBalance + income - expense, savings };
}

function renderDashboard() {
  const { income, expense, balance } = calcTotals();
  const rate = (income > 0 && isFinite(balance)) ? Math.round((balance / income) * 100) : 0;

  el('d-income').textContent = fmt(income);
  el('d-income-c').textContent = _income.length + ' transaction' + (_income.length !== 1 ? 's' : '');
  el('d-expense').textContent = fmt(expense);
  el('d-expense-c').textContent = _expenses.length + ' transaction' + (_expenses.length !== 1 ? 's' : '');
  el('d-balance').textContent = fmt(balance);
  el('d-balance-s').textContent = rate + '% savings rate';

  const savTotal = computeSavingsTotals().net;
  const savEl = el('d-savings'), savCEl = el('d-savings-c');
  if (savEl) savEl.textContent = fmt(savTotal);
  if (savCEl) savCEl.textContent = _savings.length + ' entr' + (_savings.length !== 1 ? 'ies' : 'y');

  updateHeroBalanceCard(balance, rate);
  renderNetWorth();
  renderDashboardCardChanges();
  renderSmartInsights();

  renderPieChart(income, expense);
  renderMonthChart();

  const all = [
    ..._income.map(r => ({ ...r, type: 'income' })),
    ..._expenses.map(r => ({ ...r, type: 'expense' }))
  ].sort((a, b) => new Date(b.transaction_date || b.date) - new Date(a.transaction_date || a.date)).slice(0, 5);
  el('recent-list').innerHTML = all.length
    ? all.map(t => txRow(t, false)).join('')
    : '<div class="empty-state"><div class="empty-state-icon">💳</div>No transactions yet. Add your first one!</div>';
}

// ── Balance hero card (dashboard) ──
function updateHeroDate() {
  const dEl = el('hero-date');
  if (!dEl) return;
  dEl.textContent = new Date().toLocaleDateString('en-KE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// Stable pseudo card identity — derived from the user id so it stays
// consistent across sessions without needing a real card number.
function hashStr(s) {
  let h = 0;
  s = String(s || '');
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return h;
}

function getWalletCardIdentity() {
  const seed = hashStr(uid());
  const last4 = String(1000 + (seed % 9000));
  const monthsFromNow = 24 + (seed % 25); // 2-4 years out, deterministic
  const exp = new Date();
  exp.setMonth(exp.getMonth() + monthsFromNow);
  const mm = String(exp.getMonth() + 1).padStart(2, '0');
  const yy = String(exp.getFullYear()).slice(-2);
  return { last4, expiry: mm + '/' + yy };
}

function updateHeroBalanceCard(balance, rate) {
  updateHeroDate();

  const valEl = el('hero-balance-value');
  if (valEl) {
    const newText = fmtHero(balance);
    if (valEl.dataset.raw !== newText) {
      const prevRaw = parseFloat(valEl.dataset.rawNum || '0');
      valEl.dataset.raw = newText;
      valEl.dataset.rawNum = String(balance);
      animateHeroValue(valEl, isFinite(prevRaw) ? prevRaw : 0, balance);
      valEl.classList.remove('value-pulse');
      void valEl.offsetWidth; // restart animation
      valEl.classList.add('value-pulse');
    }
  }

  const cardEl = el('hero-card-number'), expEl = el('hero-card-expiry');
  if (cardEl || expEl) {
    const idy = getWalletCardIdentity();
    if (cardEl) cardEl.textContent = '•••• •••• •••• ' + idy.last4;
    if (expEl) expEl.textContent = idy.expiry;
  }

  const today = new Date().toDateString();
  const isToday = r => {
    const d = new Date(r.transaction_date || r.date || r.created_at || 0);
    return !isNaN(d) && d.toDateString() === today;
  };
  const todayIncome = _income.filter(isToday).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const todayExpense = _expenses.filter(isToday).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const liEl = el('hero-latest-income'), leEl = el('hero-latest-expense');
  if (liEl) liEl.textContent = fmt(todayIncome);
  if (leEl) leEl.textContent = fmt(todayExpense);

  const pctEl = el('hero-savings-pct'), fillEl = el('hero-savings-fill');
  const savPct = Math.max(0, Math.min(100, rate || 0));
  if (pctEl) pctEl.textContent = savPct + '%';
  if (fillEl) fillEl.style.width = savPct + '%';

  const monthKey = d => { const dt = new Date(d); return isNaN(dt) ? null : dt.getFullYear() + '-' + dt.getMonth(); };
  const curKey = monthKey(new Date());
  const monthlySavings = _savings.filter(r => monthKey(r.transaction_date || r.date || r.created_at) === curKey)
    .reduce((s, r) => s + signedSavingsAmount(r), 0);
  const msEl = el('hero-monthly-savings');
  if (msEl) msEl.textContent = fmt(monthlySavings);

  // Monthly Change — % change in net cash flow vs last month
  const incByM = groupSumByMonth(_income), expByM = groupSumByMonth(_expenses);
  const curNet = (incByM[curKey] || 0) - (expByM[curKey] || 0);
  const prevD = new Date(); prevD.setMonth(prevD.getMonth() - 1);
  const prevKey = monthKey(prevD);
  const prevNet = (incByM[prevKey] || 0) - (expByM[prevKey] || 0);
  const changeEl = el('hero-monthly-change');
  if (changeEl) {
    if (prevNet !== 0) {
      const pct = Math.round(((curNet - prevNet) / Math.abs(prevNet)) * 100);
      changeEl.textContent = (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct) + '%';
      changeEl.style.color = pct >= 0 ? '#34D399' : '#F87171';
    } else if (curNet > 0) {
      changeEl.textContent = '▲ New';
      changeEl.style.color = '#34D399';
    } else {
      changeEl.textContent = '—';
      changeEl.style.color = '';
    }
  }

  // Wallet status badge
  const badgeEl = el('wallet-status-badge'), badgeTextEl = el('wallet-status-badge-text');
  if (badgeEl && badgeTextEl) {
    let overBudget = false;
    if (_budgets.length) {
      overBudget = _budgets.some(b => {
        const spent = _expenses.filter(e => (e.category || e.cat) === b.category).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        const planned = parseFloat(b.planned || b.amount || 0);
        return planned > 0 && spent / planned >= 0.9;
      });
    }
    const curInc = incByM[curKey] || 0, curExp = expByM[curKey] || 0;
    badgeEl.classList.remove('status-warning', 'status-critical');
    if (overBudget || (curInc > 0 && curExp > curInc)) {
      badgeTextEl.textContent = 'Budget Warning';
      badgeEl.classList.add('status-warning');
    } else if (monthlySavings > 0) {
      badgeTextEl.textContent = 'Growing Savings';
    } else {
      badgeTextEl.textContent = 'Healthy Cash Flow';
    }
  }

  applyHeroBalanceVisibility();
  renderFinancialHealthScore();
}

// Smooth count-up animation for the hero balance value
function animateHeroValue(elNode, from, to) {
  if (!isFinite(from) || !isFinite(to) || Math.abs(to - from) < 0.01) {
    elNode.textContent = fmtHero(to);
    return;
  }
  const duration = 600;
  const start = performance.now();
  function tick(now) {
    const p = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const current = from + (to - from) * eased;
    elNode.textContent = fmtHero(current);
    if (p < 1) requestAnimationFrame(tick);
    else elNode.textContent = fmtHero(to);
  }
  requestAnimationFrame(tick);
}

function applyHeroBalanceVisibility() {
  const hidden = localStorage.getItem('btech_balance_hidden') === '1';
  const valEl = el('hero-balance-value'), icon = el('hero-eye-icon'), btn = el('hero-eye-btn');
  if (valEl) valEl.classList.toggle('blurred', hidden);
  if (icon) icon.className = hidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
  if (btn) btn.title = hidden ? 'Show balance' : 'Hide balance';
}

function toggleHeroBalance() {
  const hidden = localStorage.getItem('btech_balance_hidden') === '1';
  localStorage.setItem('btech_balance_hidden', hidden ? '0' : '1');
  applyHeroBalanceVisibility();
}

// ═══════════════════════════════════════════════════════════
// FINANCIAL HEALTH SCORE
// Weighted blend of savings rate, income stability, expense
// control, budget discipline, goal completion, debt ratio,
// monthly cash flow, income/expense ratio, savings growth and
// emergency-fund progress. Heuristic, not a credit score.
// ═══════════════════════════════════════════════════════════
function monthKeyOf(d) {
  const dt = new Date(d);
  return isNaN(dt) ? null : dt.getFullYear() + '-' + dt.getMonth();
}

function groupSumByMonth(arr) {
  return arr.reduce((m, r) => {
    const k = monthKeyOf(r.transaction_date || r.date || r.created_at);
    if (k) m[k] = (m[k] || 0) + (parseFloat(r.amount) || 0);
    return m;
  }, {});
}

function computeFinancialHealthScore() {
  const income = _income.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const expense = _expenses.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const balance = income - expense;
  const savingsTotal = computeSavingsTotals().net;
  const savingsRate = income > 0 ? (balance / income) * 100 : 0;

  const sSavings = clamp((savingsRate / 30) * 100, 0, 100);
  const sExpense = income > 0 ? clamp(100 - Math.max(0, (expense / income) - 0.5) * 150, 0, 100) : 70;

  let sBudget = 75;
  if (_budgets.length) {
    const ratios = _budgets.map(b => {
      const spent = _expenses.filter(e => (e.category || e.cat) === b.category).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      const planned = parseFloat(b.planned || b.amount || 0);
      return planned > 0 ? spent / planned : 0;
    });
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    sBudget = clamp(100 - Math.max(0, avgRatio - 1) * 200, 0, 100);
  }

  let sGoal = 60;
  if (_goals.length) {
    const pcts = _goals.map(g => g.target > 0 ? clamp((parseFloat(g.saved || 0) / parseFloat(g.target)) * 100, 0, 100) : 0);
    sGoal = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  }

  const loanDebt = _loans.filter(l => l.type === 'borrowed').reduce((s, l) => s + Math.max(0, (parseFloat(l.amount) || 0) - (parseFloat(l.amount_paid) || 0)), 0);
  const sDebt = income > 0 ? clamp(100 - (loanDebt / income) * 100, 0, 100) : (loanDebt > 0 ? 40 : 100);

  const incByM = groupSumByMonth(_income), expByM = groupSumByMonth(_expenses), savByM = groupNetSavingsByMonth();
  const now = new Date();
  const curKey = monthKeyOf(now);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = monthKeyOf(prevDate);
  const curInc = incByM[curKey] || 0, curExp = expByM[curKey] || 0, curNet = curInc - curExp;
  const prevSav = savByM[prevKey] || 0, curSav = savByM[curKey] || 0;

  const sCashFlow = curInc > 0 ? clamp(100 - Math.max(0, (curExp - curInc) / curInc) * 100, 0, 100) : (curExp > 0 ? 20 : 70);
  const sIncExpRatio = curInc > 0 ? clamp((1 - (curExp / curInc)) * 150, 0, 100) : 60;
  const sSavGrowth = prevSav > 0 ? clamp(50 + ((curSav - prevSav) / prevSav) * 100, 0, 100) : (curSav > 0 ? 80 : 50);

  const monthCount = Math.max(1, Object.keys(expByM).length);
  const avgMonthlyExpense = expense > 0 ? expense / monthCount : 0;
  const sEmergency = avgMonthlyExpense > 0 ? clamp((savingsTotal / (avgMonthlyExpense * 3)) * 100, 0, 100) : (savingsTotal > 0 ? 60 : 30);

  const monthIncomes = Object.values(incByM);
  let sStability = 70;
  if (monthIncomes.length >= 2) {
    const meanI = monthIncomes.reduce((a, b) => a + b, 0) / monthIncomes.length;
    const variance = monthIncomes.reduce((a, b) => a + Math.pow(b - meanI, 2), 0) / monthIncomes.length;
    const cv = meanI > 0 ? Math.sqrt(variance) / meanI : 1;
    sStability = clamp(100 - cv * 100, 0, 100);
  }

  const weights = { savings: 15, stability: 8, expense: 12, budget: 10, goal: 8, debt: 10, cashflow: 10, incexp: 10, savgrowth: 8, emergency: 9 };
  const subs = { savings: sSavings, stability: sStability, expense: sExpense, budget: sBudget, goal: sGoal, debt: sDebt, cashflow: sCashFlow, incexp: sIncExpRatio, savgrowth: sSavGrowth, emergency: sEmergency };
  let raw = 0, wsum = 0;
  Object.keys(weights).forEach(k => { raw += subs[k] * weights[k]; wsum += weights[k]; });
  const score = Math.round(raw / wsum);

  const grade = score >= 90 ? 'Excellent' : score >= 75 ? 'Very Good' : score >= 60 ? 'Good' : score >= 45 ? 'Fair' : score >= 30 ? 'Poor' : 'Critical';

  const insights = [];
  const curRate = curInc > 0 ? Math.round((curNet / curInc) * 100) : 0;
  if (curInc > 0 && curNet >= 0) insights.push(`You saved ${curRate}% of your income this month.`);
  if (curInc > 0 && curNet < 0) insights.push(`Your expenses exceeded your income by ${Math.abs(curRate)}% this month.`);
  if (sExpense >= 70) insights.push('Your spending is under control.');
  const nearGoal = _goals.find(g => g.target > 0 && (parseFloat(g.saved || 0) / parseFloat(g.target)) >= 0.8 && (parseFloat(g.saved || 0) / parseFloat(g.target)) < 1);
  if (nearGoal) insights.push(`You are close to achieving your ${nearGoal.name} goal.`);
  if (prevSav > 0 && curSav > prevSav) insights.push(`Your savings grew by ${fmt(curSav - prevSav)} compared to last month.`);
  if (!insights.length) insights.push('Add more transactions to unlock personalized insights.');

  const metrics = {
    cashFlow: Math.round(sCashFlow),
    savingsRate: Math.round(sSavings),
    budgetDiscipline: Math.round(sBudget),
    expenseRatio: Math.round(sExpense),
    goalCompletion: Math.round(sGoal)
  };

  return { score, grade, insights: insights.slice(0, 3), metrics };
}

function computePeriodScore(days) {
  const since = Date.now() - days * 86400000;
  const inRange = r => { const d = new Date(r.transaction_date || r.date || r.created_at || 0); return !isNaN(d) && d.getTime() >= since; };
  const pInc = _income.filter(inRange).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const pExp = _expenses.filter(inRange).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  if (pInc <= 0 && pExp <= 0) return null;
  const rate = pInc > 0 ? ((pInc - pExp) / pInc) * 100 : (pExp > 0 ? -100 : 0);
  return Math.round(clamp(50 + rate / 2, 0, 100));
}

function scoreToLetter(score) {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  if (score >= 30) return 'E';
  return 'F';
}

const FHS_METRIC_META = [
  { key: 'cashFlow', label: 'Cash Flow', icon: 'fa-water' },
  { key: 'savingsRate', label: 'Savings Rate', icon: 'fa-piggy-bank' },
  { key: 'budgetDiscipline', label: 'Budget Discipline', icon: 'fa-scale-balanced' },
  { key: 'expenseRatio', label: 'Expense Ratio', icon: 'fa-receipt' },
  { key: 'goalCompletion', label: 'Goal Completion', icon: 'fa-bullseye' }
];

function renderFinancialHealthScore() {
  if (!el('fhs-card')) return;
  const { score, grade, insights, metrics } = computeFinancialHealthScore();

  const scoreEl = el('fhs-score'), gradeEl = el('fhs-grade-label'), fillEl = el('fhs-ring-fill'), letterEl = el('fhs-grade-letter');
  if (scoreEl) scoreEl.textContent = score;
  if (gradeEl) gradeEl.textContent = grade + ' · ' + score + '/100';
  if (letterEl) letterEl.textContent = scoreToLetter(score);

  if (fillEl) {
    const C = 2 * Math.PI * 52;
    fillEl.style.strokeDasharray = String(C);
    fillEl.style.strokeDashoffset = String(C * (1 - score / 100));
    fillEl.classList.remove('grade-good', 'grade-fair', 'grade-poor', 'grade-critical');
    if (grade === 'Good') fillEl.classList.add('grade-good');
    else if (grade === 'Fair') fillEl.classList.add('grade-fair');
    else if (grade === 'Poor') fillEl.classList.add('grade-poor');
    else if (grade === 'Critical') fillEl.classList.add('grade-critical');
  }

  const weekEl = el('fhs-week-score'), monthEl = el('fhs-month-score');
  const weekScore = computePeriodScore(7);
  if (weekEl) weekEl.textContent = weekScore === null ? '—' : weekScore;
  if (monthEl) monthEl.textContent = score;

  const metricsEl = el('fhs-metrics');
  if (metricsEl && metrics) {
    metricsEl.innerHTML = FHS_METRIC_META.map(m => {
      const v = metrics[m.key];
      const color = v >= 70 ? '#10B981' : v >= 45 ? '#F59E0B' : '#EF4444';
      return `<div class="fhs-metric-item">
        <div class="fhs-metric-icon" style="background:${color}1F;color:${color}"><i class="fa-solid ${m.icon}"></i></div>
        <div class="fhs-metric-text"><div class="fhs-metric-label">${m.label}</div><div class="fhs-metric-value">${v}%</div></div>
      </div>`;
    }).join('');
  }

  const insEl = el('fhs-insights');
  if (insEl) {
    insEl.innerHTML = insights.map(t => `<div class="fhs-insight-item"><i class="fa-solid fa-circle-check"></i><span>${esc(t)}</span></div>`).join('');
  }

  const trendEl = el('fhs-trend');
  if (trendEl) {
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem('btech_fhs_history') || '[]'); } catch (e) { hist = []; }
    const last = hist.length ? hist[hist.length - 1].score : null;
    trendEl.classList.remove('up', 'down');
    if (last === null) {
      trendEl.innerHTML = '<i class="fa-solid fa-minus"></i>';
    } else if (score > last) {
      trendEl.classList.add('up');
      trendEl.innerHTML = '<i class="fa-solid fa-arrow-trend-up"></i>';
    } else if (score < last) {
      trendEl.classList.add('down');
      trendEl.innerHTML = '<i class="fa-solid fa-arrow-trend-down"></i>';
    } else {
      trendEl.innerHTML = '<i class="fa-solid fa-minus"></i>';
    }
    const sixHours = 6 * 60 * 60 * 1000;
    const shouldRecord = !hist.length || hist[hist.length - 1].score !== score || (Date.now() - hist[hist.length - 1].ts) > sixHours;
    if (shouldRecord) {
      hist.push({ score, ts: Date.now() });
      if (hist.length > 30) hist = hist.slice(-30);
      try { localStorage.setItem('btech_fhs_history', JSON.stringify(hist)); } catch (e) { }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// SMART INSIGHTS — broader trend-based observations, distinct
// from the Financial Health Score's score-tied insights.
// Each insight is a priority-colored card with a title, a
// message, and a real navigation/action button.
// ═══════════════════════════════════════════════════════════
function siGoTo(page) { showPage(page); }
function siOpenModal(type) { showPage('savings'); setTimeout(() => openModal(type), 50); }

const SI_PRIORITY = {
  success: { color: '#10B981', icon: 'fa-circle-check' },
  warning: { color: '#F59E0B', icon: 'fa-triangle-exclamation' },
  goal: { color: '#8B5CF6', icon: 'fa-bullseye' },
  info: { color: '#3B82F6', icon: 'fa-lightbulb' }
};

function computeSmartInsights() {
  const insights = [];
  const incByM = groupSumByMonth(_income), expByM = groupSumByMonth(_expenses), savByM = groupNetSavingsByMonth();
  const now = new Date();
  const curKey = monthKeyOf(now);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = monthKeyOf(prevDate);
  const curExp = expByM[curKey] || 0, prevExp = expByM[prevKey] || 0;
  const curSav = savByM[curKey] || 0, prevSav = savByM[prevKey] || 0;

  // Category-specific spending spike (most useful, most actionable — first)
  const isCurMonth = r => monthKeyOf(r.transaction_date || r.date || r.created_at) === curKey;
  const isPrevMonth = r => monthKeyOf(r.transaction_date || r.date || r.created_at) === prevKey;
  const catCurr = {}, catPrev = {};
  _expenses.filter(isCurMonth).forEach(e => { const c = e.category || 'Other'; catCurr[c] = (catCurr[c] || 0) + (parseFloat(e.amount) || 0); });
  _expenses.filter(isPrevMonth).forEach(e => { const c = e.category || 'Other'; catPrev[c] = (catPrev[c] || 0) + (parseFloat(e.amount) || 0); });
  let worstCat = null, worstPct = 0;
  Object.keys(catCurr).forEach(c => {
    if (catPrev[c] > 0) {
      const pct = ((catCurr[c] - catPrev[c]) / catPrev[c]) * 100;
      if (pct >= 20 && pct > worstPct) { worstPct = pct; worstCat = c; }
    }
  });
  if (worstCat) {
    insights.push({ type: 'warning', title: 'Spending Alert', message: `${worstCat} expenses increased by ${Math.round(worstPct)}% this month.`, actionLabel: 'Review Expenses', actionOnClick: "siGoTo('transactions')" });
  }

  // Overall spending trend vs last month
  if (prevExp > 0) {
    const diffPct = Math.round(((curExp - prevExp) / prevExp) * 100);
    if (diffPct <= -3) insights.push({ type: 'success', title: 'Great Progress', message: `You spent ${Math.abs(diffPct)}% less than last month.`, actionLabel: 'View Details', actionOnClick: "siGoTo('reports')" });
    else if (diffPct >= 15 && !worstCat) insights.push({ type: 'warning', title: 'Spending Alert', message: `You are spending ${diffPct}% more than last month.`, actionLabel: 'Review Expenses', actionOnClick: "siGoTo('transactions')" });
  }

  // Goal nearly complete
  const openGoals = _goals.filter(g => parseFloat(g.target) > 0 && parseFloat(g.saved || 0) < parseFloat(g.target));
  const nearlyDone = openGoals.filter(g => (parseFloat(g.saved || 0) / parseFloat(g.target)) >= 0.7)
    .sort((a, b) => (parseFloat(a.target) - parseFloat(a.saved || 0)) - (parseFloat(b.target) - parseFloat(b.saved || 0)))[0];
  if (nearlyDone) {
    const remaining = parseFloat(nearlyDone.target) - parseFloat(nearlyDone.saved || 0);
    insights.push({ type: 'goal', title: 'Almost There', message: `Only ${fmt(remaining)} left to complete your "${nearlyDone.name}" goal.`, actionLabel: 'Deposit Now', actionOnClick: "siOpenModal('savings-transfer')" });
  } else if (openGoals.length) {
    // Goal completion projection for the nearest open goal
    const recentKeys = Object.keys(savByM).sort().slice(-3);
    const avgMonthlySaving = recentKeys.length ? recentKeys.reduce((s, k) => s + savByM[k], 0) / recentKeys.length : 0;
    if (avgMonthlySaving > 0) {
      const nearest = openGoals.slice().sort((a, b) =>
        (parseFloat(a.target) - parseFloat(a.saved || 0)) - (parseFloat(b.target) - parseFloat(b.saved || 0))
      )[0];
      const remaining = parseFloat(nearest.target) - parseFloat(nearest.saved || 0);
      const monthsLeft = Math.ceil(remaining / avgMonthlySaving);
      if (monthsLeft > 0 && monthsLeft <= 36) {
        insights.push({ type: 'goal', title: 'On Track', message: `Keep saving ${fmt(avgMonthlySaving)}/month to reach "${nearest.name}" in about ${monthsLeft} month${monthsLeft !== 1 ? 's' : ''}.`, actionLabel: 'View Goal', actionOnClick: "siGoTo('goals')" });
      }
    }
  }

  // Savings growth vs last month
  if (curSav > prevSav && insights.length < 4) {
    insights.push({ type: 'success', title: 'Growing Savings', message: `Your savings increased by ${fmt(curSav - prevSav)} compared to last month.`, actionLabel: 'View Savings', actionOnClick: "siGoTo('savings')" });
  }

  // Consecutive positive cash-flow streak
  const allKeys = Array.from(new Set([...Object.keys(incByM), ...Object.keys(expByM)])).sort();
  let streak = 0;
  for (let i = allKeys.length - 1; i >= 0; i--) {
    const net = (incByM[allKeys[i]] || 0) - (expByM[allKeys[i]] || 0);
    if (net >= 0) streak++; else break;
  }
  if (streak >= 2 && insights.length < 4) {
    insights.push({ type: 'success', title: 'Great Progress', message: `You have maintained positive cash flow for ${streak} consecutive months.`, actionLabel: 'View Report', actionOnClick: "siGoTo('reports')" });
  }

  if (!insights.length) insights.push({ type: 'info', title: 'Getting Started', message: 'Keep logging transactions to unlock personalized insights.', actionLabel: 'Add Transaction', actionOnClick: "siGoTo('transactions')" });
  return insights.slice(0, 4);
}

function renderSmartInsights() {
  const el2 = el('smart-insights-list');
  if (!el2) return;
  const insights = computeSmartInsights();
  el2.innerHTML = insights.map(i => {
    const meta = SI_PRIORITY[i.type] || SI_PRIORITY.info;
    return `<div class="si-card">
      <div class="si-card-icon" style="background:${meta.color}1F;color:${meta.color}"><i class="fa-solid ${meta.icon}"></i></div>
      <div class="si-card-body">
        <div class="si-card-title" style="color:${meta.color}">${esc(i.title)}</div>
        <div class="si-card-message">${esc(i.message)}</div>
        ${i.actionLabel ? `<button class="si-card-action" style="color:${meta.color}" onclick="${i.actionOnClick}">${esc(i.actionLabel)} <i class="fa-solid fa-arrow-right" style="font-size:10px;margin-left:3px"></i></button>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
// NET WORTH
// Wallet Balance + Savings + Goal Savings + Money Lent − Money Borrowed.
// Growth % compares against the closest daily snapshot from ~30 days ago.
// ═══════════════════════════════════════════════════════════
function computeNetWorth() {
  const { balance } = calcTotals();
  const savingsNet = computeSavingsTotals().net;
  const goalsSaved = _goals.reduce((s, g) => s + (parseFloat(g.saved) || 0), 0);
  const lent = _loans.filter(l => l.type === 'lent').reduce((s, l) => s + Math.max(0, (parseFloat(l.amount) || 0) - (parseFloat(l.amount_paid) || 0)), 0);
  const borrowed = _loans.filter(l => l.type === 'borrowed').reduce((s, l) => s + Math.max(0, (parseFloat(l.amount) || 0) - (parseFloat(l.amount_paid) || 0)), 0);
  const netWorth = balance + savingsNet + goalsSaved + lent - borrowed;
  return { netWorth, balance, savingsNet, goalsSaved, lent, borrowed };
}

function recordNetWorthSnapshot(value) {
  try {
    const key = 'btech_networth_history_' + uid();
    let hist = JSON.parse(localStorage.getItem(key) || '[]');
    const todayStr = new Date().toDateString();
    if (!hist.length || hist[hist.length - 1].day !== todayStr) {
      hist.push({ day: todayStr, ts: Date.now(), value });
      if (hist.length > 400) hist = hist.slice(-400);
    } else {
      hist[hist.length - 1].value = value;
    }
    localStorage.setItem(key, JSON.stringify(hist));
  } catch (e) { }
}

function computeNetWorthGrowth(currentValue) {
  try {
    const key = 'btech_networth_history_' + uid();
    const hist = JSON.parse(localStorage.getItem(key) || '[]');
    if (!hist.length) return null;
    const targetTs = Date.now() - 30 * 86400000;
    const ref = hist.find(h => h.ts >= targetTs) || hist[0];
    if (!ref || ref.value === 0) return null;
    return Math.round(((currentValue - ref.value) / Math.abs(ref.value)) * 100);
  } catch (e) { return null; }
}

function renderNetWorth() {
  if (!el('net-worth-card')) return;
  const { netWorth } = computeNetWorth();
  recordNetWorthSnapshot(netWorth);
  const growth = computeNetWorthGrowth(netWorth);
  const valEl = el('net-worth-value'), growthEl = el('net-worth-growth');
  if (valEl) valEl.textContent = fmt(netWorth);
  if (growthEl) {
    if (growth === null) { growthEl.textContent = 'Monthly Growth'; growthEl.className = 'net-worth-growth'; }
    else {
      growthEl.innerHTML = `<i class="fa-solid fa-arrow-trend-${growth >= 0 ? 'up' : 'down'}"></i> ${growth >= 0 ? '+' : ''}${growth}% <span class="net-worth-growth-label">Monthly Growth</span>`;
      growthEl.className = 'net-worth-growth ' + (growth >= 0 ? 'pos' : 'neg');
    }
  }
}

// Percentage change vs last month for the income/expense/savings summary cards
function renderDashboardCardChanges() {
  const incByM = groupSumByMonth(_income), expByM = groupSumByMonth(_expenses), savByM = groupNetSavingsByMonth();
  const curKey = monthKeyOf(new Date());
  const prevD = new Date(); prevD.setMonth(prevD.getMonth() - 1);
  const prevKey = monthKeyOf(prevD);

  const pctChange = (cur, prev) => {
    if (prev > 0) return Math.round(((cur - prev) / prev) * 100);
    if (cur > 0) return null; // "new" — no baseline to compare against
    return 0;
  };

  const renderChange = (id, cur, prev, invertColor) => {
    const elx = el(id);
    if (!elx) return;
    const pct = pctChange(cur, prev);
    if (pct === null) { elx.innerHTML = '<span class="trend-pos">New</span>'; return; }
    const good = invertColor ? pct <= 0 : pct >= 0;
    elx.innerHTML = `<span class="${good ? 'trend-pos' : 'trend-neg'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
  };

  renderChange('d-income-change', incByM[curKey] || 0, incByM[prevKey] || 0, false);
  renderChange('d-expense-change', expByM[curKey] || 0, expByM[prevKey] || 0, true);
  renderChange('d-savings-change', savByM[curKey] || 0, savByM[prevKey] || 0, false);
}

function renderPieChart(income, expense) {
  const canvas = el('pieChart');
  if (pieInst) { pieInst.destroy(); pieInst = null; }
  if (!income && !expense) {
    el('pie-legend').innerHTML = '<span style="color:var(--text-muted)">No data yet</span>';
    return;
  }
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  pieInst = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Income', 'Expenses'],
      datasets: [{ data: [income, expense], backgroundColor: ['#10B981', '#EF4444'], borderWidth: 0, hoverOffset: 8 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '72%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.label + ': KES ' + fmtN(c.raw) } } }
    }
  });
  el('pie-legend').innerHTML =
    `<span style="display:flex;align-items:center;gap:5px"><span class="legend-dot" style="background:#10B981"></span>Income: KES ${fmtN(income)}</span>` +
    `<span style="display:flex;align-items:center;gap:5px"><span class="legend-dot" style="background:#EF4444"></span>Expenses: KES ${fmtN(expense)}</span>`;
}

let apexLineInst = null;
function renderMonthChart() {
  const months = {};
  _income.forEach(r => { const k = (r.transaction_date || r.date || '').slice(0, 7); if (!k) return; if (!months[k]) months[k] = { income: 0, expense: 0 }; months[k].income += (parseFloat(r.amount) || 0); });
  _expenses.forEach(r => { const k = (r.transaction_date || r.date || '').slice(0, 7); if (!k) return; if (!months[k]) months[k] = { income: 0, expense: 0 }; months[k].expense += (parseFloat(r.amount) || 0); });
  const keys = Object.keys(months).sort().slice(-7);
  const labels = keys.map(k => { const [y, m] = k.split('-'); return new Date(+y, +m - 1).toLocaleString('en', { month: 'short', year: '2-digit' }); });
  const incomeData = keys.map(k => months[k].income);
  const expenseData = keys.map(k => months[k].expense);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
  const chartEl = document.getElementById('apexLineChart');
  if (!chartEl) return;
  if (apexLineInst) { apexLineInst.destroy(); apexLineInst = null; }
  const options = {
    series: [
      { name: 'Income', data: incomeData.length ? incomeData : [0] },
      { name: 'Expenses', data: expenseData.length ? expenseData : [0] }
    ],
    chart: {
      type: 'area', height: 220, animations: {
        enabled: true, easing: 'easeinout', speed: 700,
        animateGradually: { enabled: true, delay: 80 },
        dynamicAnimation: { enabled: true, speed: 450 }
      },
      background: 'transparent', toolbar: { show: false }, sparkline: { enabled: false },
      fontFamily: "'DM Sans', sans-serif"
    },
    colors: ['#10B981', '#EF4444'],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1, opacityFrom: 0.55, opacityTo: 0.02,
        stops: [0, 90, 100], type: 'vertical'
      }
    },
    stroke: { curve: 'smooth', width: 2.5 },
    markers: { size: 4, strokeWidth: 0, hover: { size: 7 } },
    xaxis: {
      categories: labels.length ? labels : ['No Data'],
      axisBorder: { show: false }, axisTicks: { show: false },
      labels: { style: { colors: textColor, fontSize: '11px' } }
    },
    yaxis: {
      labels: {
        formatter: v => 'KES ' + (v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v),
        style: { colors: textColor, fontSize: '10px' }
      }
    },
    grid: { borderColor: gridColor, strokeDashArray: 3, xaxis: { lines: { show: false } } },
    tooltip: {
      theme: isDark ? 'dark' : 'light',
      y: { formatter: v => 'KES ' + fmtN(v) }
    },
    legend: { labels: { colors: textColor }, fontSize: '12px' },
    dataLabels: { enabled: false }
  };
  apexLineInst = new ApexCharts(chartEl, options);
  apexLineInst.render();
}

// ── TX ROW ───────────────────────────────────────────────────
function txRow(t, showDel = true) {
  const inc = t.type === 'income';
  const desc = t.description || t.desc || '';
  return `<div class="tx-item">
      <div class="tx-icon ${t.type}" style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;font-size:15px;flex-shrink:0">${inc ? '<i class="fa-solid fa-arrow-trend-up"></i>' : catIconFA(t.category || t.cat)}</div>
      <div class="tx-details">
        <div class="tx-name">${esc(desc)}</div>
        <div class="tx-meta">${esc(t.category || t.cat || '')} · ${fmtDate(t.transaction_date || t.date)}</div>
      </div>
      <div class="tx-amount ${t.type}">${inc ? '+' : '-'}KES ${fmtN(t.amount)}</div>
      ${showDel ? `<button class="tx-del" onclick="delTx('${t.id}','${t.type}')" title="Delete">✕</button>` : ''}
    </div>`;
}

async function delTx(id, type) {
  if (!confirm('Delete this transaction?')) return;
  const ok = type === 'income' ? await deleteIncome(id) : await deleteExpense(id);
  if (ok) {
    await refreshAllData();
    showToast('Transaction deleted.', 'success');
    renderPage(_currentPage || 'dashboard');
  }
}

// ── TRANSACTIONS PAGE ────────────────────────────────────────
function renderTx() {
  const type = el('f-type').value;
  const month = el('f-month').value;
  const search = (el('f-search').value || '').toLowerCase();
  let all = [
    ..._income.map(r => ({ ...r, type: 'income' })),
    ..._expenses.map(r => ({ ...r, type: 'expense' }))
  ];
  const allMonths = [...new Set(all.map(t => (t.transaction_date || t.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  const mSel = el('f-month');
  const cur = mSel.value;
  mSel.innerHTML = '<option value="">All months</option>' + allMonths.map(m => `<option value="${m}"${m === cur ? ' selected' : ''}>${fmtMonth(m)}</option>`).join('');
  if (type) all = all.filter(t => t.type === type);
  if (month) all = all.filter(t => (t.transaction_date || t.date || '').startsWith(month));
  if (search) all = all.filter(t => ((t.description || t.desc || '') + (t.category || t.cat || '')).toLowerCase().includes(search));
  all.sort((a, b) => new Date(b.transaction_date || b.date) - new Date(a.transaction_date || a.date));
  el('all-tx-list').innerHTML = all.length
    ? all.map(t => txRow(t)).join('')
    : '<div class="empty-state"><div class="empty-state-icon">📭</div>No transactions found.</div>';
}

// ── GOALS ────────────────────────────────────────────────────
function renderGoals() {
  const listEl = el('goals-list');
  if (!listEl) return;
  if (!_goals.length) {
    listEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-bullseye" style="font-size:32px;color:#F59E0B;opacity:.4;display:block;margin-bottom:10px"></i>No goals yet. Add your first goal!</div>';
    return;
  }
  listEl.innerHTML = _goals.map(g => {
    const pct = g.target > 0 ? Math.min(100, Math.round((+g.saved / +g.target) * 100)) : 0;
    const done = pct >= 100;
    const col = done ? '#10B981' : pct >= 75 ? '#6C63FF' : pct >= 40 ? '#F59E0B' : '#EF4444';
    const rem = Math.max(0, +g.target - +g.saved);
    return `<div id="goal-item-${g.id}" style="border:1px solid ${done ? 'rgba(16,185,129,.28)' : 'var(--border)'};border-radius:14px;padding:16px;margin-bottom:12px;background:var(--surface);transition:border-color .2s,box-shadow .2s" onmouseover="this.style.boxShadow='0 4px 20px rgba(108,99,255,.1)'" onmouseout="this.style.boxShadow=''">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:36px;height:36px;border-radius:10px;background:${done ? 'rgba(16,185,129,.12)' : 'rgba(245,158,11,.1)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="fa-solid ${done ? 'fa-trophy' : 'fa-bullseye'}" style="color:${done ? '#10B981' : '#F59E0B'};font-size:15px"></i>
            </div>
            <div>
              <div style="font-weight:700;font-size:14.5px;color:var(--text)">${esc(g.name)}</div>
              ${g.target_date ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px"><i class="fa-regular fa-calendar" style="margin-right:4px;color:#6C63FF"></i>${fmtDate(g.target_date)}</div>` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            <span style="font-size:14px;font-weight:800;color:${col};background:${col}18;padding:3px 10px;border-radius:20px;line-height:1.4">${pct}%</span>
            <button onclick="delGoalUI('${g.id}')" style="background:rgba(239,68,68,.08);border:none;cursor:pointer;width:28px;height:28px;border-radius:8px;color:#EF4444;font-size:11px;display:flex;align-items:center;justify-content:center;transition:background .15s" title="Delete goal" onmouseover="this.style.background='rgba(239,68,68,.18)'" onmouseout="this.style.background='rgba(239,68,68,.08)'"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </div>
        <div style="background:var(--surface-2);border-radius:100px;height:9px;overflow:hidden;margin-bottom:12px">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,${col}dd,${col});border-radius:100px;transition:width .7s cubic-bezier(.34,1,.64,1);box-shadow:0 0 8px ${col}55"></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <div style="flex:1;min-width:70px;background:rgba(16,185,129,.07);border-radius:10px;padding:8px;text-align:center;border:1px solid rgba(16,185,129,.12)">
            <div style="font-size:10px;color:#10B981;font-weight:600;margin-bottom:2px;text-transform:uppercase;letter-spacing:.04em">Saved</div>
            <div style="font-size:13px;font-weight:800;color:#10B981">KES ${fmtN(g.saved)}</div>
          </div>
          <div style="flex:1;min-width:70px;background:rgba(245,158,11,.07);border-radius:10px;padding:8px;text-align:center;border:1px solid rgba(245,158,11,.12)">
            <div style="font-size:10px;color:#F59E0B;font-weight:600;margin-bottom:2px;text-transform:uppercase;letter-spacing:.04em">Left</div>
            <div style="font-size:13px;font-weight:800;color:#F59E0B">KES ${fmtN(rem)}</div>
          </div>
          <div style="flex:1;min-width:70px;background:rgba(108,99,255,.07);border-radius:10px;padding:8px;text-align:center;border:1px solid rgba(108,99,255,.12)">
            <div style="font-size:10px;color:#6C63FF;font-weight:600;margin-bottom:2px;text-transform:uppercase;letter-spacing:.04em">Target</div>
            <div style="font-size:13px;font-weight:800;color:#6C63FF">KES ${fmtN(g.target)}</div>
          </div>
        </div>
        ${!done ? `<div style="display:flex;gap:8px;align-items:center">
          <div style="flex:1;position:relative">
            <i class="fa-solid fa-coins" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-subtle);font-size:12px;pointer-events:none"></i>
            <input type="number" id="contrib-${g.id}" placeholder="Add amount (KES)…" min="1"
              style="width:100%;padding:10px 12px 10px 32px;border:1.5px solid var(--border-solid);border-radius:10px;background:var(--surface-2);color:var(--text);font-size:13px;outline:none;transition:border-color .2s,box-shadow .2s;font-family:inherit"
              onfocus="this.style.borderColor='#6C63FF';this.style.boxShadow='0 0 0 3px rgba(108,99,255,.12)'"
              onblur="this.style.borderColor='';this.style.boxShadow=''"
              onkeydown="if(event.key==='Enter')contributeGoal('${g.id}',${+g.saved},${+g.target})">
          </div>
          <button onclick="contributeGoal('${g.id}',${+g.saved},${+g.target})" id="contrib-btn-${g.id}"
            style="padding:10px 14px;background:linear-gradient(135deg,#6C63FF,#4F46E5);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;box-shadow:0 3px 12px rgba(108,99,255,.3);transition:all .2s;font-family:inherit"
            onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 18px rgba(108,99,255,.45)'"
            onmouseout="this.style.transform='';this.style.boxShadow='0 3px 12px rgba(108,99,255,.3)'">
            <i class="fa-solid fa-plus" style="margin-right:5px"></i>Deposit
          </button>
        </div>` : `<div style="text-align:center;padding:10px 14px;background:rgba(16,185,129,.07);border-radius:10px;border:1px solid rgba(16,185,129,.18)">
          <i class="fa-solid fa-trophy" style="color:#10B981;font-size:16px;margin-right:7px"></i>
          <span style="font-weight:700;color:#10B981;font-size:13px">Goal Achieved! Congratulations 🎉</span>
        </div>`}
      </div>`;
  }).join('');
}

async function contributeGoal(id, currentSaved, target) {
  const input = el('contrib-' + id);
  if (!input) return;
  const amount = parseFloat(input.value);
  if (!amount || amount <= 0) { showToast('Enter a valid amount to deposit.', 'warning'); input.focus(); return; }
  const newSaved = parseFloat(currentSaved) + amount;
  const pct = target > 0 ? Math.min(100, Math.round((newSaved / target) * 100)) : 0;

  // Optimistic: update local array and re-render immediately
  const g = _goals.find(r => r.id === id);
  if (g) g.saved = newSaved;
  input.value = '';
  renderGoals();
  showToast(pct >= 100 ? '🏆 Goal achieved! You hit your target!' : `KES ${fmtN(amount)} added — ${pct}% there!`, 'success');

  // Background DB write
  const ok = await updateGoalSaved(id, newSaved);
  if (!ok) {
    // Revert on failure
    if (g) g.saved = currentSaved;
    renderGoals();
    showToast('Save failed — please try again.', 'danger');
  } else {
    // Silent background sync
    const safe = async (fn) => { try { return await fn(); } catch (e) { return []; } };
    const [gls] = await Promise.all([safe(fetchGoals)]);
    if (Array.isArray(gls)) _goals = gls;
    renderGoals();
  }
}

async function addGoalUI() {
  const name = el('g-name').value.trim();
  const target = parseFloat(el('g-target').value);
  const saved = parseFloat(el('g-saved').value) || 0;
  const date = el('g-date').value;
  if (!name || !target || target <= 0) return showToast('Please fill in goal name and target amount.', 'danger');
  setBtn('btn-add-goal', true, 'Saving…');
  const ok = await addGoal({ name, target, saved, target_date: date || null });
  setBtn('btn-add-goal', false, 'Add Goal');
  if (ok) { closeModal();['g-name', 'g-target', 'g-saved', 'g-date'].forEach(f => { const el2 = el(f); if (el2) el2.value = ''; }); await refreshAllData(); renderGoals(); showToast('Goal added!', 'success'); }
}

async function delGoalUI(id) {
  if (!confirm('Delete this goal?')) return;
  const ok = await deleteGoal(id);
  if (ok) { await refreshAllData(); renderGoals(); showToast('Goal deleted.', 'success'); }
}

// ── BUDGET ───────────────────────────────────────────────────

function budgetCatIcon(cat) {
  const map = {
    Food: ['fa-utensils', '#F97316'], Transport: ['fa-car', '#3B82F6'],
    Rent: ['fa-house', '#8B5CF6'], Bills: ['fa-bolt', '#EAB308'],
    Shopping: ['fa-bag-shopping', '#EC4899'], Health: ['fa-heart-pulse', '#EF4444'],
    Entertainment: ['fa-film', '#A855F7'], Business: ['fa-briefcase', '#0EA5E9'],
    Data: ['fa-mobile-screen', '#14B8A6'], Education: ['fa-graduation-cap', '#6366F1'],
    Savings: ['fa-piggy-bank', '#8B5CF6'], Salary: ['fa-money-bill-wave', '#10B981'],
    Freelance: ['fa-laptop-code', '#6C63FF'], Investment: ['fa-chart-line', '#0EA5E9']
  };
  const [icon, color] = map[cat] || ['fa-chart-pie', '#6C63FF'];
  return `<i class="fa-solid ${icon}" style="color:${color};font-size:13px"></i>`;
}
function renderBudget() {
  const now = new Date();
  const cm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const mTxs = _expenses.filter(t => (t.transaction_date || t.date || '').startsWith(cm));
  function rows(items) {
    if (!items.length) return '<div class="empty-state">No items. Click "+ Item" to add.</div>';
    return items.map(b => {
      const spent = mTxs.filter(t => (t.category || t.cat) === b.category).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      const pct = b.planned > 0 ? Math.min(100, Math.round((spent / +b.planned) * 100)) : 0;
      const over = pct >= 100;
      const col = over ? '#EF4444' : pct >= 80 ? '#F59E0B' : '#10B981';
      const rem = Math.max(0, +b.planned - spent);
      return `<div id="bud-item-${b.id}" style="border:1px solid ${over ? 'rgba(239,68,68,.25)' : 'var(--border)'};border-radius:14px;padding:14px 16px;margin-bottom:10px;background:var(--surface);transition:border-color .2s">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:32px;height:32px;border-radius:8px;background:${col}18;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${budgetCatIcon(b.category)}
              </div>
              <div>
                <div style="font-size:14px;font-weight:700;color:var(--text)">${esc(b.category)}</div>
                <div style="font-size:11px;color:var(--text-muted)">${b.period === 'weekly' ? 'Weekly' : 'Monthly'} budget</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:13px;font-weight:800;color:${col};background:${col}15;padding:2px 9px;border-radius:20px">${pct}%</span>
              <button onclick="delBudgetUI('${b.id}')" style="background:rgba(239,68,68,.08);border:none;cursor:pointer;width:28px;height:28px;border-radius:8px;color:#EF4444;font-size:11px;display:flex;align-items:center;justify-content:center" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
            </div>
          </div>
          <div style="background:var(--surface-2);border-radius:100px;height:8px;overflow:hidden;margin-bottom:10px">
            <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,${col}dd,${col});border-radius:100px;transition:width .6s cubic-bezier(.34,1,.64,1)"></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            <div style="flex:1;min-width:60px;background:rgba(239,68,68,.07);border-radius:8px;padding:6px 10px;text-align:center;border:1px solid rgba(239,68,68,.12)">
              <div style="font-size:10px;color:#EF4444;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Spent</div>
              <div style="font-size:12px;font-weight:800;color:#EF4444;font-family:'Inter',sans-serif;font-variant-numeric:tabular-nums">KES ${fmtN(spent)}</div>
            </div>
            <div style="flex:1;min-width:60px;background:rgba(245,158,11,.07);border-radius:8px;padding:6px 10px;text-align:center;border:1px solid rgba(245,158,11,.12)">
              <div style="font-size:10px;color:#F59E0B;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Left</div>
              <div style="font-size:12px;font-weight:800;color:#F59E0B;font-family:'Inter',sans-serif;font-variant-numeric:tabular-nums">KES ${fmtN(rem)}</div>
            </div>
            <div style="flex:1;min-width:60px;background:rgba(108,99,255,.07);border-radius:8px;padding:6px 10px;text-align:center;border:1px solid rgba(108,99,255,.12)">
              <div style="font-size:10px;color:#6C63FF;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Budget</div>
              <div style="font-size:12px;font-weight:800;color:#6C63FF;font-family:'Inter',sans-serif;font-variant-numeric:tabular-nums">KES ${fmtN(b.planned)}</div>
            </div>
          </div>
          ${!over ? `<div style="display:flex;gap:8px;align-items:center">
            <div style="flex:1;position:relative">
              <i class="fa-solid fa-receipt" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-subtle);font-size:12px;pointer-events:none"></i>
              <input type="number" id="budget-deposit-${b.id}" placeholder="Record spending (KES)…" min="1"
                style="width:100%;padding:9px 12px 9px 30px;border:1.5px solid var(--border-solid);border-radius:10px;background:var(--surface-2);color:var(--text);font-size:13px;outline:none;transition:border-color .2s;font-family:inherit;-webkit-text-fill-color:var(--text)"
                onfocus="this.style.borderColor='#6C63FF';this.style.boxShadow='0 0 0 3px rgba(108,99,255,.12)'"
                onblur="this.style.borderColor='';this.style.boxShadow=''"
                onkeydown="if(event.key==='Enter')depositBudgetUI('${b.id}')">
            </div>
            <button onclick="depositBudgetUI('${b.id}')" id="bud-btn-${b.id}"
              style="padding:9px 14px;background:linear-gradient(135deg,#EF4444,#DC2626);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;box-shadow:0 3px 12px rgba(239,68,68,.25);transition:all .2s;font-family:inherit"
              onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 18px rgba(239,68,68,.4)'"
              onmouseout="this.style.transform='';this.style.boxShadow='0 3px 12px rgba(239,68,68,.25)'">
              <i class="fa-solid fa-minus" style="margin-right:5px"></i>Record Spend
            </button>
          </div>` : `<div style="text-align:center;padding:8px 14px;background:rgba(239,68,68,.07);border-radius:10px;border:1px solid rgba(239,68,68,.18)">
            <i class="fa-solid fa-triangle-exclamation" style="color:#EF4444;margin-right:6px"></i>
            <span style="font-weight:700;color:#EF4444;font-size:13px">Budget exceeded! Review your spending.</span>
          </div>`}
        </div>`;
    }).join('');
  }
  el('budget-monthly').innerHTML = rows(_budgets.filter(b => b.period === 'monthly'));
  el('budget-weekly').innerHTML = rows(_budgets.filter(b => b.period === 'weekly'));
}

async function depositBudgetUI(id) {
  const input = el('budget-deposit-' + id);
  if (!input) return;
  const amount = parseFloat(input.value);
  if (!amount || amount <= 0) { showToast('Enter a valid spend amount.', 'warning'); input.focus(); return; }
  const btn = el('bud-btn-' + id);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:5px"></i>Saving…'; }

  // Optimistic: add to local expenses immediately
  const budget = _budgets.find(b => b.id === id);
  const tempId = '_tmp_b_' + Date.now();
  const tempRow = {
    id: tempId, description: 'Budget spend — ' + (budget?.category || ''),
    amount, category: budget?.category || '', transaction_date: new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString()
  };
  _expenses.unshift(tempRow);
  input.value = '';
  renderBudget();
  showToast('KES ' + fmtN(amount) + ' recorded as ' + (budget?.category || 'spend') + '!', 'success');

  // Background DB write
  const ok = await updateBudgetSpent(id, amount);
  _expenses = _expenses.filter(r => r.id !== tempId);
  if (ok) {
    const safe = async (fn) => { try { return await fn(); } catch (e) { return []; } };
    const [exp] = await Promise.all([safe(fetchExpenses)]);
    if (Array.isArray(exp)) _expenses = exp;
    renderBudget();
    renderDashboard();
  } else {
    showToast('Save failed — please try again.', 'danger');
    renderBudget();
  }
}

async function addBudgetUI() {
  const category = el('b-cat').value;
  const planned = parseFloat(el('b-amt').value);
  const period = el('b-period').value;
  if (!planned || planned <= 0) return showToast('Please enter a valid amount.', 'danger');
  setBtn('btn-add-budget', true, 'Saving…');
  const ok = await addBudget({ category, planned, period });
  setBtn('btn-add-budget', false, 'Add Item');
  if (ok) { closeModal();['b-amt'].forEach(f => { const el2 = el(f); if (el2) el2.value = ''; }); await refreshAllData(); renderBudget(); showToast('Budget item added!', 'success'); }
}

async function delBudgetUI(id) {
  const ok = await deleteBudget(id);
  if (ok) { await refreshAllData(); renderBudget(); showToast('Budget item deleted.', 'success'); }
}

// ── SHOPPING ─────────────────────────────────────────────────
function renderShop() {
  if (!_shopping.length) {
    el('shop-list').innerHTML = '<div class="empty-state"><div class="empty-state-icon">🛒</div>Shopping list is empty. Add items to get started!</div>';
    el('shop-total').innerHTML = '';
    return;
  }
  const total = _shopping.reduce((s, i) => s + (+i.cost || 0), 0);
  const doneItems = _shopping.filter(i => i.done);
  const doneTotal = doneItems.reduce((s, i) => s + (+i.cost || 0), 0);
  const pct = total > 0 ? Math.round((doneTotal / total) * 100) : 0;
  el('shop-list').innerHTML = _shopping.map(s => `<div class="shop-item" style="padding:12px 16px;${s.done ? 'opacity:.65' : ''}">
      <input type="checkbox" class="shop-check" ${s.done ? 'checked' : ''} onchange="toggleShopUI('${s.id}',this.checked)" style="flex-shrink:0">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
          <span style="font-size:13.5px;font-weight:600;${s.done ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${esc(s.name)}</span>
          ${s.category ? `<span style="padding:2px 7px;background:var(--surface-2);border:1px solid var(--border-solid);border-radius:99px;font-size:10.5px;color:var(--text-muted)">${esc(s.category)}</span>` : ''}
          ${s.done ? '<span style="padding:2px 7px;background:rgba(16,185,129,.1);color:#10B981;border-radius:99px;font-size:10.5px;font-weight:700">✓ Purchased</span>' : ''}
        </div>
        ${(s.qty || s.description) ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${s.qty ? esc(s.qty) : ''}${s.qty && s.description ? ' · ' : ''}${s.description ? esc(s.description) : ''}</div>` : ''}
      </div>
      <span style="font-size:13px;font-family:'Inter',sans-serif;font-variant-numeric:tabular-nums;font-weight:700;flex-shrink:0;color:${s.done ? 'var(--success)' : 'var(--text)'}">KES ${fmtN(s.cost)}</span>
      <button onclick="delShopUI('${s.id}')" class="tx-del" style="opacity:1;margin-left:6px">✕</button>
    </div>`).join('');
  el('shop-total').innerHTML = `
    <div style="padding:12px 16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:13px">
        <span style="color:var(--text-muted)">${doneItems.length} of ${_shopping.length} items purchased</span>
        <span style="font-weight:700;color:var(--primary)">${pct}%</span>
      </div>
      <div style="background:var(--surface-2);border-radius:99px;height:7px;overflow:hidden;margin-bottom:10px">
        <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#10B981,#34D399);border-radius:99px;transition:width .6s ease"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px">
        <span>Purchased: <strong style="color:var(--success);font-family:'Inter',sans-serif;font-variant-numeric:tabular-nums">KES ${fmtN(doneTotal)}</strong></span>
        <span>Total: <strong style="color:var(--text);font-family:'Inter',sans-serif;font-variant-numeric:tabular-nums">KES ${fmtN(total)}</strong></span>
      </div>
    </div>`;
}

async function addShopUI() {
  const name = el('s-name').value.trim();
  const qty = el('s-qty').value.trim();
  const cost = parseFloat(el('s-cost').value) || 0;
  const category = el('s-category') ? el('s-category').value : 'Other';
  const desc = el('s-desc') ? el('s-desc').value.trim() : '';
  if (!name) return showToast('Please enter an item name.', 'danger');
  setBtn('btn-add-shop', true, 'Saving…');
  const ok = await addShoppingItem({ name, qty, cost, category, description: desc });
  setBtn('btn-add-shop', false, 'Add Item');
  if (ok) { closeModal();['s-name', 's-qty', 's-cost', 's-desc'].forEach(f => { const el2 = el(f); if (el2) el2.value = ''; }); await refreshAllData(); renderShop(); showToast('Item added!', 'success'); }
}

async function toggleShopUI(id, done) {
  await toggleShoppingItem(id, done);
  await refreshAllData(); renderShop();
}

async function delShopUI(id) {
  const ok = await deleteShoppingItem(id);
  if (ok) { await refreshAllData(); renderShop(); showToast('Item removed.', 'success'); }
}

// ── SAVINGS WALLET ──────────────────────────────────────────────────
const SAVINGS_TYPE_META = {
  deposit: { icon: 'fa-arrow-down', color: '#10B981', label: 'Deposit' },
  withdrawal: { icon: 'fa-arrow-up', color: '#EF4444', label: 'Withdrawal' },
  transfer: { icon: 'fa-right-left', color: '#8B5CF6', label: 'Transfer' },
  adjustment: { icon: 'fa-pen', color: '#F59E0B', label: 'Adjustment' }
};

function renderSavings() {
  const { totalDeposits, totalWithdrawn, net } = computeSavingsTotals();

  const totalEl = el('sv-total'), countEl = el('sv-count');
  if (totalEl) totalEl.textContent = fmt(net);
  if (countEl) countEl.textContent = _savings.length + ' entr' + (_savings.length !== 1 ? 'ies' : 'y');

  const depEl = el('sv-total-deposits'), wdEl = el('sv-total-withdrawn'), avgEl = el('sv-avg-monthly');
  if (depEl) depEl.textContent = fmt(totalDeposits);
  if (wdEl) wdEl.textContent = fmt(totalWithdrawn);

  const byMonth = groupNetSavingsByMonth();
  const monthKeys = Object.keys(byMonth).sort();
  const avgMonthly = monthKeys.length ? (net / monthKeys.length) : 0;
  if (avgEl) avgEl.textContent = fmt(avgMonthly);

  // Savings goal progress (average across goals with a target)
  const goalProgEl = el('sv-goal-progress');
  if (goalProgEl) {
    const withTarget = _goals.filter(g => parseFloat(g.target) > 0);
    if (withTarget.length) {
      const avgPct = Math.round(withTarget.reduce((s, g) => s + clamp((parseFloat(g.saved || 0) / parseFloat(g.target)) * 100, 0, 100), 0) / withTarget.length);
      goalProgEl.textContent = avgPct + '%';
    } else {
      goalProgEl.textContent = '—';
    }
  }

  // Monthly savings trend (last 6 months, oldest first)
  const trendEl = el('sv-trend-list');
  if (trendEl) {
    const last6 = monthKeys.slice(-6);
    if (!last6.length) {
      trendEl.innerHTML = '<div class="empty-state" style="padding:16px"><span style="color:var(--text-muted);font-size:12.5px">No monthly data yet.</span></div>';
    } else {
      const maxAbs = Math.max(1, ...last6.map(k => Math.abs(byMonth[k])));
      trendEl.innerHTML = last6.map(k => {
        const v = byMonth[k];
        const pct = clamp((Math.abs(v) / maxAbs) * 100, 2, 100);
        const positive = v >= 0;
        return `<div class="sv-trend-row">
          <span class="sv-trend-month">${esc(fmtMonth(k))}</span>
          <div class="sv-trend-bar-track"><div class="sv-trend-bar-fill ${positive ? 'pos' : 'neg'}" style="width:${pct}%"></div></div>
          <span class="sv-trend-value ${positive ? 'pos' : 'neg'}">${positive ? '+' : ''}${fmt(v)}</span>
        </div>`;
      }).join('');
    }
  }

  // Transaction history with running balance, most recent first
  const listEl = el('savings-list');
  if (listEl) {
    if (!_savings.length) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏦</div>No savings entries yet. Make your first deposit!</div>';
    } else {
      const chronological = _savings.slice().sort((a, b) =>
        new Date(a.transaction_date || a.date || a.created_at || 0) - new Date(b.transaction_date || b.date || b.created_at || 0)
      );
      let running = 0;
      const withBalance = chronological.map(s => { running += signedSavingsAmount(s); return { ...s, _balanceAfter: running }; });
      const rows = withBalance.slice().reverse();
      listEl.innerHTML = rows.map(s => {
        const meta = SAVINGS_TYPE_META[s.type || 'deposit'];
        const signed = signedSavingsAmount(s);
        return `<div class="tx-item">
          <div class="tx-icon income" style="background:${meta.color}1F;color:${meta.color};display:flex;align-items:center;justify-content:center;font-size:15px"><i class="fa-solid ${meta.icon}"></i></div>
          <div class="tx-details">
            <div class="tx-name">${esc(s.description)}</div>
            <div class="tx-meta">${meta.label} · ${esc(s.category || 'General')} · ${fmtDate(s.transaction_date || s.date)}${s.note ? ' · ' + esc(s.note) : ''}</div>
            <div class="tx-meta" style="opacity:.75">Balance after: ${fmt(s._balanceAfter)} · Completed</div>
          </div>
          <div class="tx-amount income" style="color:${meta.color}">${signed < 0 ? '-' : '+'}KES ${fmtN(Math.abs(signed))}</div>
          <button class="tx-del" onclick="editSavingsUI('${s.id}')" title="Edit" style="margin-right:4px"><i class="fa-solid fa-pen" style="font-size:12px"></i></button>
          <button class="tx-del" onclick="delSavingsUI('${s.id}')" title="Delete">✕</button>
        </div>`;
      }).join('');
    }
  }

  populateSavingsGoalSelect();
}

function populateSavingsGoalSelect() {
  const sel = el('sv-transfer-goal');
  if (!sel) return;
  if (!_goals.length) {
    sel.innerHTML = '<option value="">No goals yet — create one first</option>';
    return;
  }
  sel.innerHTML = _goals.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
}

// ── Deposit (Wallet → Savings) ──
async function depositToSavingsUI() {
  const desc = el('sv-desc').value.trim();
  const amt = parseFloat(el('sv-amt').value);
  const cat = el('sv-cat').value;
  const date = el('sv-date').value || new Date().toISOString().split('T')[0];
  const note = el('sv-note') ? el('sv-note').value.trim() : '';
  if (!desc || !amt || amt <= 0) return showToast('Please fill in description and a valid amount.', 'danger');
  setBtn('btn-add-savings', true, 'Saving…');
  const ok = await addSavings({ description: desc, amount: amt, category: cat, transaction_date: date, type: 'deposit', note });
  if (ok) {
    await addExpense({ description: 'Transfer to Savings — ' + desc, amount: amt, category: 'Savings Transfer', transaction_date: date });
  }
  setBtn('btn-add-savings', false, 'Deposit');
  if (ok) {
    closeModal();['sv-desc', 'sv-amt', 'sv-date', 'sv-note'].forEach(f => { const e2 = el(f); if (e2) e2.value = ''; });
    if (el('sv-cat')) el('sv-cat').selectedIndex = 0;
    await refreshAllData(); renderSavings(); renderDashboard();
    notifySavingsIfEnabled('Deposited into savings!');
  }
}
// Backward-compatible alias (older markup/onclick references)
async function addSavingsUI() { return depositToSavingsUI(); }

// ── Withdraw (Savings → Wallet) ──
async function withdrawFromSavingsUI() {
  const desc = el('sw-desc').value.trim();
  const amt = parseFloat(el('sw-amt').value);
  const date = el('sw-date').value || new Date().toISOString().split('T')[0];
  const note = el('sw-note') ? el('sw-note').value.trim() : '';
  if (!desc || !amt || amt <= 0) return showToast('Please fill in description and a valid amount.', 'danger');
  const { net } = computeSavingsTotals();
  if (amt > net) return showToast(`You only have ${fmt(net)} available in savings.`, 'danger');
  setBtn('btn-withdraw-savings', true, 'Withdrawing…');
  const ok = await addSavings({ description: desc, amount: amt, category: 'General', transaction_date: date, type: 'withdrawal', note });
  if (ok) {
    await addIncome({ description: 'Withdrawal from Savings — ' + desc, amount: amt, category: 'Savings Withdrawal', transaction_date: date });
  }
  setBtn('btn-withdraw-savings', false, 'Withdraw');
  if (ok) {
    closeModal();['sw-desc', 'sw-amt', 'sw-date', 'sw-note'].forEach(f => { const e2 = el(f); if (e2) e2.value = ''; });
    await refreshAllData(); renderSavings(); renderDashboard();
    notifySavingsIfEnabled('Withdrawn from savings!');
  }
}

// ── Transfer (Savings → a Goal) ──
async function transferSavingsToGoalUI() {
  const goalId = el('sv-transfer-goal').value;
  const amt = parseFloat(el('sv-transfer-amt').value);
  const date = new Date().toISOString().split('T')[0];
  if (!goalId) return showToast('Choose a goal to transfer into.', 'danger');
  if (!amt || amt <= 0) return showToast('Enter a valid amount.', 'danger');
  const { net } = computeSavingsTotals();
  if (amt > net) return showToast(`You only have ${fmt(net)} available in savings.`, 'danger');
  const goal = _goals.find(g => String(g.id) === String(goalId));
  if (!goal) return showToast('Goal not found.', 'danger');
  setBtn('btn-transfer-savings', true, 'Transferring…');
  const ok = await addSavings({ description: 'Transfer to goal: ' + goal.name, amount: amt, category: 'Goal Transfer', transaction_date: date, type: 'transfer' });
  if (ok) {
    await updateGoalSaved(goal.id, (parseFloat(goal.saved) || 0) + amt);
  }
  setBtn('btn-transfer-savings', false, 'Transfer');
  if (ok) {
    closeModal();['sv-transfer-amt'].forEach(f => { const e2 = el(f); if (e2) e2.value = ''; });
    await refreshAllData(); renderSavings(); renderDashboard();
    notifyGoalIfEnabled('Transferred to goal!');
  }
}

// ── Edit (rename / adjust an existing entry) ──
function editSavingsUI(id) {
  const s = _savings.find(r => String(r.id) === String(id));
  if (!s) return;
  el('sve-id').value = s.id;
  el('sve-desc').value = s.description || '';
  el('sve-amt').value = s.amount || '';
  el('sve-cat').value = s.category || 'General';
  el('sve-date').value = (s.transaction_date || s.date || '').split('T')[0];
  el('sve-note').value = s.note || '';
  openModal('savings-edit');
}

async function saveSavingsEditUI() {
  const id = el('sve-id').value;
  const desc = el('sve-desc').value.trim();
  const amt = parseFloat(el('sve-amt').value);
  const cat = el('sve-cat').value;
  const date = el('sve-date').value;
  const note = el('sve-note').value.trim();
  if (!desc || !amt || amt <= 0 || !date) return showToast('Please fill in all fields with a valid amount.', 'danger');
  setBtn('btn-save-savings-edit', true, 'Saving…');
  const ok = await updateSavingsEntry(id, { description: desc, amount: amt, category: cat, transaction_date: date, note });
  setBtn('btn-save-savings-edit', false, 'Save Changes');
  if (ok) { closeModal(); await refreshAllData(); renderSavings(); renderDashboard(); showToast('Savings entry updated.', 'success'); }
}

async function delSavingsUI(id) {
  if (!confirm('Delete this savings entry? This does not reverse any linked wallet transaction.')) return;
  const ok = await deleteSavings(id);
  if (ok) { await refreshAllData(); renderSavings(); renderDashboard(); showToast('Savings entry deleted.', 'success'); }
}


// ── REPORTS ──────────────────────────────────────────────────
function renderReports() {
  const all = [
    ..._income.map(r => ({ ...r, type: 'income' })),
    ..._expenses.map(r => ({ ...r, type: 'expense' }))
  ];
  if (!all.length) { el('reports-list').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div>No data yet.</div>'; return; }
  const grouped = {};
  all.forEach(t => { const k = (t.transaction_date || t.date || '').slice(0, 7); if (!k) return; if (!grouped[k]) grouped[k] = []; grouped[k].push(t); });
  el('reports-list').innerHTML = Object.keys(grouped).sort().reverse().map(k => {
    const items = grouped[k].sort((a, b) => new Date(b.transaction_date || b.date) - new Date(a.transaction_date || a.date));
    const inc = items.filter(t => t.type === 'income').reduce((s, t) => s + +t.amount, 0);
    const exp = items.filter(t => t.type === 'expense').reduce((s, t) => s + +t.amount, 0);
    return `<div>
        <div class="report-month-header">
          <span>${fmtMonth(k)}</span>
          <span>
            <span style="color:var(--success)">+KES ${fmtN(inc)}</span> &nbsp;
            <span style="color:var(--danger)">-KES ${fmtN(exp)}</span> &nbsp;
            <span style="color:var(--text-muted)">Net: KES ${fmtN(inc - exp)}</span>
          </span>
        </div>
        ${items.map(t => txRow(t, true)).join('')}
      </div>`;
  }).join('');
}

// ── ADVICE ───────────────────────────────────────────────────
function renderAdvice() {
  const { income, expense, balance } = calcTotals();
  const adv = [];
  const rate = income > 0 ? (balance / income) * 100 : 0;
  if (rate >= 30) adv.push({ icon: '🌟', title: 'Excellent savings rate!', text: `You are saving ${Math.round(rate)}% of your income. This puts you firmly on the path to financial freedom.` });
  else if (rate >= 15) adv.push({ icon: '👍', title: 'Good savings momentum', text: `Your savings rate is ${Math.round(rate)}%. Aim for 20-30% by trimming non-essential expenses.` });
  else if (income > 0) adv.push({ icon: '⚠️', title: 'Low savings rate', text: `You are saving only ${Math.round(rate)}% of your income. Cut discretionary spending to build a healthier buffer.` });
  const expCats = {};
  _expenses.forEach(t => { expCats[t.category || t.cat || 'Other'] = (expCats[t.category || t.cat || 'Other'] || 0) + +t.amount; });
  const topCat = Object.entries(expCats).sort((a, b) => b[1] - a[1])[0];
  if (topCat) adv.push({ icon: '📊', title: `Top spending: ${topCat[0]}`, text: `You have spent ${fmt(topCat[1])} on ${topCat[0]}. Review whether this aligns with your priorities.` });
  if (balance < 0) adv.push({ icon: '🚨', title: 'Expenses exceed income', text: 'Your spending is higher than your income this period. Identify and cut unnecessary costs immediately.' });
  if (balance >= 0 && income > 0) adv.push({ icon: '🏦', title: 'Build an emergency fund', text: 'Aim for 3-6 months of expenses in liquid savings. This is your first financial safety net.' });
  const nearGoals = _goals.filter(g => g.target > 0 && (+g.saved / +g.target) >= 0.8);
  if (nearGoals.length) adv.push({ icon: '🎯', title: `Almost there: ${nearGoals[0].name}`, text: `You are ${Math.round((+nearGoals[0].saved / +nearGoals[0].target) * 100)}% of the way to your goal! One final push!` });
  adv.push({ icon: '📈', title: 'Consider investing', text: 'Once your emergency fund is solid, put 10-15% of income into T-Bills, MMFs, or Sacco shares for passive growth.' });
  adv.push({ icon: '💡', title: 'Track every shilling', text: 'Even small daily expenses add up fast. Recording every transaction reveals hidden spending leaks.' });
  adv.push({ icon: '🔄', title: 'Review monthly', text: 'Set aside 30 minutes each month to review your income, expenses, and progress toward goals. Consistency is key.' });
  el('advice-list').innerHTML = adv.map(a => `<div class="advice-item">
      <div class="advice-icon">${a.icon}</div>
      <div class="advice-text"><strong>${esc(a.title)}</strong><span>${esc(a.text)}</span></div>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════
// AI FINANCIAL ADVISER ENGINE
// ═══════════════════════════════════════════════════════════
let _aiChatHistory = [];

function renderAIAdviser() {
  // Page already has static HTML - just reset if first visit
  const msgs = el('ai-chat-messages');
  if (!msgs) return;
}

function getAIFinancialContext() {
  const income = _income.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const expense = _expenses.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const balance = income - expense;
  const savingsTotal = computeSavingsTotals().net;
  const savingsRate = income > 0 ? ((balance / income) * 100).toFixed(1) : 0;
  const loanDebt = _loans.filter(l => l.type === 'borrowed').reduce((s, l) => s + Math.max(0, parseFloat(l.amount || 0) - parseFloat(l.amount_paid || 0)), 0);
  const expCats = {};
  _expenses.forEach(t => { const cat = t.category || t.cat || 'Other'; expCats[cat] = (expCats[cat] || 0) + parseFloat(t.amount || 0); });
  const topCategories = Object.entries(expCats).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const budgetPerformance = _budgets.map(b => {
    const spent = _expenses.filter(e => (e.category || e.cat) === b.category).reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    return { category: b.category, planned: parseFloat(b.amount || 0), spent, over: spent > parseFloat(b.amount || 0) };
  });
  const goals = _goals.map(g => ({ name: g.name, target: parseFloat(g.target || 0), saved: parseFloat(g.saved || 0), pct: g.target > 0 ? Math.round((g.saved / g.target) * 100) : 0 }));
  return { income, expense, balance, savingsTotal, savingsRate, loanDebt, topCategories, budgetPerformance, goals, currency: _activeCurrency };
}

function analyzeAIQuery(query, ctx) {
  const q = query.toLowerCase();
  const { income, expense, balance, savingsTotal, savingsRate, loanDebt, topCategories, budgetPerformance, goals } = ctx;

  // Can I afford X?
  const affordMatch = q.match(/afford.*?(\d[\d,]*)/);
  if (affordMatch || q.includes('afford')) {
    const amount = affordMatch ? parseFloat(affordMatch[1].replace(/,/g, '')) : 0;
    if (amount > 0) {
      const canAfford = balance >= amount;
      const pctOfBalance = balance > 0 ? ((amount / balance) * 100).toFixed(0) : 0;
      if (canAfford) {
        return `✅ **You can afford ${fmt(amount)}.**\n\nYour current balance is **${fmt(balance)}**, and this purchase represents about **${pctOfBalance}%** of your available funds.\n\n${pctOfBalance > 30 ? '⚠️ However, this is a significant chunk. Consider if it is urgent or if saving over 1-2 months is better.' : '💡 This looks manageable. Just ensure you still hit your savings target for the month.'}`;
      } else {
        const shortfall = amount - balance;
        return `❌ **You cannot comfortably afford ${fmt(amount)} right now.**\n\nYour current balance is **${fmt(balance)}**, which is **${fmt(shortfall)} short**.\n\n💡 To afford this, you could:\n• Save ${fmt(shortfall / 3)} per month for 3 months\n• Cut one major expense category temporarily\n• Check if any goals have surplus funds`;
      }
    }
    return `Your current balance is **${fmt(balance)}**. Share the item amount to get a specific recommendation!`;
  }

  // Overspending
  if (q.includes('overspend') || q.includes('overspending') || q.includes('spending too')) {
    const overBudget = budgetPerformance.filter(b => b.over);
    if (overBudget.length === 0) return `🎉 **Great news — you are not overspending in any budget category!**\n\nYour top expense is **${topCategories[0] ? topCategories[0][0] + ' at ' + fmt(topCategories[0][1]) : 'N/A'}**. Keep tracking consistently.`;
    return `⚠️ **You are over budget in ${overBudget.length} categor${overBudget.length > 1 ? 'ies' : 'y'}:**\n\n${overBudget.map(b => `• **${b.category}**: Planned ${fmt(b.planned)} → Spent ${fmt(b.spent)} (${fmt(b.spent - b.planned)} over)`).join('\n')}\n\n💡 Focus on reducing your top offenders first.`;
  }

  // Biggest expense
  if (q.includes('biggest') || q.includes('largest') || q.includes('most expensive') || q.includes('top expense')) {
    if (!topCategories.length) return `No expense data found yet. Start recording transactions!`;
    return `📊 **Your top expense categories:**\n\n${topCategories.map((c, i) => `${i + 1}. **${c[0]}** — ${fmt(c[1])} (${income > 0 ? ((c[1] / income) * 100).toFixed(0) : 0}% of income)`).join('\n')}\n\n💡 If any category feels out of proportion, consider setting a stricter budget for it.`;
  }

  // How much to save
  if (q.includes('how much') && (q.includes('save') || q.includes('saving'))) {
    const recommended = income * 0.2;
    const currentSaving = Math.max(0, balance);
    return `💰 **Savings Recommendation**\n\nBased on your income of **${fmt(income)}**:\n\n• **Minimum (10%):** ${fmt(income * 0.1)}/month\n• **Recommended (20%):** ${fmt(income * 0.2)}/month\n• **Aggressive (30%):** ${fmt(income * 0.3)}/month\n\nYour current net balance is **${fmt(balance)}** which is a **${savingsRate}% savings rate**.\n\n${parseFloat(savingsRate) >= 20 ? '✅ You are already hitting the recommended rate!' : `💡 Try saving an extra **${fmt(Math.max(0, recommended - currentSaving))}** this month to hit 20%.`}`;
  }

  // Can I take a loan
  if (q.includes('loan') || q.includes('borrow')) {
    const debtRatio = income > 0 ? (loanDebt / income) * 100 : 0;
    if (debtRatio > 40) return `⚠️ **Taking a new loan is risky right now.**\n\nYour existing debt is **${fmt(loanDebt)}**, which is **${debtRatio.toFixed(0)}% of your monthly income**. Lenders generally advise keeping debt under 30-40% of income.\n\n💡 Focus on paying off existing debt first, then revisit.`;
    if (income === 0) return `You need consistent income before taking a loan. Record your income sources first.`;
    return `✅ **You may be eligible for a loan.**\n\nCurrent debt load: **${fmt(loanDebt)}** (${debtRatio.toFixed(0)}% of income)\n\n💡 Rule: Keep total debt repayments under 30% of income (${fmt(income * 0.3)}/month). Borrow only what you can repay in 12-24 months. Use the Loans section to track any new loan carefully.`;
  }

  // Improve financial health
  if (q.includes('improve') || q.includes('better') || q.includes('health') || q.includes('tips')) {
    const tips = [];
    if (parseFloat(savingsRate) < 20) tips.push(`• **Boost savings to 20%**: Currently at ${savingsRate}%. Target ${fmt(income * 0.2)}/month.`);
    if (loanDebt > 0) tips.push(`• **Pay off debt**: You have ${fmt(loanDebt)} in loans. Prioritize high-interest ones.`);
    if (budgetPerformance.filter(b => b.over).length > 0) tips.push(`• **Fix budget overruns**: You are over budget in ${budgetPerformance.filter(b => b.over).length} categories.`);
    if (goals.filter(g => g.pct < 50).length > 0) tips.push(`• **Push your goals**: ${goals.filter(g => g.pct < 50).length} goals are under 50% completion.`);
    if (savingsTotal < income * 3) tips.push(`• **Build emergency fund**: Aim for ${fmt(expense * 3)} (3 months of expenses).`);
    tips.push(`• **Review monthly**: Set 30 mins aside to review your BTECH Track dashboard.`);
    return `🌟 **Your Financial Health Improvement Plan:**\n\n${tips.join('\n')}\n\n📊 Current status: Income ${fmt(income)} | Expenses ${fmt(expense)} | Balance ${fmt(balance)}`;
  }

  // Budget advice
  if (q.includes('budget') || q.includes('what budget') || q.includes('set budget')) {
    return `📋 **Smart Budget Allocation (50/20/30 Rule)**\n\nFor your income of **${fmt(income)}**:\n\n• **Needs (50%):** ${fmt(income * 0.5)} — rent, food, transport, utilities\n• **Savings (20%):** ${fmt(income * 0.2)} — emergency fund, goals, investments\n• **Wants (30%):** ${fmt(income * 0.3)} — entertainment, dining out, shopping\n\n💡 Use the **Auto Budget Planner** to set custom allocations!`;
  }

  // Food spending
  if (q.includes('food') || q.includes('eat') || q.includes('groceries')) {
    const foodSpend = _expenses.filter(e => ['Food', 'Groceries', 'Dining', 'Restaurant', 'food'].some(k => (e.category || '').toLowerCase().includes(k.toLowerCase()))).reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    const foodBudgetPct = income > 0 ? ((foodSpend / income) * 100).toFixed(0) : 0;
    return `🍽️ **Food Spending Analysis**\n\nYou've spent approximately **${fmt(foodSpend)}** on food-related categories (${foodBudgetPct}% of income).\n\n💡 Financial advisers recommend keeping food to **10-15% of income** (${fmt(income * 0.1)} – ${fmt(income * 0.15)}).\n\n${parseFloat(foodBudgetPct) > 15 ? '⚠️ You may be overspending on food. Try meal prep or reducing restaurant visits.' : '✅ Your food spending looks reasonable!'}`;
  }

  // Default comprehensive response
  return `💼 **Your Financial Snapshot:**\n\n• **Income:** ${fmt(income)}\n• **Expenses:** ${fmt(expense)}\n• **Balance:** ${fmt(balance)}\n• **Savings Rate:** ${savingsRate}%\n• **Total Savings:** ${fmt(savingsTotal)}\n• **Outstanding Debt:** ${fmt(loanDebt)}\n\n${topCategories.length ? '📊 **Top Expense:** ' + topCategories[0][0] + ' at ' + fmt(topCategories[0][1]) : ''}\n\n💡 Try asking: "How can I improve my finances?" or "Where am I overspending?"`;
}

function appendAIMessage(text, isUser) {
  const msgs = el('ai-chat-messages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'ai-bubble ' + (isUser ? 'user-msg' : '');
  const avatarIcon = isUser ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-robot"></i>';
  // Convert markdown-style bold and newlines
  const formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  div.innerHTML = `<div class="ai-bubble-avatar">${avatarIcon}</div><div class="ai-bubble-content">${formatted}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function sendAIMessage(msg) {
  const input = el('ai-chat-input');
  if (input) input.value = '';
  // Hide suggestions after first use
  const sugg = el('ai-suggestions');
  if (sugg) sugg.style.display = 'none';
  appendAIMessage(msg, true);
  // Show typing indicator
  const typing = el('ai-typing');
  if (typing) typing.style.display = 'flex';
  const msgs = el('ai-chat-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
  // Simulate thinking delay
  setTimeout(() => {
    if (typing) typing.style.display = 'none';
    const ctx = getAIFinancialContext();
    const response = analyzeAIQuery(msg, ctx);
    appendAIMessage(response, false);
  }, 900 + Math.random() * 600);
}

function sendAIChat() {
  const input = el('ai-chat-input');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  input.style.height = 'auto';
  sendAIMessage(msg);
}

// ═══════════════════════════════════════════════════════════
// AUTO BUDGET ALLOCATION ENGINE
// ═══════════════════════════════════════════════════════════
// ─── Auto Budget: template categories ───────────────────────
let _budgetAllocs = JSON.parse(localStorage.getItem('btech_auto_budget') || 'null') || [
  { name: 'Rent / Housing', pct: 30, color: '#6C63FF' },
  { name: 'Food & Transport', pct: 40, color: '#10B981' },
  { name: 'Savings', pct: 30, color: '#D4AF37' }
];
// ─── Per-entry allocation history ────────────────────────────
let _allocHistory = JSON.parse(localStorage.getItem('btech_alloc_history') || '[]');

function saveAllocHistory() {
  localStorage.setItem('btech_alloc_history', JSON.stringify(_allocHistory));
}

function renderAutoBudget() {
  const container = el('auto-budget-content');
  if (!container) return;
  const total = _budgetAllocs.reduce((s, a) => s + a.pct, 0);

  // ── Section 1: template editor ──────────────────────────────
  const templateHtml = `
        <div style="margin-bottom:4px">
          <div style="font-size:15px;font-weight:700;color:var(--text)">📐 Allocation Template</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:2px">Define percentage split. Must total 100%.</div>
        </div>
        <div class="budget-alloc-grid" id="alloc-grid">
          ${_budgetAllocs.map((a, i) => `
            <div class="budget-alloc-card" id="alloc-card-${i}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <div class="budget-alloc-label" style="margin:0">${esc(a.name)}</div>
                <button onclick="removeBudgetCategory(${i})" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:13px;padding:2px 5px;border-radius:4px" title="Remove">✕</button>
              </div>
              <div class="budget-alloc-pct-input">
                <input type="number" min="0" max="100" value="${a.pct}" id="alloc-pct-${i}" oninput="updateAllocPreview(${i})" style="width:60px">
                <span style="font-size:14px;color:var(--text-muted)">%</span>
              </div>
              <div class="budget-alloc-bar" style="margin-top:8px"><div class="budget-alloc-fill" id="alloc-bar-${i}" style="width:${Math.min(100, a.pct)}%;background:${a.color}"></div></div>
            </div>`).join('')}
          <div class="budget-alloc-card" style="border-style:dashed;cursor:pointer" onclick="addBudgetCategory()">
            <div style="text-align:center;color:var(--text-muted);padding:18px 0">
              <i class="fa-solid fa-plus" style="font-size:18px;margin-bottom:6px;display:block"></i>
              <span style="font-size:12px">Add Category</span>
            </div>
          </div>
        </div>
        <div class="budget-total-row" style="margin-bottom:8px">
          <span style="font-size:14px;color:var(--text)">Total</span>
          <span id="alloc-total" class="${total === 100 ? 'budget-total-ok' : 'budget-total-err'}">${total}% ${total === 100 ? '✓' : '(must equal 100%)'}</span>
        </div>`;

  // ── Section 2: generate new allocation from specific income ─
  const incomeOptions = _income.length
    ? _income.slice(0, 30).map(r => `<option value="${esc(r.id || '')}|${r.amount}|${esc(r.description || r.desc || 'Income')}">${esc(r.description || r.desc || 'Income')} — ${fmt(r.amount)} (${fmtDate(r.transaction_date || r.date || '')})</option>`).join('')
    : '<option value="">No income entries found</option>';

  const generateHtml = `
        <div style="margin-top:20px;padding-top:18px;border-top:1px solid var(--border-solid)">
          <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px">⚡ Generate Allocation from Income Entry</div>
          <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Pick a specific income entry. The allocation is calculated only from that entry's amount.</div>
          <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
            <div style="flex:1;min-width:200px">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">SELECT INCOME ENTRY</label>
              <select id="ab-income-select" style="width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--border-solid);background:var(--surface);color:var(--text);font-size:13px">
                ${incomeOptions}
              </select>
            </div>
            <div style="min-width:130px">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">OVERRIDE AMOUNT</label>
              <input type="number" id="ab-override-amt" placeholder="Leave blank to use entry amount" style="width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--border-solid);background:var(--surface);color:var(--text);font-size:13px">
            </div>
            <button onclick="generateNewAllocation()" class="btn-action" style="background:linear-gradient(135deg,#06B6D4,#0284C7);color:#fff;padding:9px 18px;font-size:13px;white-space:nowrap">Generate Allocation</button>
          </div>
        </div>`;

  // ── Section 3: allocation history ───────────────────────────
  const histHtml = _allocHistory.length ? `
        <div style="margin-top:22px;padding-top:18px;border-top:1px solid var(--border-solid)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="font-size:15px;font-weight:700;color:var(--text)">📋 Allocation History (${_allocHistory.length})</div>
            <button onclick="if(confirm('Clear all allocation history?')){_allocHistory=[];saveAllocHistory();renderAutoBudget()}" style="background:none;border:1px solid var(--border-solid);color:var(--text-muted);border-radius:7px;padding:5px 11px;font-size:12px;cursor:pointer">Clear All</button>
          </div>
          <div id="alloc-history-list">
            ${[..._allocHistory].reverse().map(alloc => renderAllocCard(alloc)).join('')}
          </div>
        </div>` : `
        <div style="margin-top:22px;padding:18px;background:var(--surface-2);border-radius:10px;text-align:center;color:var(--text-muted);font-size:13px">
          No allocations generated yet. Pick an income entry above and click <strong>Generate Allocation</strong>.
        </div>`;

  container.innerHTML = templateHtml + generateHtml + histHtml;
}

function renderAllocCard(alloc) {
  const breakdown = alloc.breakdown.map(b => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border-solid)">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:10px;height:10px;border-radius:50%;background:${esc(b.color)};flex-shrink:0"></div>
            <span style="font-size:13px;color:var(--text)">${esc(b.name)}</span>
            <span style="font-size:11px;color:var(--text-muted)">${b.pct}%</span>
          </div>
          <span style="font-size:13px;font-weight:700;font-family:'Inter',sans-serif;font-variant-numeric:tabular-nums;color:var(--primary)">${fmt(b.amount)}</span>
        </div>`).join('');
  return `
        <div class="alloc-history-card" id="alloc-card-h-${esc(alloc.id)}">
          <div class="alloc-history-header">
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--text)">${esc(alloc.source)}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">ID: ${esc(alloc.id)} · Created ${esc(alloc.date)}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <span style="font-size:15px;font-weight:700;font-family:'Inter',sans-serif;font-variant-numeric:tabular-nums;color:var(--primary)">${fmt(alloc.incomeAmount)}</span>
              <button onclick="editAllocEntry('${esc(alloc.id)}')" style="background:none;border:1px solid var(--border-solid);color:var(--text-muted);border-radius:6px;padding:4px 9px;font-size:11px;cursor:pointer"><i class="fa-solid fa-pen" style="margin-right:3px"></i>Edit</button>
              <button onclick="deleteAllocEntry('${esc(alloc.id)}')" style="background:none;border:1px solid rgba(239,68,68,.3);color:#EF4444;border-radius:6px;padding:4px 9px;font-size:11px;cursor:pointer"><i class="fa-solid fa-trash" style="margin-right:3px"></i>Delete</button>
            </div>
          </div>
          <div style="margin-top:8px">${breakdown}</div>
        </div>`;
}

function generateNewAllocation() {
  const total = _budgetAllocs.reduce((s, a) => s + a.pct, 0);
  if (total !== 100) { showToast('Fix template: percentages must total 100%', 'danger'); return; }
  // Sync inputs into _budgetAllocs first
  document.querySelectorAll('[id^="alloc-pct-"]').forEach((inp, i) => {
    if (_budgetAllocs[i]) _budgetAllocs[i].pct = parseInt(inp.value) || 0;
  });
  localStorage.setItem('btech_auto_budget', JSON.stringify(_budgetAllocs));

  const sel = el('ab-income-select');
  const overrideEl = el('ab-override-amt');
  if (!sel || !sel.value) { showToast('Please select an income entry', 'danger'); return; }
  const parts = sel.value.split('|');
  const incomeId = parts[0];
  const entryAmt = parseFloat(parts[1]) || 0;
  const source = parts.slice(2).join('|') || 'Income';
  const useAmt = overrideEl && overrideEl.value.trim() ? parseFloat(overrideEl.value) : entryAmt;
  if (!useAmt || useAmt <= 0) { showToast('Income amount must be greater than 0', 'danger'); return; }

  const breakdown = _budgetAllocs.map(a => ({
    name: a.name,
    pct: a.pct,
    color: a.color,
    amount: Math.round((useAmt * a.pct / 100) * 100) / 100
  }));

  const allocId = 'AL' + Date.now().toString(36).toUpperCase();
  const newAlloc = {
    id: allocId,
    incomeId,
    source,
    incomeAmount: useAmt,
    date: new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' }),
    breakdown
  };
  _allocHistory.push(newAlloc);
  saveAllocHistory();
  if (overrideEl) overrideEl.value = '';
  renderAutoBudget();
  showToast(`Allocation ${allocId} created for ${source} — ${fmt(useAmt)}`, 'success');
}

function editAllocEntry(id) {
  const alloc = _allocHistory.find(a => a.id === id);
  if (!alloc) return;
  const newAmt = parseFloat(prompt(`Edit income amount for "${alloc.source}":`, alloc.incomeAmount));
  if (!newAmt || newAmt <= 0) return;
  alloc.incomeAmount = newAmt;
  alloc.breakdown = alloc.breakdown.map(b => ({
    ...b,
    amount: Math.round((newAmt * b.pct / 100) * 100) / 100
  }));
  saveAllocHistory();
  renderAutoBudget();
  showToast('Allocation recalculated!', 'success');
}

function deleteAllocEntry(id) {
  if (!confirm('Delete this allocation?')) return;
  _allocHistory = _allocHistory.filter(a => a.id !== id);
  saveAllocHistory();
  renderAutoBudget();
  showToast('Allocation deleted.', 'success');
}

function updateAllocPreview(i) {
  const input = el(`alloc-pct-${i}`);
  if (!input) return;
  const newPct = Math.max(0, Math.min(100, parseInt(input.value) || 0));
  _budgetAllocs[i].pct = newPct;
  const barEl = el(`alloc-bar-${i}`);
  if (barEl) barEl.style.width = Math.min(100, newPct) + '%';
  const total = _budgetAllocs.reduce((s, a) => s + a.pct, 0);
  const totalEl = el('alloc-total');
  if (totalEl) {
    totalEl.textContent = total + '% ' + (total === 100 ? '✓' : '(must equal 100%)');
    totalEl.className = total === 100 ? 'budget-total-ok' : 'budget-total-err';
  }
}

function addBudgetCategory() {
  const name = prompt('Category name:');
  if (!name) return;
  const colors = ['#EF4444', '#F97316', '#06B6D4', '#8B5CF6', '#EC4899'];
  _budgetAllocs.push({ name, pct: 0, color: colors[_budgetAllocs.length % colors.length] });
  renderAutoBudget();
}

function removeBudgetCategory(i) {
  if (_budgetAllocs.length <= 1) { showToast('Need at least one category', 'danger'); return; }
  _budgetAllocs.splice(i, 1);
  renderAutoBudget();
}

function applyAutoBudget() {
  // Legacy: now just saves template and re-renders
  const total = _budgetAllocs.reduce((s, a) => s + a.pct, 0);
  if (total !== 100) { showToast('Total allocation must equal 100%', 'danger'); return; }
  document.querySelectorAll('[id^="alloc-pct-"]').forEach((inp, i) => {
    if (_budgetAllocs[i]) _budgetAllocs[i].pct = parseInt(inp.value) || 0;
  });
  localStorage.setItem('btech_auto_budget', JSON.stringify(_budgetAllocs));
  showToast('Template saved! Now generate allocations from income entries below.', 'success');
}

// ═══════════════════════════════════════════════════════════
// CURRENCY SETTINGS PAGE
// ═══════════════════════════════════════════════════════════
function renderCurrencySettings() {
  const container = el('currency-content');
  if (!container) return;
  const currencies = [
    { code: 'KES', symbol: 'KES', name: 'Kenyan Shilling' },
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'TZS', symbol: 'TZS', name: 'Tanzanian Shilling' },
    { code: 'UGX', symbol: 'UGX', name: 'Ugandan Shilling' },
    { code: 'RWF', symbol: 'RWF', name: 'Rwandan Franc' }
  ];
  container.innerHTML = `
        <div style="margin-bottom:16px">
          <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:4px">Active Currency: <span style="color:var(--primary)">${_activeCurrency}</span></div>
          <div style="font-size:13px;color:var(--text-muted)">Select your preferred currency. Exchange rates are approximate.</div>
        </div>
        <div class="currency-grid">
          ${currencies.map(c => `
            <div class="currency-card ${c.code === _activeCurrency ? 'active' : ''}" onclick="setCurrency('${c.code}');renderCurrencySettings()">
              <div class="currency-card-symbol">${c.symbol}</div>
              <div class="currency-card-code">${c.code}</div>
              <div class="currency-card-name">${c.name}</div>
              ${c.code === _activeCurrency ? '<div style="margin-top:8px;font-size:11px;color:var(--primary)">✓ Active</div>' : ''}
            </div>`).join('')}
        </div>
        <div style="margin-top:16px;padding:14px;background:var(--surface-2);border-radius:10px;font-size:13px;color:var(--text-muted)">
          <strong style="color:var(--text)">ℹ️ Note:</strong> Currency conversion uses approximate indicative rates relative to KES. Your data is always stored in KES (base currency). Display amounts are converted for reference only.
        </div>`;
}

// ═══════════════════════════════════════════════════════════
// SETTINGS
// Preferences persist per-device (localStorage, keyed by user id).
// Profile fields (name/username/phone) sync to Supabase where the
// `profiles` table has matching columns; missing columns fail
// silently rather than breaking the save.
// ═══════════════════════════════════════════════════════════
const DEFAULT_PREFS = {
  themeMode: 'system', // 'light' | 'dark' | 'system'
  language: 'en',
  notifications: { income: true, expense: true, budget: true, savings: true, goals: true, email: false, push: true },
  financial: { startingBalance: 0, monthlyBudget: 0, savingsTarget: 0, defaultExportFormat: 'pdf', incomeCategories: '', expenseCategories: '' },
  pinLock: { enabled: false, hash: null },
  security: { twoFactor: false, biometric: false }
};
let _prefs = null;
let _settingsTab = 'profile';

function prefsKey() { return 'btech_prefs_' + uid(); }

function loadPrefs() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(prefsKey()) || 'null'); } catch (e) { stored = null; }
  _prefs = {
    ...DEFAULT_PREFS, ...stored,
    notifications: { ...DEFAULT_PREFS.notifications, ...(stored?.notifications || {}) },
    financial: { ...DEFAULT_PREFS.financial, ...(stored?.financial || {}) },
    pinLock: { ...DEFAULT_PREFS.pinLock, ...(stored?.pinLock || {}) },
    security: { ...DEFAULT_PREFS.security, ...(stored?.security || {}) }
  };
  return _prefs;
}

function savePrefs() {
  try { localStorage.setItem(prefsKey(), JSON.stringify(_prefs)); } catch (e) { }
  savePrefsToServer();
}

// Cross-device sync: mirrors _prefs into profiles.settings (jsonb).
// Fails silently if the column doesn't exist yet — local storage
// remains the source of truth on this device either way.
async function savePrefsToServer() {
  if (_demoMode || !currentUser) return;
  try { await _sb.from('profiles').update({ settings: _prefs }).eq('id', currentUser.id); } catch (e) { }
}

async function loadPrefsFromServer() {
  if (_demoMode || !currentUser) return;
  try {
    const { data, error } = await _sb.from('profiles').select('settings').eq('id', currentUser.id).maybeSingle();
    if (error || !data || !data.settings) return;
    const server = data.settings;
    _prefs = {
      ..._prefs, ...server,
      notifications: { ...DEFAULT_PREFS.notifications, ..._prefs.notifications, ...(server.notifications || {}) },
      financial: { ...DEFAULT_PREFS.financial, ..._prefs.financial, ...(server.financial || {}) },
      pinLock: { ...DEFAULT_PREFS.pinLock, ..._prefs.pinLock, ...(server.pinLock || {}) },
      security: { ...DEFAULT_PREFS.security, ..._prefs.security, ...(server.security || {}) }
    };
    try { localStorage.setItem(prefsKey(), JSON.stringify(_prefs)); } catch (e) { }
    applyThemeMode(_prefs.themeMode);
    applyCustomCategories();
    if (_currentPage === 'settings') renderSettings();
  } catch (e) { /* settings column may not exist yet — local prefs still apply */ }
}

function applyThemeMode(mode) {
  let effective = mode;
  if (mode === 'system') {
    effective = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  const next = effective === 'dark' ? 'dark' : '';
  document.body.setAttribute('data-theme', next);
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('bt_theme', next);
  const icon = el('theme-btn-icon');
  if (icon) icon.textContent = next === 'dark' ? '☀️' : '🌙';
  try { setTimeout(() => renderMonthChart(), 80); } catch (e) { }
}

function setThemeModeUI(mode) {
  _prefs.themeMode = mode;
  savePrefs();
  applyThemeMode(mode);
  renderSettings();
}

// Custom income/expense category lists (comma-separated in prefs)
function applyCustomCategories() {
  const inc = (_prefs?.financial?.incomeCategories || '').split(',').map(s => s.trim()).filter(Boolean);
  const exp = (_prefs?.financial?.expenseCategories || '').split(',').map(s => s.trim()).filter(Boolean);
  const iSel = el('i-cat'), eSel = el('e-cat');
  if (inc.length && iSel) iSel.innerHTML = inc.map(c => `<option>${esc(c)}</option>`).join('');
  if (exp.length && eSel) eSel.innerHTML = exp.map(c => `<option>${esc(c)}</option>`).join('');
}

// ── Login history (local device log) ──
function logLoginEvent() {
  try {
    const key = 'btech_login_history_' + uid();
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { hist = []; }
    const ua = navigator.userAgent;
    const device = /Mobi|Android/i.test(ua) ? 'Mobile' : /iPad|Tablet/i.test(ua) ? 'Tablet' : 'Desktop';
    hist.unshift({ ts: Date.now(), device });
    hist = hist.slice(0, 10);
    localStorage.setItem(key, JSON.stringify(hist));
  } catch (e) { }
}

// ── PIN lock ──
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function openPinSetup() { el('pin-setup-1').value = ''; el('pin-setup-2').value = ''; openModal('pin-setup'); }

async function setPinUI() {
  const pin = el('pin-setup-1').value, pin2 = el('pin-setup-2').value;
  if (!/^\d{4,6}$/.test(pin)) return showToast('PIN must be 4–6 digits.', 'danger');
  if (pin !== pin2) return showToast('PINs do not match.', 'danger');
  _prefs.pinLock = { enabled: true, hash: await sha256Hex(pin) };
  savePrefs(); closeModal(); renderSettings();
  showToast('PIN lock enabled.', 'success');
}

function disablePinLockUI() {
  _prefs.pinLock = { enabled: false, hash: null };
  savePrefs(); renderSettings();
  showToast('PIN lock disabled.', 'success');
}

function showLockScreenIfNeeded() {
  if (_prefs?.pinLock?.enabled && el('lock-screen')) {
    el('lock-screen').style.display = 'flex';
    setTimeout(() => { const i = el('lock-pin-input'); if (i) i.focus(); }, 50);
  }
}

async function verifyPinUI() {
  const pin = el('lock-pin-input').value;
  const hash = await sha256Hex(pin);
  if (hash === _prefs.pinLock.hash) {
    el('lock-screen').style.display = 'none';
    el('lock-pin-input').value = '';
    el('lock-pin-error').style.display = 'none';
  } else {
    el('lock-pin-error').style.display = 'block';
    el('lock-pin-input').value = '';
  }
}

// ── Biometric unlock (WebAuthn platform authenticator, device-local) ──
async function enableBiometricUI() {
  if (!window.PublicKeyCredential || !navigator.credentials) return showToast('Biometric unlock is not supported on this device.', 'danger');
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'BTECH Track' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: currentUser?.email || 'user', displayName: currentProfile?.name || 'User' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000
      }
    });
    localStorage.setItem('btech_biocred_' + uid(), cred.id);
    _prefs.security.biometric = true;
    savePrefs(); renderSettings();
    showToast('Biometric unlock enabled on this device.', 'success');
  } catch (e) { showToast('Could not enable biometric unlock: ' + e.message, 'danger'); }
}

function disableBiometricUI() {
  _prefs.security.biometric = false;
  localStorage.removeItem('btech_biocred_' + uid());
  savePrefs(); renderSettings();
  showToast('Biometric unlock disabled.', 'success');
}

async function unlockWithBiometricUI() {
  try {
    await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), timeout: 60000, userVerification: 'required' } });
    el('lock-screen').style.display = 'none';
  } catch (e) { showToast('Biometric unlock failed or was cancelled.', 'danger'); }
}

function toggleTwoFactorUI() {
  _prefs.security.twoFactor = !_prefs.security.twoFactor;
  savePrefs(); renderSettings();
  showToast(_prefs.security.twoFactor ? 'Two-factor verification enabled for sign-in.' : 'Two-factor verification disabled.', 'success');
}

function toggleNotificationUI(key) {
  _prefs.notifications[key] = !_prefs.notifications[key];
  savePrefs(); renderSettings();
}

// A couple of real call sites gated by notification prefs
function notifyBudgetIfEnabled(msg) { if (_prefs?.notifications?.budget) showToast(msg, 'warning'); }
function notifyGoalIfEnabled(msg) { if (_prefs?.notifications?.goals) showToast(msg, 'success'); }
function notifySavingsIfEnabled(msg) { if (_prefs?.notifications?.savings) showToast(msg, 'success'); }

// ── Profile edit ──
async function saveProfileSettingsUI() {
  const name = el('set-name').value.trim();
  const username = el('set-username').value.trim();
  const phone = el('set-phone').value.trim();
  if (!name) return showToast('Name is required.', 'danger');
  setBtn('btn-save-profile-settings', true, 'Saving…');
  if (currentProfile) { currentProfile.name = name; currentProfile.username = username; currentProfile.phone = phone; }
  if (!_demoMode && currentUser) {
    try {
      await _sb.from('profiles').upsert({ id: currentUser.id, name, username, phone, email: currentUser.email }, { onConflict: 'id' });
    } catch (e) { /* username/phone columns may not exist yet — profile still updates locally */ }
  }
  setBtn('btn-save-profile-settings', false, 'Save Changes');
  el('user-badge').textContent = name; el('sidebar-user-name').textContent = name;
  const dn = el('dropdown-name'); if (dn) dn.textContent = name;
  showToast('Profile updated.', 'success');
}

async function changePasswordUI() {
  const pass = el('set-new-pass').value, pass2 = el('set-new-pass2').value;
  if (!pass || pass.length < 6) return showToast('Password must be at least 6 characters.', 'danger');
  if (pass !== pass2) return showToast('Passwords do not match.', 'danger');
  if (_demoMode) return showToast('Password changes are disabled in demo mode.', 'info');
  setBtn('btn-change-password', true, 'Updating…');
  const { error } = await _sb.auth.updateUser({ password: pass });
  setBtn('btn-change-password', false, 'Update Password');
  if (error) return showToast(error.message, 'danger');
  el('set-new-pass').value = ''; el('set-new-pass2').value = '';
  showToast('Password updated.', 'success');
}

// ── Financial preferences ──
function saveFinancialPrefsUI() {
  _prefs.financial.startingBalance = parseFloat(el('fp-starting-balance').value) || 0;
  _prefs.financial.monthlyBudget = parseFloat(el('fp-monthly-budget').value) || 0;
  _prefs.financial.savingsTarget = parseFloat(el('fp-savings-target').value) || 0;
  _prefs.financial.defaultExportFormat = el('fp-export-format').value;
  _prefs.financial.incomeCategories = el('fp-income-cats').value.trim();
  _prefs.financial.expenseCategories = el('fp-expense-cats').value.trim();
  savePrefs();
  applyCustomCategories();
  renderDashboard();
  showToast('Financial preferences saved.', 'success');
}

// ── Data management ──
function exportCSV(rows, headers, filename) {
  const esc2 = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [headers.join(','), ...rows.map(r => headers.map(h => esc2(r[h])).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function exportAllCSVUI() {
  const all = [
    ..._income.map(r => ({ ...r, _type: 'Income' })),
    ..._expenses.map(r => ({ ...r, _type: 'Expense' })),
    ..._savings.map(r => ({ ...r, _type: 'Savings (' + (r.type || 'deposit') + ')' }))
  ];
  exportCSV(all, ['_type', 'description', 'amount', 'category', 'transaction_date'], 'btech-track-export.csv');
  showToast('CSV exported.', 'success');
}

function backupDataUI() {
  const payload = {
    exported_at: new Date().toISOString(), user: currentUser?.email || 'demo',
    income: _income, expenses: _expenses, savings: _savings, goals: _goals, budgets: _budgets, todos: _todos, loans: _loans,
    prefs: _prefs
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'btech-track-backup-' + new Date().toISOString().split('T')[0] + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('Backup downloaded.', 'success');
}

function triggerRestoreFilePicker() { el('restore-file-input').click(); }

async function restoreBackupFile(input) {
  const file = input.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('Invalid backup file.');
    if (!confirm('Restore this backup? New entries will be added alongside your existing data (nothing is deleted).')) { input.value = ''; return; }
    let added = 0;
    for (const r of (data.income || [])) { if (await addIncome({ description: r.description, amount: r.amount, category: r.category, transaction_date: r.transaction_date || r.date })) added++; }
    for (const r of (data.expenses || [])) { if (await addExpense({ description: r.description, amount: r.amount, category: r.category, transaction_date: r.transaction_date || r.date })) added++; }
    for (const r of (data.savings || [])) { if (await addSavings({ description: r.description, amount: r.amount, category: r.category, transaction_date: r.transaction_date || r.date, type: r.type || 'deposit', note: r.note })) added++; }
    await refreshAllData(); renderPage(_currentPage);
    showToast(`Backup restored — ${added} record(s) added.`, 'success');
  } catch (e) {
    showToast('Could not restore backup: ' + e.message, 'danger');
  }
  input.value = '';
}

async function deleteAccountUI() {
  const confirmText = prompt('This will permanently delete all your data (transactions, savings, goals, budgets). Type DELETE to confirm.');
  if (confirmText !== 'DELETE') return;
  if (_demoMode) return showToast('Account deletion is disabled in demo mode.', 'info');
  setBtn('btn-delete-account', true, 'Deleting…');
  try {
    const tables = ['income', 'expenses', 'savings', 'goals', 'budgets', 'shopping', 'todos', 'loans', 'loan_payments'];
    for (const t of tables) { try { await _sb.from(t).delete().eq('user_id', uid()); } catch (e) { } }
    try { await _sb.from('profiles').delete().eq('id', uid()); } catch (e) { }
    localStorage.removeItem(prefsKey());
    await _sb.auth.signOut();
  } catch (e) { showToast(e.message, 'danger'); }
  setBtn('btn-delete-account', false, 'Delete Account');
  showToast('Your data has been deleted. Signing you out…', 'success');
  setTimeout(() => location.reload(), 1500);
}

function resetApplicationUI() {
  if (!confirm('Reset the app? This clears local preferences, theme, PIN lock, and cached settings on this device only — your account data is not affected.')) return;
  const keys = Object.keys(localStorage).filter(k => k.startsWith('btech_') || k.startsWith('bt_'));
  keys.forEach(k => localStorage.removeItem(k));
  showToast('App reset. Reloading…', 'success');
  setTimeout(() => location.reload(), 1200);
}

function quickExportUI() {
  const fmt2 = _prefs?.financial?.defaultExportFormat || 'pdf';
  if (fmt2 === 'csv') exportAllCSVUI(); else dlPDF('all');
}

// ── About ──
function showAboutInfo(section) {
  const content = {
    privacy: { title: 'Privacy Policy', body: 'BTECH Track stores your financial data securely in your Supabase project and never sells or shares it with third parties. Preferences and lock settings stay on your device.' },
    terms: { title: 'Terms of Use', body: 'BTECH Track is provided as-is for personal financial tracking. You are responsible for the accuracy of the data you enter and for keeping your account credentials secure.' }
  }[section];
  if (!content) return;
  alert(content.title + '\n\n' + content.body);
}

function contactSupportUI() { window.location.href = 'mailto:support@btechstudios.co.ke?subject=BTECH%20Track%20Support'; }
function rateAppUI() { showToast('Thanks for using BTECH Track! Rating is not yet wired to a store listing.', 'info'); }

// ── Render ──
function switchSettingsTab(tab) {
  _settingsTab = tab;
  document.querySelectorAll('.settings-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.settings-panel').forEach(p => p.style.display = p.id === 'settings-panel-' + tab ? '' : 'none');
}

function renderSettings() {
  if (!_prefs) loadPrefs();
  if (!el('page-settings')) return;

  // Profile
  if (el('set-name')) el('set-name').value = currentProfile?.name || '';
  if (el('set-username')) el('set-username').value = currentProfile?.username || '';
  if (el('set-email')) el('set-email').value = currentUser?.email || '';
  if (el('set-phone')) el('set-phone').value = currentProfile?.phone || '';

  // Security
  const pinStatus = el('pin-lock-status'), pinBtn = el('pin-lock-toggle-btn');
  if (pinStatus) pinStatus.textContent = _prefs.pinLock.enabled ? 'Enabled' : 'Disabled';
  if (pinBtn) pinBtn.textContent = _prefs.pinLock.enabled ? 'Disable' : 'Set Up PIN';
  if (pinBtn) pinBtn.setAttribute('onclick', _prefs.pinLock.enabled ? 'disablePinLockUI()' : 'openPinSetup()');
  setToggleState('tw-biometric', _prefs.security.biometric);
  setToggleState('tw-2fa', _prefs.security.twoFactor);

  const histEl = el('login-history-list');
  if (histEl) {
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem('btech_login_history_' + uid()) || '[]'); } catch (e) { }
    histEl.innerHTML = hist.length ? hist.map(h => `<div class="settings-row" style="padding:9px 0">
        <div><div style="font-size:13px;color:var(--text)">${esc(h.device)}</div><div style="font-size:11.5px;color:var(--text-muted)">${new Date(h.ts).toLocaleString('en-KE')}</div></div>
      </div>`).join('') : '<div style="font-size:12.5px;color:var(--text-muted);padding:6px 0">No login history recorded yet on this device.</div>';
  }
  const sessEl = el('active-sessions-list');
  if (sessEl) {
    const device = /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : /iPad|Tablet/i.test(navigator.userAgent) ? 'Tablet' : 'Desktop';
    sessEl.innerHTML = `<div class="settings-row" style="padding:9px 0">
        <div><div style="font-size:13px;color:var(--text)">${device} · This device</div><div style="font-size:11.5px;color:var(--text-muted)">Active now</div></div>
        <span style="font-size:11px;color:#10B981;font-weight:700">● Current</span>
      </div>`;
  }

  // Appearance
  const themeSel = el('set-theme-mode');
  if (themeSel) themeSel.value = _prefs.themeMode;
  const curEl = el('set-active-currency');
  if (curEl) curEl.textContent = _activeCurrency;
  const langSel = el('set-language');
  if (langSel) langSel.value = _prefs.language;

  // Notifications
  Object.keys(_prefs.notifications).forEach(k => setToggleState('tw-notif-' + k, _prefs.notifications[k]));

  // Financial preferences
  if (el('fp-starting-balance')) el('fp-starting-balance').value = _prefs.financial.startingBalance || '';
  if (el('fp-monthly-budget')) el('fp-monthly-budget').value = _prefs.financial.monthlyBudget || '';
  if (el('fp-savings-target')) el('fp-savings-target').value = _prefs.financial.savingsTarget || '';
  if (el('fp-export-format')) el('fp-export-format').value = _prefs.financial.defaultExportFormat;
  if (el('fp-income-cats')) el('fp-income-cats').value = _prefs.financial.incomeCategories;
  if (el('fp-expense-cats')) el('fp-expense-cats').value = _prefs.financial.expenseCategories;

  // About
  if (el('about-version')) el('about-version').textContent = 'v2.5.0';
}

function setToggleState(id, on) {
  const t = el(id);
  if (!t) return;
  t.classList.toggle('on', !!on);
}

// ── ADD TX — Optimistic UI for instant feedback ──────────────
async function addTx(type) {
  const p = type === 'income';
  const desc = el(p ? 'i-desc' : 'e-desc').value.trim();
  const amt = parseFloat(el(p ? 'i-amt' : 'e-amt').value);
  const cat = el(p ? 'i-cat' : 'e-cat').value;
  const date = el(p ? 'i-date' : 'e-date').value || new Date().toISOString().split('T')[0];
  if (!desc || !amt || amt <= 0) return showToast('Please fill in all fields with valid values.', 'danger');

  // ── Optimistic update: add to local array & re-render immediately ──
  const tempId = '_tmp_' + Date.now();
  const tempRow = {
    id: tempId, description: desc, amount: amt, category: cat,
    transaction_date: date, created_at: new Date().toISOString()
  };
  if (p) _income.unshift(tempRow); else _expenses.unshift(tempRow);

  // Close modal + reset fields immediately (feels instant)
  closeModal();
  const fields = p ? ['i-desc', 'i-amt', 'i-date'] : ['e-desc', 'e-amt', 'e-date'];
  fields.forEach(f => { const el2 = el(f); if (el2) el2.value = ''; });
  if (el(p ? 'i-cat' : 'e-cat')) el(p ? 'i-cat' : 'e-cat').selectedIndex = 0;
  renderDashboard();
  showToast((p ? '✅ Income' : '✅ Expense') + ' saved!', 'success');

  // ── Background DB write ──
  const ok = p
    ? await addIncome({ description: desc, amount: amt, category: cat, transaction_date: date })
    : await addExpense({ description: desc, amount: amt, category: cat, transaction_date: date });

  // Remove temp row and sync real data
  if (p) _income = _income.filter(r => r.id !== tempId);
  else _expenses = _expenses.filter(r => r.id !== tempId);

  if (ok) {
    // Sync real data quietly in background
    const safe = async (fn) => { try { return await fn(); } catch (e) { return []; } };
    const [inc, exp] = await Promise.all([safe(fetchIncome), safe(fetchExpenses)]);
    if (Array.isArray(inc)) _income = inc;
    if (Array.isArray(exp)) _expenses = exp;
    renderDashboard();
  } else {
    showToast('Save failed — please try again.', 'danger');
    renderDashboard();
  }
}

// ═══════════════════════════════════════════════════════════
// TODO SYSTEM
// ═══════════════════════════════════════════════════════════
let _todoFilter = 'all';

function setTodoFilter(filter, btn) {
  _todoFilter = filter;
  document.querySelectorAll('.todo-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderTodo();
}

function openTodoModal(editId) {
  const today = new Date().toISOString().split('T')[0];
  el('todo-edit-id').value = editId || '';
  el('todo-modal-title').textContent = editId ? '<i class="fa-solid fa-pen-to-square" style="color:#6C63FF;margin-right:8px"></i>Edit Task' : '<i class="fa-solid fa-list-check icon-task" style="margin-right:8px"></i>New Task';
  if (editId) {
    const task = _todos.find(t => t.id == editId);
    if (task) {
      el('todo-title').value = task.title;
      el('todo-desc').value = task.description || '';
      el('todo-type').value = task.type || 'daily';
      el('todo-priority').value = task.priority || 'medium';
      el('todo-category').value = task.category || 'Personal';
      el('todo-due').value = task.due_date || '';
    }
  } else {
    el('todo-title').value = '';
    el('todo-desc').value = '';
    el('todo-type').value = 'daily';
    el('todo-priority').value = 'medium';
    el('todo-category').value = 'Finance';
    el('todo-due').value = '';
  }
  closeModal();
  el('m-todo').style.display = '';
  el('modal-overlay').classList.add('open');
}

async function saveTodoUI() {
  const title = el('todo-title').value.trim();
  const description = el('todo-desc').value.trim();
  const type = el('todo-type').value;
  const priority = el('todo-priority').value;
  const category = el('todo-category').value;
  const due_date = el('todo-due').value || null;
  const editId = el('todo-edit-id').value;
  if (!title) return showToast('Please enter a task title.', 'danger');
  setBtn('btn-save-todo', true, 'Saving…');
  let ok;
  if (editId) {
    ok = await updateTodo(editId, { title, description, type, priority, category, due_date });
  } else {
    ok = await addTodo({ title, description, type, priority, category, due_date });
  }
  setBtn('btn-save-todo', false, 'Save Task');
  if (ok) {
    closeModal();
    await refreshAllData();
    renderTodo();
    showToast(editId ? 'Task updated!' : 'Task added!', 'success');
  }
}

async function toggleTodoUI(id, completed) {
  const changes = { completed, completed_at: completed ? new Date().toISOString() : null };
  await updateTodo(id, changes);
  await refreshAllData();
  renderTodo();
}

async function deleteTodoUI(id) {
  if (!confirm('Delete this task?')) return;
  const ok = await deleteTodo(id);
  if (ok) { await refreshAllData(); renderTodo(); showToast('Task deleted.', 'success'); }
}

function renderTodo() {
  const search = (el('todo-search')?.value || '').toLowerCase();
  let tasks = [..._todos];

  // Filter
  if (_todoFilter !== 'all') {
    if (_todoFilter === 'pending') tasks = tasks.filter(t => !t.completed);
    else if (_todoFilter === 'done') tasks = tasks.filter(t => t.completed);
    else tasks = tasks.filter(t => t.type === _todoFilter);
  }

  if (search) tasks = tasks.filter(t => (t.title + (t.description || '') + (t.category || '')).toLowerCase().includes(search));

  // Stats
  const total = _todos.length;
  const done = _todos.filter(t => t.completed).length;
  const today = new Date().toISOString().split('T')[0];
  const overdue = _todos.filter(t => !t.completed && t.due_date && t.due_date < today).length;
  const high = _todos.filter(t => !t.completed && t.priority === 'high').length;

  el('todo-stats-grid').innerHTML = `
      <div class="todo-stat-card"><div class="tsv" style="color:var(--primary)">${total}</div><div class="tsl">Total Tasks</div></div>
      <div class="todo-stat-card"><div class="tsv" style="color:var(--success)">${done}</div><div class="tsl">Completed</div></div>
      <div class="todo-stat-card"><div class="tsv" style="color:var(--danger)">${overdue}</div><div class="tsl">Overdue</div></div>
      <div class="todo-stat-card"><div class="tsv" style="color:var(--warning)">${high}</div><div class="tsl">High Priority</div></div>
    `;

  if (!tasks.length) {
    el('todo-list').innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div>No tasks found. Add your first task!</div>';
    return;
  }

  // Sort: incomplete first, then by priority, then by due date
  tasks.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const pOrder = { high: 0, medium: 1, low: 2 };
    if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
    if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
    return 0;
  });

  const typeLabels = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
  const priorityDotClass = { high: 'todo-priority-high', medium: 'todo-priority-medium', low: 'todo-priority-low' };

  el('todo-list').innerHTML = tasks.map(t => {
    const isOverdue = !t.completed && t.due_date && t.due_date < today;
    return `<div class="todo-item${t.completed ? ' done' : ''}${isOverdue ? ' overdue' : ''}">
        <div class="todo-check${t.completed ? ' checked' : ''}" onclick="toggleTodoUI('${t.id}', ${!t.completed})"></div>
        <div class="todo-item-body">
          <div class="todo-item-title">${esc(t.title)}</div>
          <div class="todo-item-meta">
            <span class="todo-badge todo-badge-${t.type}">${typeLabels[t.type] || t.type}</span>
            <span class="todo-priority-dot ${priorityDotClass[t.priority] || 'todo-priority-medium'}" title="Priority: ${t.priority}"></span>
            <span style="font-size:11.5px;color:var(--text-muted)">${esc(t.category || '')}</span>
            ${t.due_date ? `<span class="todo-due-date${isOverdue ? ' overdue' : ''}">📅 ${fmtDate(t.due_date)}</span>` : ''}
          </div>
          ${t.description ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">${esc(t.description)}</div>` : ''}
        </div>
        <div class="todo-item-actions">
          <button class="todo-action-btn edit" onclick="openTodoModal('${t.id}')" title="Edit">✏️</button>
          <button class="todo-action-btn" onclick="deleteTodoUI('${t.id}')" title="Delete">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════════════════════
async function renderAdmin() {
  const users = await adminFetchAllUsers();
  const allInc = await adminFetchAllIncome();
  const allExp = await adminFetchAllExpenses();
  const allSav = await adminFetchAllSavings();
  el('a-total').textContent = users.length;
  el('a-active').textContent = users.filter(u => !u.locked).length;
  el('a-locked').textContent = users.filter(u => u.locked).length;
  el('a-requests').textContent = 'KES ' + fmtN(allExp.reduce((s, r) => s + +r.amount, 0));
  el('a-tx').textContent = allInc.length + allExp.length;
  el('a-income').textContent = 'KES ' + fmtN(allInc.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)) + ' | Sav: KES ' + fmtN(allSav.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0));
  const months = {};
  allInc.forEach(r => { const k = (r.transaction_date || r.date || '').slice(0, 7); if (!k) return; if (!months[k]) months[k] = { inc: 0, exp: 0 }; months[k].inc += (parseFloat(r.amount) || 0); });
  allExp.forEach(r => { const k = (r.transaction_date || r.date || '').slice(0, 7); if (!k) return; if (!months[k]) months[k] = { inc: 0, exp: 0 }; months[k].exp += (parseFloat(r.amount) || 0); });
  const keys = Object.keys(months).sort().slice(-6);
  const canvas = el('adminChart');
  if (canvas._adminChart) canvas._adminChart.destroy();
  canvas._adminChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: keys.map(k => { const [y, m] = k.split('-'); return new Date(+y, +m - 1).toLocaleString('en', { month: 'short' }); }),
      datasets: [
        { label: 'Income', data: keys.map(k => months[k].inc), backgroundColor: '#10B981', borderRadius: 6 },
        { label: 'Expenses', data: keys.map(k => months[k].exp), backgroundColor: '#EF4444', borderRadius: 6 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => 'KES ' + fmtN(c.raw) } } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => 'KES ' + fmtN(v), font: { size: 10 } }, grid: { color: 'rgba(100,116,139,.1)' } } } }
  });
  el('admin-users').innerHTML = users.map(u => `
      <div class="tx-item" style="padding:13px 16px">
        <div class="tx-icon income" style="font-size:16px">👤</div>
        <div class="tx-details">
          <div class="tx-name">${esc(u.name || '—')} <span style="font-size:11px;padding:2px 8px;border-radius:6px;background:${u.role === 'admin' ? 'var(--primary)' : 'var(--gray-200)'};color:${u.role === 'admin' ? '#fff' : 'var(--text-muted)'};margin-left:4px">${u.role || 'user'}</span></div>
          <div class="tx-meta">${esc(u.email)} · Joined ${new Date(u.created_at).toLocaleDateString('en-KE')}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:12px;padding:3px 10px;border-radius:8px;background:${u.locked ? 'var(--danger-light)' : 'var(--success-light)'};color:${u.locked ? 'var(--danger)' : 'var(--success)'}">${u.locked ? 'Locked' : 'Active'}</span>
          ${u.id !== uid() ? `<button class="tx-del" style="opacity:1;background:${u.locked ? 'var(--success)' : 'var(--danger)'};color:#fff;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:600" onclick="adminToggleLock('${u.id}',${!u.locked}).then(()=>renderAdmin())">${u.locked ? 'Unlock' : 'Lock'}</button>` : ''}
        </div>
      </div>`
  ).join('') || '<div class="empty-state">No users found.</div>';
}

// ═══════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════
function openModal(type) {
  closeModal();
  const today = new Date().toISOString().split('T')[0];
  const map = {
    income: 'm-income', expense: 'm-expense', goal: 'm-goal',
    budget: 'm-budget', shop: 'm-shop', savings: 'm-savings',
    'savings-withdraw': 'm-savings-withdraw', 'savings-transfer': 'm-savings-transfer', 'savings-edit': 'm-savings-edit',
    'pin-setup': 'm-pin-setup',
    'profile-pic': 'm-profile-pic', todo: 'm-todo',
    loan: 'm-loan', 'loan-payment': 'm-loan-payment'
  };
  if (type === 'income') { const d = el('i-date'); if (d) d.value = today; }
  if (type === 'expense') { const d = el('e-date'); if (d) d.value = today; }
  if (type === 'savings') { const d = el('sv-date'); if (d) d.value = today; }
  if (type === 'savings-withdraw') { const d = el('sw-date'); if (d) d.value = today; }
  const modalId = map[type];
  if (!modalId) { console.warn('openModal: unknown type', type); return; }
  const modalEl = el(modalId);
  if (!modalEl) { console.warn('openModal: modal element not found for id', modalId); return; }
  modalEl.style.display = '';
  const overlay = el('modal-overlay');
  if (overlay) overlay.classList.add('open');
}

function closeModal() {
  el('modal-overlay').classList.remove('open');
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

function overlayClose(e) { if (e.target === el('modal-overlay')) closeModal(); }

// Escape key closes modal
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ═══════════════════════════════════════════════════════════
// PDF EXPORT — PRESERVED + ENHANCED WITH COMPANY DETAILS
// ═══════════════════════════════════════════════════════════
async function dlPDF(type, extraArg) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = 210, M = 14, CW = W - M * 2; let y = 0;
  const LOGO_TEXT = 'BTECH Track';

  function drawHeader() {
    // Brand green header
    doc.setFillColor(22, 101, 52); doc.rect(0, 0, W, 36, 'F');
    doc.setFillColor(139, 28, 28); doc.rect(0, 0, 5, 36, 'F');
    // White separator line
    doc.setFillColor(255, 255, 255); doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5); doc.line(0, 36, W, 36);
    // Logo as text (brand styled)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text('BTECH', M + 2, 14);
    doc.setFontSize(12); doc.setFont('helvetica', 'normal');
    doc.setTextColor(134, 239, 172);
    doc.text(' Track', M + 29, 14);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.setTextColor(255, 255, 255);
    doc.text('Financial Management System', M + 2, 20);
    // Right side info
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('btechtrack1@gmail.com  |  +254 112 887 428  |  Muratha Road, Nairobi KE', M + 2, 28);
    doc.setFontSize(7.5);
    doc.text('Generated: ' + new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' }), W - M, 21, { align: 'right' });
    const uname = currentProfile?.name || currentUser?.email?.split('@')[0] || 'User';
    doc.text('Prepared for: ' + uname, W - M, 28, { align: 'right' });
    doc.text('Confidential', W - M, 14, { align: 'right' });
    y = 44;
  }

  function tableRow(cols, data, rowIndex, color) {
    if (y > 270) { doc.addPage(); drawHeader(); y = 44; }
    if (rowIndex % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(M, y, CW, 7, 'F'); }
    doc.setDrawColor(226, 232, 240); doc.line(M, y + 7, M + CW, y + 7);
    doc.setTextColor(...(color || [30, 41, 59])); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    let x = M + 2;
    cols.forEach((c, i) => {
      const val = String(data[i] || ''); const maxW = c.w - 4;
      const txt = doc.getTextWidth(val) > maxW ? doc.splitTextToSize(val, maxW)[0] + '…' : val;
      doc.text(txt, c.right ? x + c.w - 2 : x, y + 5, { align: c.right ? 'right' : 'left' }); x += c.w;
    });
    y += 7;
  }

  function summaryBox(items) {
    const bw = CW / items.length;
    items.forEach((item, i) => {
      const bx = M + i * bw;
      doc.setFillColor(...(item.bg || [240, 244, 248])); doc.rect(bx, y, bw - 2, 18, 'F');
      doc.setTextColor(...(item.labelColor || [100, 116, 139])); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.text(item.label, bx + bw / 2 - 1, y + 6, { align: 'center' });
      doc.setTextColor(...(item.valColor || [15, 23, 42])); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text(item.value, bx + bw / 2 - 1, y + 14, { align: 'center' });
    }); y += 22;
  }

  function drawTitle(title, sub) {
    if (y > 260) { doc.addPage(); drawHeader(); }
    doc.setFillColor(238, 240, 255); doc.rect(M, y, CW, 12, 'F');
    doc.setDrawColor(108, 99, 255); doc.setLineWidth(0.6); doc.line(M, y, M, y + 12);
    doc.setTextColor(79, 70, 229); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(title, M + 4, y + 8);
    if (sub) {
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
      doc.text(sub, W - M, y + 8, { align: 'right' });
    }
    y += 16;
  }

  function tableHeader(cols) {
    if (y > 265) { doc.addPage(); drawHeader(); }
    doc.setFillColor(108, 99, 255); doc.rect(M, y, CW, 8, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    let x = M + 2;
    cols.forEach(c => {
      doc.text(c.label, c.right ? x + c.w - 2 : x, y + 5.5, { align: c.right ? 'right' : 'left' }); x += c.w;
    });
    y += 8;
  }

  function drawFooters() {
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFillColor(22, 101, 52); doc.rect(0, 283, W, 14, 'F');
      doc.setFillColor(139, 28, 28); doc.rect(0, 283, 4, 14, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.text('BTECH Track Financial System · btechtrack1@gmail.com · +254 112 887 428 · Muratha Road, Nairobi KE', M, 289);
      doc.text('Developed by Becam Aziz W. · Cloud-powered by Supabase · Confidential', M, 294);
      doc.text(`Page ${i} of ${pages}`, W - M, 291, { align: 'right' });
    }
  }

  drawHeader();
  const { income, expense, balance } = calcTotals();

  if (type === 'all' || type === 'transactions') {
    const all = [..._income.map(r => ({ ...r, type: 'income' })), ..._expenses.map(r => ({ ...r, type: 'expense' }))].sort((a, b) => new Date(b.transaction_date || b.date) - new Date(a.transaction_date || a.date));
    drawTitle('Financial Report — Transaction History', 'All time');
    summaryBox([
      { label: 'TOTAL INCOME', value: 'KES ' + fmtN(income), bg: [236, 253, 245], valColor: [16, 185, 129], labelColor: [6, 95, 70] },
      { label: 'TOTAL EXPENSES', value: 'KES ' + fmtN(expense), bg: [254, 242, 242], valColor: [239, 68, 68], labelColor: [153, 27, 27] },
      { label: 'NET BALANCE', value: 'KES ' + fmtN(balance), bg: [236, 253, 245], valColor: balance >= 0 ? [22, 101, 52] : [239, 68, 68], labelColor: [22, 101, 52] }
    ]);
    const cols = [{ label: 'DESCRIPTION', w: 62 }, { label: 'CATEGORY', w: 32 }, { label: 'DATE', w: 38 }, { label: 'TYPE', w: 22 }, { label: 'AMOUNT (KES)', w: CW - 154, right: true }];
    tableHeader(cols);
    all.forEach((t, i) => {
      const isInc = t.type === 'income';
      tableRow(cols, [t.description || t.desc, t.category || t.cat || '', fmtDate(t.transaction_date || t.date), isInc ? 'Income' : 'Expense', (isInc ? '+' : '-') + fmtN(t.amount)], i, isInc ? [16, 185, 129] : [239, 68, 68]);
    });
  }

  if (type === 'all' && _savings.length) {
    y += 8;
    const savTotal = computeSavingsTotals().net;
    drawTitle('Savings Summary', '');
    summaryBox([{ label: 'NET SAVINGS', value: 'KES ' + fmtN(savTotal), bg: [243, 232, 255], valColor: [139, 92, 246], labelColor: [109, 40, 217] }]);
    const scols = [{ label: 'DESCRIPTION', w: 55 }, { label: 'CATEGORY', w: 32 }, { label: 'DATE', w: 34 }, { label: 'TYPE', w: 22 }, { label: 'AMOUNT (KES)', w: CW - 143, right: true }];
    tableHeader(scols);
    _savings.forEach((s, i) => tableRow(scols, [s.description, s.category || 'General', fmtDate(s.transaction_date || s.date), (s.type || 'deposit'), (signedSavingsAmount(s) < 0 ? '-' : '+') + fmtN(s.amount)], i, [139, 92, 246]));
  }

  if (type === 'goals') {
    drawTitle('Goals & Progress Report', new Date().toLocaleDateString('en-KE', { month: 'long', year: 'numeric' }));
    const cols = [{ label: 'GOAL NAME', w: 65 }, { label: 'SAVED (KES)', w: 40, right: true }, { label: 'TARGET (KES)', w: 42, right: true }, { label: 'REMAINING (KES)', w: 45, right: true }, { label: 'PROGRESS', w: CW - 192, right: true }];
    tableHeader(cols);
    _goals.forEach((g, i) => {
      const pct = g.target > 0 ? Math.min(100, Math.round((+g.saved / +g.target) * 100)) : 0;
      const rem = Math.max(0, +g.target - +g.saved);
      const col = pct >= 100 ? [16, 185, 129] : pct >= 50 ? [79, 70, 229] : [245, 158, 11];
      tableRow(cols, [g.name, fmtN(g.saved), fmtN(g.target), fmtN(rem), pct + '%'], i, col);
    });
    if (!_goals.length) { doc.setTextColor(100, 116, 139); doc.setFontSize(9); doc.text('No goals recorded yet.', M, y + 8); y += 12; }
  }

  if (type === 'budget' || type === 'weekly') {
    const period = type === 'weekly' ? 'weekly' : 'monthly';
    const items = _budgets.filter(b => b.period === period);
    drawTitle((type === 'weekly' ? 'Weekly' : 'Monthly') + ' Budget Report', new Date().toLocaleDateString('en-KE', { month: 'long', year: 'numeric' }));
    const total = items.reduce((s, b) => s + +b.planned, 0);
    summaryBox([
      { label: 'TOTAL BUDGETED', value: 'KES ' + fmtN(total), bg: [238, 240, 248], valColor: [79, 70, 229], labelColor: [79, 70, 229] },
      { label: 'BUDGET ITEMS', value: String(items.length), bg: [240, 244, 248], valColor: [15, 23, 42], labelColor: [100, 116, 139] }
    ]);
    const cols = [{ label: 'CATEGORY', w: 80 }, { label: 'PERIOD', w: 40 }, { label: 'PLANNED AMOUNT (KES)', w: CW - 120, right: true }];
    tableHeader(cols);
    items.forEach((b, i) => tableRow(cols, [b.category, b.period.charAt(0).toUpperCase() + b.period.slice(1), fmtN(b.planned)], i));
    if (!items.length) { doc.setTextColor(100, 116, 139); doc.setFontSize(9); doc.text('No budget items recorded.', M, y + 8); y += 12; }
  }

  if (type === 'shopping') {
    const total = _shopping.reduce((s, i) => s + +i.cost, 0);
    const bought = _shopping.filter(i => i.done).reduce((s, i) => s + +i.cost, 0);
    drawTitle('Shopping List', new Date().toLocaleDateString('en-KE', { month: 'long', year: 'numeric' }));
    summaryBox([
      { label: 'TOTAL COST', value: 'KES ' + fmtN(total), bg: [240, 244, 248], valColor: [15, 23, 42], labelColor: [100, 116, 139] },
      { label: 'PURCHASED', value: 'KES ' + fmtN(bought), bg: [236, 253, 245], valColor: [16, 185, 129], labelColor: [6, 95, 70] },
      { label: 'REMAINING', value: 'KES ' + fmtN(total - bought), bg: [254, 242, 242], valColor: [239, 68, 68], labelColor: [153, 27, 27] }
    ]);
    const cols = [{ label: 'ITEM', w: 65 }, { label: 'QTY', w: 30 }, { label: 'STATUS', w: 35 }, { label: 'COST (KES)', w: CW - 130, right: true }];
    tableHeader(cols);
    _shopping.forEach((s, i) => tableRow(cols, [s.name, s.qty || '', s.done ? 'Purchased' : 'Pending', fmtN(s.cost)], i, s.done ? [16, 185, 129] : [30, 41, 59]));
    if (!_shopping.length) { doc.setTextColor(100, 116, 139); doc.setFontSize(9); doc.text('Shopping list is empty.', M, y + 8); y += 12; }
  }

  if (type === 'admin' && isAdmin()) {
    const users = await adminFetchAllUsers();
    drawTitle('Admin Report — Registered Users', new Date().toLocaleDateString('en-KE', { month: 'long', year: 'numeric' }));
    summaryBox([
      { label: 'TOTAL USERS', value: String(users.length), bg: [238, 240, 248], valColor: [79, 70, 229], labelColor: [79, 70, 229] },
      { label: 'ACTIVE', value: String(users.filter(u => !u.locked).length), bg: [236, 253, 245], valColor: [16, 185, 129], labelColor: [6, 95, 70] },
      { label: 'LOCKED', value: String(users.filter(u => u.locked).length), bg: [254, 242, 242], valColor: [239, 68, 68], labelColor: [153, 27, 27] }
    ]);
    const cols = [{ label: 'NAME', w: 55 }, { label: 'EMAIL', w: 75 }, { label: 'ROLE', w: 28 }, { label: 'JOINED', w: 38 }, { label: 'STATUS', w: CW - 196, right: true }];
    tableHeader(cols);
    users.forEach((u, i) => tableRow(cols, [u.name || '', u.email, u.role, new Date(u.created_at).toLocaleDateString('en-KE'), u.locked ? 'Locked' : 'Active'], i, u.locked ? [239, 68, 68] : [16, 185, 129]));
  }

  if (type === 'savings') {
    const svTotals = computeSavingsTotals();
    drawTitle('Savings Report', new Date().toLocaleDateString('en-KE', { month: 'long', year: 'numeric' }));
    summaryBox([
      { label: 'NET SAVINGS', value: 'KES ' + fmtN(svTotals.net), bg: [243, 232, 255], valColor: [139, 92, 246], labelColor: [109, 40, 217] },
      { label: 'TOTAL SAVED', value: 'KES ' + fmtN(svTotals.totalDeposits), bg: [236, 253, 245], valColor: [16, 185, 129], labelColor: [6, 95, 70] },
      { label: 'TOTAL WITHDRAWN', value: 'KES ' + fmtN(svTotals.totalWithdrawn), bg: [254, 242, 242], valColor: [239, 68, 68], labelColor: [153, 27, 27] }
    ]);
    const cols = [{ label: 'DESCRIPTION', w: 55 }, { label: 'CATEGORY', w: 32 }, { label: 'DATE', w: 34 }, { label: 'TYPE', w: 22 }, { label: 'AMOUNT (KES)', w: CW - 143, right: true }];
    tableHeader(cols);
    _savings.forEach((s, i) => tableRow(cols, [s.description, s.category || 'General', fmtDate(s.transaction_date || s.date), (s.type || 'deposit'), (signedSavingsAmount(s) < 0 ? '-' : '+') + fmtN(s.amount)], i, [139, 92, 246]));
    if (!_savings.length) { doc.setTextColor(100, 116, 139); doc.setFontSize(9); doc.text('No savings recorded yet.', M, y + 8); y += 12; }
  }

  // ── TODO PDF ──────────────────────────────────────────────────
  if (type === 'todo' || type === 'all') {
    if (type === 'all' && _todos.length) y += 8;
    drawTitle('To-Do List & Task Manager', new Date().toLocaleDateString('en-KE', { month: 'long', year: 'numeric' }));
    const today2 = new Date().toISOString().split('T')[0];
    const total2 = _todos.length;
    const done2 = _todos.filter(t => t.completed).length;
    const overdue2 = _todos.filter(t => !t.completed && t.due_date && t.due_date < today2).length;
    const pending2 = total2 - done2;
    summaryBox([
      { label: 'TOTAL TASKS', value: String(total2), bg: [238, 240, 255], valColor: [79, 70, 229], labelColor: [79, 70, 229] },
      { label: 'COMPLETED', value: String(done2), bg: [236, 253, 245], valColor: [16, 185, 129], labelColor: [6, 95, 70] },
      { label: 'PENDING', value: String(pending2), bg: [255, 251, 235], valColor: [245, 158, 11], labelColor: [146, 64, 14] },
      { label: 'OVERDUE', value: String(overdue2), bg: [254, 242, 242], valColor: [239, 68, 68], labelColor: [153, 27, 27] }
    ]);
    const tcols = [
      { label: 'TASK TITLE', w: 60 },
      { label: 'TYPE', w: 22 },
      { label: 'PRIORITY', w: 22 },
      { label: 'CATEGORY', w: 32 },
      { label: 'DUE DATE', w: 32 },
      { label: 'STATUS', w: CW - 168, right: true }
    ];
    tableHeader(tcols);
    const sorted = [..._todos].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const p = { high: 0, medium: 1, low: 2 };
      return (p[a.priority] || 1) - (p[b.priority] || 1);
    });
    sorted.forEach((t, i) => {
      const isOverdue2 = !t.completed && t.due_date && t.due_date < today2;
      const col2 = t.completed ? [16, 185, 129] : isOverdue2 ? [239, 68, 68] : t.priority === 'high' ? [245, 158, 11] : [79, 70, 229];
      const status = t.completed ? '✓ Done' : isOverdue2 ? '! Overdue' : 'Pending';
      tableRow(tcols, [t.title || '', t.type || '', t.priority || 'medium', t.category || '', t.due_date ? fmtDate(t.due_date) : '—', status], i, col2);
      if (t.description) {
        if (y > 270) { doc.addPage(); drawHeader(); y = 44; }
        doc.setTextColor(100, 116, 139); doc.setFontSize(7); doc.setFont('helvetica', 'italic');
        doc.text('  → ' + String(t.description).slice(0, 110), M + 4, y + 3);
        y += 5;
      }
    });
    if (!_todos.length) { doc.setTextColor(100, 116, 139); doc.setFontSize(9); doc.text('No tasks recorded yet.', M, y + 8); y += 12; }
  }

  // ══ LOAN — SINGLE STATEMENT ══════════════════════════════════
  if (type === 'loan-single' && extraArg) {
    const loan = _loans.find(l => String(l.id) === String(extraArg));
    if (!loan) { showToast('Loan not found', 'danger'); return; }
    const principal = parseFloat(loan.amount) || 0;
    const paid = parseFloat(loan.amount_paid) || 0;
    const remaining = Math.max(0, principal - paid);
    const pct = principal > 0 ? Math.min(100, Math.round((paid / principal) * 100)) : 0;
    const status = getLoanStatus(loan);
    const isBorrowed = loan.type === 'borrowed';
    const uname = currentProfile?.name || currentUser?.email?.split('@')[0] || 'User';

    // Dark green statement header stripe
    doc.setFillColor(11, 110, 79); doc.rect(0, 0, W, 52, 'F');
    doc.setFillColor(122, 30, 30); doc.rect(0, 0, 5, 52, 'F');
    doc.setFillColor(212, 175, 55); doc.rect(0, 50, W, 2, 'F');

    // Logo
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20); doc.setFont('helvetica', 'bold');
    doc.text('BTECH', M + 2, 16);
    doc.setFontSize(13); doc.setFont('helvetica', 'normal');
    doc.setTextColor(212, 175, 55);
    doc.text(' Track', M + 31, 16);

    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 240, 200);
    doc.text('Financial Management System · Nairobi, Kenya', M + 2, 24);
    doc.setTextColor(255, 255, 255);
    doc.text('btechtrack1@gmail.com  ·  +254 112 887 428', M + 2, 32);

    // Statement type badge
    doc.setFillColor(212, 175, 55); doc.roundedRect(W - M - 46, 10, 46, 14, 3, 3, 'F');
    doc.setTextColor(15, 17, 23); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
    doc.text('LOAN STATEMENT', W - M - 23, 18.5, { align: 'center' });

    doc.setTextColor(200, 220, 200); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text('Prepared for: ' + uname, W - M, 32, { align: 'right' });
    doc.text('Generated: ' + new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' }), W - M, 40, { align: 'right' });
    doc.text('Confidential', W - M, 48, { align: 'right' });

    y = 62;

    // Loan title
    doc.setFillColor(240, 244, 250); doc.rect(M, y, CW, 14, 'F');
    doc.setDrawColor(11, 110, 79); doc.setLineWidth(0.8); doc.line(M, y, M, y + 14);
    doc.setTextColor(15, 23, 42); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(loan.title || 'Unnamed Loan', M + 5, y + 9.5);
    const badgeColor = isBorrowed ? [122, 30, 30] : [11, 110, 79];
    doc.setFillColor(...badgeColor); doc.roundedRect(W - M - 30, y + 2, 30, 10, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text(isBorrowed ? 'BORROWED' : 'LENT', W - M - 15, y + 8.5, { align: 'center' });
    y += 22;

    // Summary boxes
    const boxes = [
      { label: 'PRINCIPAL', value: fmt(principal), bg: [240, 244, 248], val: [15, 23, 42], lbl: [100, 116, 139] },
      { label: 'AMOUNT PAID', value: fmt(paid), bg: [236, 253, 245], val: [11, 110, 79], lbl: [6, 95, 70] },
      { label: 'OUTSTANDING', value: fmt(remaining), bg: [254, 242, 242], val: [122, 30, 30], lbl: [153, 27, 27] },
      { label: 'REPAID', value: pct + '%', bg: [255, 251, 235], val: [180, 100, 0], lbl: [146, 64, 14] }
    ];
    const bw = CW / 4;
    boxes.forEach((b, i) => {
      const bx = M + i * bw;
      doc.setFillColor(...b.bg); doc.rect(bx, y, bw - 2, 22, 'F');
      doc.setTextColor(...b.lbl); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
      doc.text(b.label, bx + (bw - 2) / 2, y + 7, { align: 'center' });
      doc.setTextColor(...b.val); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text(b.value, bx + (bw - 2) / 2, y + 16.5, { align: 'center' });
    });
    y += 28;

    // Progress bar
    doc.setFillColor(226, 232, 240); doc.roundedRect(M, y, CW, 5, 2, 2, 'F');
    const progColor = pct >= 100 ? [11, 110, 79] : pct >= 60 ? [11, 110, 79] : pct >= 30 ? [245, 158, 11] : [122, 30, 30];
    doc.setFillColor(...progColor); doc.roundedRect(M, y, CW * pct / 100, 5, 2, 2, 'F');
    doc.setTextColor(100, 116, 139); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(pct + '% repaid', W - M, y + 4, { align: 'right' });
    y += 14;

    // Detail table
    const detailRows = [
      ['Loan Type', isBorrowed ? 'Borrowed (I owe)' : 'Lent (They owe me)'],
      ['Counterparty', loan.person || '—'],
      ['Category', loan.category || '—'],
      ['Interest Rate', loan.interest_rate ? loan.interest_rate + '%' : 'None'],
      ['Due Date', loan.due_date ? fmtDate(loan.due_date) : '—'],
      ['Status', status.charAt(0).toUpperCase() + status.slice(1)],
      ['Notes', loan.notes || '—']
    ];
    doc.setFillColor(15, 23, 42); doc.rect(M, y, CW, 9, 'F');
    doc.setTextColor(212, 175, 55); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('LOAN DETAILS', M + 4, y + 6);
    y += 9;
    detailRows.forEach((row, i) => {
      if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(M, y, CW, 8, 'F'); }
      doc.setTextColor(100, 116, 139); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(row[0], M + 3, y + 5.5);
      doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold');
      doc.text(String(row[1]).slice(0, 80), M + 60, y + 5.5);
      y += 8;
    });
    y += 8;

    // Payment history
    const payments = await fetchLoanPayments(loan.id);
    doc.setFillColor(11, 110, 79); doc.rect(M, y, CW, 9, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('PAYMENT HISTORY (' + payments.length + ' records)', M + 4, y + 6);
    y += 9;
    if (!payments.length) {
      doc.setFillColor(248, 250, 252); doc.rect(M, y, CW, 8, 'F');
      doc.setTextColor(100, 116, 139); doc.setFontSize(8); doc.setFont('helvetica', 'italic');
      doc.text('No payments recorded yet.', M + 3, y + 5.5);
      y += 8;
    } else {
      const pcols = [{ label: 'DATE', w: 45 }, { label: 'NOTES', w: CW - 85 }, { label: 'AMOUNT', w: 40, right: true }];
      doc.setFillColor(30, 41, 59); doc.rect(M, y, CW, 8, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
      let px = M + 2;
      pcols.forEach(c => { doc.text(c.label, c.right ? px + c.w - 2 : px, y + 5.5, { align: c.right ? 'right' : 'left' }); px += c.w; });
      y += 8;
      payments.forEach((p, i) => {
        if (y > 270) { doc.addPage(); y = 20; }
        if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(M, y, CW, 7, 'F'); }
        doc.setDrawColor(226, 232, 240); doc.line(M, y + 7, M + CW, y + 7);
        doc.setTextColor(15, 23, 42); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        px = M + 2;
        const pdata = [fmtDate(p.payment_date), p.notes || 'Payment', '+' + fmt(p.amount)];
        pcols.forEach((c, ci) => {
          const v = String(pdata[ci] || ''); const txt = doc.getTextWidth(v) > c.w - 4 ? doc.splitTextToSize(v, c.w - 4)[0] + '…' : v;
          const _pc = ci === 2 ? [11, 110, 79] : [15, 23, 42]; doc.setTextColor(_pc[0], _pc[1], _pc[2]); doc.text(txt, c.right ? px + c.w - 2 : px, y + 5, { align: c.right ? 'right' : 'left' }); px += c.w;
        });
        y += 7;
      });
    }
  }

  // ══ LOANS — ALL LOANS REPORT ══════════════════════════════════
  if (type === 'loans-all') {
    const borrowed = _loans.filter(l => l.type === 'borrowed');
    const lent = _loans.filter(l => l.type === 'lent');
    const totalBorrowed = borrowed.reduce((s, l) => s + parseFloat(l.amount || 0), 0);
    const totalLent = lent.reduce((s, l) => s + parseFloat(l.amount || 0), 0);
    const totalPaid = _loans.reduce((s, l) => s + parseFloat(l.amount_paid || 0), 0);
    const totalDebt = _loans.reduce((s, l) => s + Math.max(0, parseFloat(l.amount || 0) - parseFloat(l.amount_paid || 0)), 0);
    const active = _loans.filter(l => getLoanStatus(l) === 'active').length;
    const overdue = _loans.filter(l => getLoanStatus(l) === 'overdue').length;
    const completed = _loans.filter(l => getLoanStatus(l) === 'completed').length;

    drawTitle('Loan Portfolio Statement', new Date().toLocaleDateString('en-KE', { month: 'long', year: 'numeric' }));

    // Summary row 1
    summaryBox([
      { label: 'TOTAL BORROWED', value: fmt(totalBorrowed), bg: [254, 242, 242], val: [122, 30, 30], lbl: [153, 27, 27], valColor: [122, 30, 30], labelColor: [153, 27, 27] },
      { label: 'TOTAL LENT', value: fmt(totalLent), bg: [236, 253, 245], val: [11, 110, 79], lbl: [6, 95, 70], valColor: [11, 110, 79], labelColor: [6, 95, 70] },
      { label: 'TOTAL PAID', value: fmt(totalPaid), bg: [240, 244, 248], val: [79, 70, 229], lbl: [79, 70, 229], valColor: [79, 70, 229], labelColor: [79, 70, 229] },
      { label: 'OUTSTANDING', value: fmt(totalDebt), bg: [255, 251, 235], val: [180, 100, 0], lbl: [146, 64, 14], valColor: [180, 100, 0], labelColor: [146, 64, 14] }
    ]);
    summaryBox([
      { label: 'ACTIVE LOANS', value: String(active), bg: [236, 253, 245], valColor: [11, 110, 79], labelColor: [6, 95, 70] },
      { label: 'OVERDUE', value: String(overdue), bg: [254, 242, 242], valColor: [122, 30, 30], labelColor: [153, 27, 27] },
      { label: 'COMPLETED', value: String(completed), bg: [240, 244, 248], valColor: [79, 70, 229], labelColor: [79, 70, 229] },
      { label: 'TOTAL LOANS', value: String(_loans.length), bg: [240, 244, 248], valColor: [15, 23, 42], labelColor: [100, 116, 139] }
    ]);

    // Loans table
    const lcols = [
      { label: 'TITLE', w: 44 },
      { label: 'TYPE', w: 22 },
      { label: 'PERSON', w: 30 },
      { label: 'PRINCIPAL', w: 30, right: true },
      { label: 'PAID', w: 28, right: true },
      { label: 'REMAINING', w: 28, right: true },
      { label: 'STATUS', w: CW - 182 }
    ];

    // ── Borrowed ──
    if (borrowed.length) {
      y += 4;
      doc.setFillColor(122, 30, 30); doc.rect(M, y, CW, 9, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text('BORROWED LOANS (' + borrowed.length + ')', M + 4, y + 6); y += 9;
      tableHeader(lcols);
      borrowed.forEach((loan, i) => {
        const p = parseFloat(loan.amount || 0); const pd = parseFloat(loan.amount_paid || 0); const rem = Math.max(0, p - pd);
        const st = getLoanStatus(loan);
        const col = st === 'overdue' ? [122, 30, 30] : st === 'completed' ? [11, 110, 79] : [15, 23, 42];
        tableRow(lcols, [loan.title || '—', loan.type, loan.person || '—', fmt(p), fmt(pd), fmt(rem), st.charAt(0).toUpperCase() + st.slice(1)], i, col);
      });
    }

    // ── Lent ──
    if (lent.length) {
      y += 8;
      doc.setFillColor(11, 110, 79); doc.rect(M, y, CW, 9, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text('LENT LOANS (' + lent.length + ')', M + 4, y + 6); y += 9;
      tableHeader(lcols);
      lent.forEach((loan, i) => {
        const p = parseFloat(loan.amount || 0); const pd = parseFloat(loan.amount_paid || 0); const rem = Math.max(0, p - pd);
        const st = getLoanStatus(loan);
        const col = st === 'overdue' ? [122, 30, 30] : st === 'completed' ? [11, 110, 79] : [15, 23, 42];
        tableRow(lcols, [loan.title || '—', loan.type, loan.person || '—', fmt(p), fmt(pd), fmt(rem), st.charAt(0).toUpperCase() + st.slice(1)], i, col);
      });
    }

    // ── Per-loan payment histories ──
    y += 12;
    doc.addPage(); drawHeader(); y = 44;
    doc.setFillColor(15, 23, 42); doc.rect(M, y, CW, 11, 'F');
    doc.setTextColor(212, 175, 55); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('DETAILED PAYMENT HISTORY', M + 4, y + 7.5); y += 15;

    for (const loan of _loans) {
      if (y > 250) { doc.addPage(); drawHeader(); y = 44; }
      const principal2 = parseFloat(loan.amount || 0);
      const paid2 = parseFloat(loan.amount_paid || 0);
      const remaining2 = Math.max(0, principal2 - paid2);
      const status2 = getLoanStatus(loan);
      const hdrColor = loan.type === 'borrowed' ? [122, 30, 30] : [11, 110, 79];
      doc.setFillColor(...hdrColor); doc.rect(M, y, CW, 9, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text((loan.title || 'Unnamed') + ' — ' + (loan.person || '—') + ' — Principal: ' + fmt(principal2) + ' | Paid: ' + fmt(paid2) + ' | Balance: ' + fmt(remaining2), M + 3, y + 6);
      y += 9;
      const lPayments = await fetchLoanPayments(loan.id);
      if (!lPayments.length) {
        doc.setFillColor(248, 250, 252); doc.rect(M, y, CW, 7, 'F');
        doc.setTextColor(100, 116, 139); doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
        doc.text('No payments recorded.', M + 4, y + 5); y += 9;
      } else {
        const hcols = [{ label: 'DATE', w: 42 }, { label: 'NOTES', w: CW - 82 }, { label: 'AMOUNT', w: 40, right: true }];
        doc.setFillColor(30, 41, 59); doc.rect(M, y, CW, 7, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
        let hx = M + 2; hcols.forEach(c => { doc.text(c.label, c.right ? hx + c.w - 2 : hx, y + 5, { align: c.right ? 'right' : 'left' }); hx += c.w; }); y += 7;
        lPayments.forEach((p2, pi) => {
          if (y > 272) { doc.addPage(); drawHeader(); y = 44; }
          if (pi % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(M, y, CW, 7, 'F'); }
          doc.setDrawColor(226, 232, 240); doc.line(M, y + 7, M + CW, y + 7);
          doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
          let rx = M + 2;
          [[fmtDate(p2.payment_date), false], [p2.notes || 'Payment', false], ['+' + fmt(p2.amount), true]].forEach(([v, isR], ci) => {
            const col2 = ci === 2 ? [11, 110, 79] : [15, 23, 42];
            doc.setTextColor(col2[0], col2[1], col2[2]); const tw = hcols[ci].w - 4; const sv = String(v); const tt = doc.getTextWidth(sv) > tw ? doc.splitTextToSize(sv, tw)[0] + '…' : sv;
            doc.text(tt, isR ? rx + hcols[ci].w - 2 : rx, y + 5, { align: isR ? 'right' : 'left' }); rx += hcols[ci].w;
          }); y += 7;
        });
      }
      y += 6;
    }
  }

  drawFooters();
  const names = { all: 'full-report', transactions: 'transactions', goals: 'goals', budget: 'monthly-budget', weekly: 'weekly-budget', shopping: 'shopping-list', admin: 'admin-users', savings: 'savings', todo: 'todo-list', 'loans-all': 'loans-portfolio', 'loan-single': 'loan-statement' };
  // Meaningful filename: include loan id for single statements
  const _dateStr = new Date().toISOString().slice(0, 10);
  const _fname = (type === 'loan-single' && extraArg)
    ? `loan_statement_${String(extraArg)}_${_dateStr}.pdf`
    : `btech-track-${names[type] || type}-${_dateStr}.pdf`;
  doc.save(_fname);
}


// ═══════════════════════════════════════════════════════════
// PROFILE PICTURE SYSTEM
// ═══════════════════════════════════════════════════════════
const STORAGE_BUCKET = 'avatars';
let _pendingPicFile = null;

function applyProfilePic(url) {
  // Apply to all avatar elements
  const avatarIds = ['topbar-avatar', 'sidebar-avatar-text', 'dropdown-avatar', 'pic-preview'];
  avatarIds.forEach(id => {
    const el_ = el(id);
    if (!el_) return;
    if (id === 'pic-preview') {
      el_.innerHTML = url ? '<img src="' + url + '?t=' + Date.now() + '" class="avatar-img" onerror="this.parentElement.textContent=\'U\'">' : (currentProfile?.name?.charAt(0).toUpperCase() || 'U');
    } else {
      if (url) {
        el_.innerHTML = '<img src="' + url + '?t=' + Date.now() + '" class="avatar-img" onerror="this.textContent=this.dataset.init;this.innerHTML=\'\'">';
        el_.dataset.init = currentProfile?.name?.charAt(0).toUpperCase() || 'U';
      } else {
        el_.innerHTML = '';
        el_.textContent = currentProfile?.name?.charAt(0).toUpperCase() || 'U';
      }
    }
  });
}

function openProfilePicModal() {
  _pendingPicFile = null;
  const uploadBtn = el('btn-upload-pic');
  const progressBar = el('upload-progress-bar');
  const progressFill = el('upload-progress-fill');
  if (uploadBtn) uploadBtn.disabled = true;
  if (progressBar) progressBar.style.display = 'none';
  if (progressFill) progressFill.style.width = '0%';
  // Show current pic in preview
  if (typeof applyProfilePic === 'function') {
    applyProfilePic(currentProfile?.avatar_url || null);
  }
  openModal('profile-pic');
}

function handlePicSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  processPicFile(file);
}

function handlePicDrop(event) {
  event.preventDefault();
  el('upload-area').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (!file) return;
  processPicFile(file);
}

function processPicFile(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    showToast('Only JPG, PNG, and WEBP images are allowed.', 'danger'); return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showToast('Image must be smaller than 2MB.', 'danger'); return;
  }
  _pendingPicFile = file;
  // Preview
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = el('pic-preview');
    if (preview) preview.innerHTML = '<img src="' + e.target.result + '" class="avatar-img">';
  };
  reader.readAsDataURL(file);
  el('btn-upload-pic').disabled = false;
}

async function uploadProfilePic() {
  if (!_pendingPicFile) return;
  if (!currentUser) { showToast('You must be logged in to upload.', 'danger'); return; }
  setBtn('btn-upload-pic', true, 'Uploading...');
  el('upload-progress-bar').style.display = 'block';
  // Animate progress
  let prog = 0;
  const progInterval = setInterval(() => {
    prog = Math.min(prog + 10, 85);
    el('upload-progress-fill').style.width = prog + '%';
  }, 150);
  try {
    const ext = _pendingPicFile.name.split('.').pop();
    const filePath = currentUser.id + '/avatar.' + ext;
    const { error: uploadErr } = await _sb.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, _pendingPicFile, { upsert: true, contentType: _pendingPicFile.type });
    clearInterval(progInterval);
    if (uploadErr) throw uploadErr;
    el('upload-progress-fill').style.width = '95%';
    // Get public URL
    const { data: urlData } = _sb.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    const avatarUrl = urlData.publicUrl;
    // Save to profile — use update first, fallback to upsert
    try {
      const profileData = {
        id: currentUser.id,
        avatar_url: avatarUrl,
        name: currentProfile?.name || currentUser.email.split('@')[0],
        email: currentUser.email,
        updated_at: new Date().toISOString()
      };
      const { error: updateErr } = await _sb.from('profiles').upsert(profileData, { onConflict: 'id' });
      if (updateErr) console.warn('Profile save:', updateErr);
    } catch (e) { console.warn('Profile upsert:', e); }
    if (currentProfile) currentProfile.avatar_url = avatarUrl;
    el('upload-progress-fill').style.width = '100%';
    setTimeout(() => { el('upload-progress-bar').style.display = 'none'; }, 600);
    applyProfilePic(avatarUrl);
    setBtn('btn-upload-pic', false, 'Upload Photo');
    closeModal();
    showToast('Profile photo updated successfully!', 'success');
  } catch (err) {
    clearInterval(progInterval);
    el('upload-progress-bar').style.display = 'none';
    setBtn('btn-upload-pic', false, 'Upload Photo');
    let msg = err.message || 'Upload failed.';
    if (msg.includes('Bucket not found') || msg.includes('not found')) {
      msg = 'Storage bucket not set up. Please create an "avatars" bucket in Supabase Storage with public access.';
    }
    showToast(msg, 'danger');
  }
}

async function removeProfilePic() {
  if (!currentUser || !currentProfile?.avatar_url) { showToast('No profile photo to remove.', 'info'); return; }
  if (!confirm('Remove your profile photo?')) return;
  try {
    await _sb.from('profiles').update({ avatar_url: null }).eq('id', currentUser.id);
    if (currentProfile) currentProfile.avatar_url = null;
    applyProfilePic(null);
    closeModal();
    showToast('Profile photo removed.', 'success');
  } catch (e) {
    showToast('Failed to remove photo: ' + e.message, 'danger');
  }
}

// ═══════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLER
// ═══════════════════════════════════════════════════════════
window.addEventListener('unhandledrejection', (e) => {
  console.warn('Unhandled promise rejection:', e.reason);
});


// ═══════════════════════════════════════════════════════════
// LOANS SYSTEM
// ═══════════════════════════════════════════════════════════
const STORAGE_BUCKET_LOANS = 'loan-payments';
let _loans = [], _loanPayments = [], _loanFilter = 'all';
let _loanEditId = null;

// Supabase loan helpers
async function fetchLoans() {
  if (_demoMode) return _demoData.loans || [];
  try {
    const { data } = await _sb.from('loans').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    return data || [];
  } catch (e) { return []; }
}
async function fetchLoanPayments(loanId) {
  if (_demoMode) return (_demoData.loanPayments || []).filter(p => p.loan_id === loanId);
  try {
    const { data } = await _sb.from('loan_payments').select('*').eq('loan_id', loanId).order('payment_date', { ascending: false });
    return data || [];
  } catch (e) { return []; }
}
async function saveLoan(loan) {
  if (_demoMode) {
    if (loan.id) {
      _demoData.loans = (_demoData.loans || []).map(l => l.id === loan.id ? { ...l, ...loan } : l);
    } else {
      loan.id = String(_demoData.nextId++);
      loan.user_id = 'demo';
      loan.created_at = new Date().toISOString();
      _demoData.loans = [...(_demoData.loans || []), loan];
    }
    return true;
  }
  try {
    if (loan.id) {
      const { error } = await _sb.from('loans').update(loan).eq('id', loan.id).eq('user_id', currentUser.id);
      return !error;
    } else {
      loan.user_id = currentUser.id;
      const { error } = await _sb.from('loans').insert(loan);
      return !error;
    }
  } catch (e) { return false; }
}
async function deleteLoan(id) {
  if (_demoMode) { _demoData.loans = (_demoData.loans || []).filter(l => l.id !== id); return true; }
  try { const { error } = await _sb.from('loans').delete().eq('id', id).eq('user_id', currentUser.id); return !error; } catch (e) { return false; }
}
async function savePayment(payment) {
  if (_demoMode) {
    payment.id = String(_demoData.nextId++);
    payment.created_at = new Date().toISOString();
    _demoData.loanPayments = [...(_demoData.loanPayments || []), payment];
    // Update loan paid amount
    const loan = (_demoData.loans || []).find(l => l.id === payment.loan_id);
    if (loan) { loan.amount_paid = (parseFloat(loan.amount_paid) || 0) + parseFloat(payment.amount); }
    return true;
  }
  try {
    payment.user_id = currentUser.id;
    const { error } = await _sb.from('loan_payments').insert(payment);
    if (!error) {
      // Update loan amount_paid
      const loan = _loans.find(l => l.id === payment.loan_id);
      if (loan) {
        const newPaid = (parseFloat(loan.amount_paid) || 0) + parseFloat(payment.amount);
        await _sb.from('loans').update({ amount_paid: newPaid }).eq('id', payment.loan_id);
      }
    }
    return !error;
  } catch (e) { return false; }
}

function getLoanStatus(loan) {
  const principal = parseFloat(loan.amount) || 0;
  const paid = parseFloat(loan.amount_paid) || 0;
  if (paid >= principal) return 'completed';
  if (loan.due_date && new Date(loan.due_date) < new Date()) return 'overdue';
  return 'active';
}

function setLoanFilter(f, btn) {
  _loanFilter = f;
  document.querySelectorAll('#page-loans .todo-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderLoans();
}

async function renderLoans() {
  _loans = await fetchLoans();
  // Analytics
  const borrowed = _loans.filter(l => l.type === 'borrowed');
  const lent = _loans.filter(l => l.type === 'lent');
  const totalBorrowed = borrowed.reduce((s, l) => s + parseFloat(l.amount || 0), 0);
  const totalLent = lent.reduce((s, l) => s + parseFloat(l.amount || 0), 0);
  const totalDebt = borrowed.reduce((s, l) => s + Math.max(0, parseFloat(l.amount || 0) - parseFloat(l.amount_paid || 0)), 0);
  const totalRecovered = lent.reduce((s, l) => s + parseFloat(l.amount_paid || 0), 0);
  const activeCount = _loans.filter(l => getLoanStatus(l) === 'active').length;

  el('loan-analytics-cards').innerHTML = `
            <div class="stat-card stat-expense">
                <div class="stat-card-stripe"></div>
                <div class="stat-card-icon-wrap"><i class="fa-solid fa-arrow-trend-down" style="color:#EF4444;font-size:20px"></i></div>
                <div class="stat-card-label">Total Borrowed</div>
                <div class="stat-card-value" style="color:#EF4444!important">${fmt(totalBorrowed)}</div>
                <div class="stat-card-sub">${borrowed.length} loans</div>
            </div>
            <div class="stat-card stat-income">
                <div class="stat-card-stripe"></div>
                <div class="stat-card-icon-wrap"><i class="fa-solid fa-arrow-trend-up" style="color:#10B981;font-size:20px"></i></div>
                <div class="stat-card-label">Total Lent</div>
                <div class="stat-card-value" style="color:#10B981!important">${fmt(totalLent)}</div>
                <div class="stat-card-sub">${lent.length} loans</div>
            </div>
            <div class="stat-card stat-balance">
                <div class="stat-card-stripe"></div>
                <div class="stat-card-icon-wrap"><i class="fa-solid fa-exclamation-circle" style="color:#EF4444;font-size:20px"></i></div>
                <div class="stat-card-label">Remaining Debt</div>
                <div class="stat-card-value" style="color:#EF4444!important">${fmt(totalDebt)}</div>
                <div class="stat-card-sub">${activeCount} active</div>
            </div>
            <div class="stat-card stat-savings">
                <div class="stat-card-stripe"></div>
                <div class="stat-card-icon-wrap"><i class="fa-solid fa-coins" style="color:#8B5CF6;font-size:20px"></i></div>
                <div class="stat-card-label">Recovered</div>
                <div class="stat-card-value" style="color:#8B5CF6!important">${fmt(totalRecovered)}</div>
                <div class="stat-card-sub">from lent loans</div>
            </div>`;

  // Filter
  let filtered = [..._loans];
  if (_loanFilter === 'borrowed') filtered = filtered.filter(l => l.type === 'borrowed');
  else if (_loanFilter === 'lent') filtered = filtered.filter(l => l.type === 'lent');
  else if (_loanFilter === 'active') filtered = filtered.filter(l => getLoanStatus(l) === 'active');
  else if (_loanFilter === 'overdue') filtered = filtered.filter(l => getLoanStatus(l) === 'overdue');
  else if (_loanFilter === 'completed') filtered = filtered.filter(l => getLoanStatus(l) === 'completed');

  const listEl = el('loans-list');
  if (!filtered.length) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🤝</div>No loans found. Add your first loan!</div>';
    return;
  }
  listEl.innerHTML = filtered.map(loan => {
    const principal = parseFloat(loan.amount) || 0;
    const paid = parseFloat(loan.amount_paid) || 0;
    const remaining = Math.max(0, principal - paid);
    const pct = principal > 0 ? Math.min(100, Math.round((paid / principal) * 100)) : 0;
    const status = getLoanStatus(loan);
    const fillClass = pct === 100 ? 'done' : pct >= 60 ? 'high' : pct >= 30 ? 'mid' : 'low';
    const isBorrowed = loan.type === 'borrowed';

    return `<div class="loan-card" id="loan-card-${loan.id}">
                    <div class="loan-header">
                        <div class="loan-title-group">
                            <div class="loan-title">${esc(loan.title || 'Unnamed Loan')}</div>
                            <div class="loan-meta">
                                <i class="fa-solid fa-user" style="margin-right:4px;opacity:.6"></i>${esc(loan.person || 'Unknown')}
                                ${loan.category ? `· ${esc(loan.category)}` : ''}
                                ${loan.due_date ? `· Due ${fmtDate(loan.due_date)}` : ''}
                                ${loan.interest_rate ? `· ${loan.interest_rate}% interest` : ''}
                            </div>
                        </div>
                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                            <span class="loan-badge loan-badge-${isBorrowed ? 'borrowed' : 'lent'}">${isBorrowed ? 'Borrowed' : 'Lent'}</span>
                            <span class="loan-badge loan-badge-${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
                        </div>
                    </div>
                    <div class="loan-amounts">
                        <div class="loan-amount-item">
                            <span class="loan-amount-val" style="color:var(--text)">${fmt(principal)}</span>
                            <span class="loan-amount-lbl">Principal</span>
                        </div>
                        <div class="loan-amount-item">
                            <span class="loan-amount-val" style="color:var(--success)">${fmt(paid)}</span>
                            <span class="loan-amount-lbl">Paid</span>
                        </div>
                        <div class="loan-amount-item">
                            <span class="loan-amount-val" style="color:${remaining > 0 ? 'var(--danger)' : 'var(--success)'}">${fmt(remaining)}</span>
                            <span class="loan-amount-lbl">Remaining</span>
                        </div>
                    </div>
                    <div class="loan-progress-wrap">
                        <div class="loan-progress-track">
                            <div class="loan-progress-fill ${fillClass}" style="width:${pct}%" id="loan-bar-${loan.id}"></div>
                        </div>
                        <div class="loan-progress-pct">
                            ${pct === 100
        ? '<span class="loan-complete-badge"><i class="fa-solid fa-circle-check"></i> 100% Complete</span>'
        : `<span style="font-weight:600;color:var(--primary)">${pct}%</span> repaid`
      }
                        </div>
                    </div>
                    ${loan.notes ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-style:italic">📝 ${esc(loan.notes)}</div>` : ''}
                    <div class="loan-actions">
                        ${status !== 'completed' ? `<button class="loan-btn pay" onclick="openPaymentModal('${loan.id}')"><i class="fa-solid fa-coins" style="margin-right:4px"></i>Record Payment</button>` : ''}
                        <button class="loan-btn edit" onclick="editLoanUI('${loan.id}')"><i class="fa-solid fa-pen" style="margin-right:4px"></i>Edit</button>
                        <button class="loan-btn" onclick="toggleLoanPayments('${loan.id}')"><i class="fa-solid fa-history" style="margin-right:4px"></i>History</button>
                        <button class="loan-btn" style="color:#D4AF37;border-color:rgba(212,175,55,.35)" onclick="dlPDF('loan-single','${loan.id}')"><i class="fa-solid fa-file-pdf" style="margin-right:4px"></i>Export PDF</button>
                        <button class="loan-btn del" onclick="deleteLoanUI('${loan.id}')"><i class="fa-solid fa-trash" style="margin-right:4px"></i>Delete</button>
                    </div>
                    <div class="loan-payments" id="loan-payments-${loan.id}">
                        <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Payment History</div>
                        <div id="loan-payments-list-${loan.id}" style="color:var(--text-muted);font-size:12.5px">Loading…</div>
                    </div>
                </div>`;
  }).join('');
}

function openLoanModal(editData) {
  _loanEditId = null;
  const today = new Date().toISOString().split('T')[0];
  el('loan-title').value = '';
  el('loan-type').value = 'borrowed';
  el('loan-category').value = 'Personal';
  el('loan-person').value = '';
  el('loan-amount').value = '';
  el('loan-paid').value = '0';
  el('loan-interest').value = '';
  el('loan-due').value = '';
  el('loan-notes').value = '';
  el('loan-modal-title-text').textContent = 'Add Loan';
  el('loan-balance-preview').style.display = 'none';
  if (editData) {
    _loanEditId = editData.id;
    el('loan-title').value = editData.title || '';
    el('loan-type').value = editData.type || 'borrowed';
    el('loan-category').value = editData.category || 'Personal';
    el('loan-person').value = editData.person || '';
    el('loan-amount').value = editData.amount || '';
    el('loan-paid').value = editData.amount_paid || '0';
    el('loan-interest').value = editData.interest_rate || '';
    el('loan-due').value = editData.due_date || '';
    el('loan-notes').value = editData.notes || '';
    el('loan-modal-title-text').textContent = 'Edit Loan';
    updateLoanBalance();
  }
  el('m-loan').style.display = '';
  el('modal-overlay').classList.add('open');
}

function updateLoanBalance() {
  const amt = parseFloat(el('loan-amount').value) || 0;
  const paid = parseFloat(el('loan-paid').value) || 0;
  const rem = Math.max(0, amt - paid);
  const preview = el('loan-balance-preview');
  if (amt > 0) {
    preview.style.display = 'block';
    el('loan-balance-val').textContent = fmt(rem) + ' (' + (amt > 0 ? Math.round((paid / amt) * 100) : 0) + '% paid)';
  } else {
    preview.style.display = 'none';
  }
}

async function saveLoanUI() {
  const title = el('loan-title').value.trim();
  const amount = parseFloat(el('loan-amount').value);
  if (!title) return showToast('Please enter a loan title.', 'danger');
  if (!amount || amount <= 0) return showToast('Please enter a valid principal amount.', 'danger');
  setBtn('btn-save-loan', true, 'Saving…');
  const loan = {
    id: _loanEditId || undefined,
    title,
    type: el('loan-type').value,
    category: el('loan-category').value,
    person: el('loan-person').value.trim(),
    amount,
    amount_paid: parseFloat(el('loan-paid').value) || 0,
    interest_rate: parseFloat(el('loan-interest').value) || null,
    due_date: el('loan-due').value || null,
    notes: el('loan-notes').value.trim() || null
  };
  if (!loan.id) delete loan.id;
  const ok = await saveLoan(loan);
  setBtn('btn-save-loan', false, 'Save Loan');
  if (ok) {
    closeModal();
    await renderLoans();
    showToast((_loanEditId ? 'Loan updated!' : 'Loan added!'), 'success');
  } else {
    showToast('Failed to save loan. Please try again.', 'danger');
  }
}

async function editLoanUI(id) {
  const loan = _loans.find(l => l.id === id);
  if (loan) openLoanModal(loan);
}

async function deleteLoanUI(id) {
  if (!confirm('Delete this loan?')) return;
  const ok = await deleteLoan(id);
  if (ok) { await renderLoans(); showToast('Loan deleted.', 'success'); }
}

function openPaymentModal(loanId) {
  el('payment-loan-id').value = loanId;
  el('payment-amount').value = '';
  el('payment-date').value = new Date().toISOString().split('T')[0];
  el('payment-notes').value = '';
  el('m-loan-payment').style.display = '';
  el('modal-overlay').classList.add('open');
}

async function savePaymentUI() {
  const loanId = el('payment-loan-id').value;
  const amount = parseFloat(el('payment-amount').value);
  if (!amount || amount <= 0) return showToast('Enter a valid payment amount.', 'danger');
  setBtn('btn-save-payment', true, 'Saving…');
  const ok = await savePayment({
    loan_id: loanId,
    amount,
    payment_date: el('payment-date').value || new Date().toISOString().split('T')[0],
    notes: el('payment-notes').value.trim() || null
  });
  setBtn('btn-save-payment', false, 'Record Payment');
  if (ok) { closeModal(); await renderLoans(); showToast('Payment recorded!', 'success'); }
  else showToast('Failed to save payment.', 'danger');
}

async function toggleLoanPayments(loanId) {
  const container = el(`loan-payments-${loanId}`);
  if (!container) return;
  const isOpen = container.classList.contains('open');
  container.classList.toggle('open', !isOpen);
  if (!isOpen) {
    const listEl = el(`loan-payments-list-${loanId}`);
    const payments = await fetchLoanPayments(loanId);
    if (!payments.length) {
      listEl.innerHTML = '<span style="color:var(--text-muted);font-style:italic">No payments recorded yet.</span>';
    } else {
      listEl.innerHTML = payments.map(p => `<div class="loan-payment-item">
                        <span><i class="fa-solid fa-coins" style="color:#F97316;margin-right:5px"></i>${p.notes || 'Payment'}</span>
                        <span style="display:flex;gap:12px">
                            <span style="color:var(--text-muted)">${fmtDate(p.payment_date)}</span>
                            <strong style="color:var(--success);font-family:'Inter',sans-serif;font-variant-numeric:tabular-nums">+${fmt(p.amount)}</strong>
                        </span>
                    </div>`).join('');
    }
  }
}

// ═══════════════════════════════════════════════════════════
// PWA SUPPORT
// ═══════════════════════════════════════════════════════════
let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  if (!localStorage.getItem('pwa_dismissed')) {
    setTimeout(() => {
      const banner = el('pwa-install-banner');
      if (banner) banner.classList.add('show');
    }, 3000);
  }
});

function installPWA() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  _deferredInstallPrompt.userChoice.then(result => {
    _deferredInstallPrompt = null;
    dismissPWA();
    if (result.outcome === 'accepted') showToast('BTECH Track installed!', 'success');
  });
}

function dismissPWA() {
  localStorage.setItem('pwa_dismissed', '1');
  const banner = el('pwa-install-banner');
  if (banner) banner.classList.remove('show');
}

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => { });
}


// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
initAuth();

// ═══════════════════════════════════════════════════════════
// CALCULATOR ENGINE
// ═══════════════════════════════════════════════════════════
const _calcState = { expr: '', justEvaled: false, history: [], awaitingPow: false };

function calcFn(key) {
  const main = document.getElementById('calc-main');
  const expr = document.getElementById('calc-expr');
  const errEl = document.getElementById('calc-error');
  errEl.textContent = ' ';
  if (key === 'AC') { _calcState.expr = ''; _calcState.justEvaled = false; _calcState.awaitingPow = false; main.textContent = '0'; expr.textContent = ' '; return; }
  if (key === 'DEL') { if (_calcState.justEvaled) { _calcState.expr = ''; _calcState.justEvaled = false; } _calcState.expr = _calcState.expr.slice(0, -1); main.textContent = _calcState.expr || '0'; expr.textContent = ' '; return; }
  if (key === 'pi') { if (_calcState.justEvaled) _calcState.expr = ''; _calcState.expr += String(Math.PI); _calcState.justEvaled = false; main.textContent = _calcState.expr; return; }
  if (key === '=') {
    if (!_calcState.expr) return;
    try {
      let raw = _calcState.expr.replace(/[xX]/g, '*').replace(/[÷]/g, '/').replace(/(\d+(\.\d+)?)%/g, '($1/100)');
      const val = Function('"use strict";return(' + raw + ')')();
      if (!isFinite(val)) throw new Error();
      const pretty = parseFloat(val.toFixed(10)).toString();
      _calcState.history.unshift(_calcState.expr + ' = ' + pretty);
      if (_calcState.history.length > 20) _calcState.history.pop();
      expr.textContent = _calcState.expr + ' =';
      main.textContent = pretty;
      _calcState.expr = pretty; _calcState.justEvaled = true;
      calcUpdateHistory();
    } catch (e) { errEl.textContent = 'Syntax error'; }
    return;
  }
  if (['sqrt', 'sq', 'inv', 'log', 'ln', 'pow'].includes(key)) {
    try {
      let v = Function('"use strict";return(' + (_calcState.expr || '0') + ')')();
      if (key === 'pow') { _calcState.awaitingPow = v; _calcState.expr = ''; main.textContent = 'Exponent…'; expr.textContent = v + '^'; return; }
      let res = key === 'sqrt' ? Math.sqrt(v) : key === 'sq' ? v * v : key === 'inv' ? 1 / v : key === 'log' ? Math.log10(v) : Math.log(v);
      if (!isFinite(res)) throw new Error();
      const pretty = parseFloat(res.toFixed(10)).toString();
      expr.textContent = key + '(' + _calcState.expr + ') ='; main.textContent = pretty; _calcState.expr = pretty; _calcState.justEvaled = true;
    } catch (e) { errEl.textContent = 'Domain error'; }
    return;
  }
  if (_calcState.awaitingPow !== false && ['+', '-', '*', '/', '='].includes(key)) {
    try {
      let res = Math.pow(_calcState.awaitingPow, parseFloat(_calcState.expr || '0'));
      const pretty = parseFloat(res.toFixed(10)).toString();
      expr.textContent = _calcState.awaitingPow + '^' + _calcState.expr + ' =';
      main.textContent = pretty; _calcState.expr = pretty; _calcState.awaitingPow = false; _calcState.justEvaled = (key === '=');
      if (key !== '=') { _calcState.expr += key; _calcState.justEvaled = false; main.textContent = _calcState.expr; }
      return;
    } catch (e) { errEl.textContent = 'Error'; _calcState.awaitingPow = false; return; }
  }
  const ops = ['+', '-', '*', '/', '.', '(', ')', '%'];
  if (_calcState.justEvaled && !ops.includes(key)) { _calcState.expr = ''; _calcState.justEvaled = false; }
  _calcState.justEvaled = false; _calcState.expr += key; main.textContent = _calcState.expr; expr.textContent = ' ';
}

function calcUpdateHistory() {
  const el = document.getElementById('calc-history');
  if (!el) return;
  el.innerHTML = _calcState.history.map(h => '<div style="padding:4px 6px;font-size:11px;color:var(--calc-label-color);font-family:Inter,sans-serif;font-variant-numeric:tabular-nums;border-bottom:1px solid var(--calc-card-border);opacity:0.85">' + h + '</div>').join('');
}

function calcSwitchTab(tab, btn) {
  ['math', 'date', 'currency'].forEach(t => {
    const p = document.getElementById('calc-panel-' + t);
    const b = document.getElementById('calc-tab-' + t);
    if (p) p.style.display = t === tab ? '' : 'none';
    if (b) b.classList.toggle('active', t === tab);
  });
  if (tab === 'currency') calcCurrencyInit();
  if (tab === 'date') {
    const today = new Date().toISOString().split('T')[0];
    ['date-from', 'date-to', 'date-base'].forEach(id => { const el = document.getElementById(id); if (el && !el.value) el.value = today; });
    calcStartClock();
  }
}

let _calcClockTimer = null;
function calcStartClock() {
  if (_calcClockTimer) return;
  function tick() {
    const now = new Date(), pad = n => String(n).padStart(2, '0');
    const timeEl = document.getElementById('clock-time'); if (!timeEl) return;
    timeEl.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    const dateEl = document.getElementById('clock-date');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const start = new Date(now.getFullYear(), 0, 0), oneDay = 864e5;
    const doy = Math.floor((now - start) / oneDay);
    const doyEl = document.getElementById('clock-doy'); if (doyEl) doyEl.textContent = doy;
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const wk = Math.ceil((((d - ys) / 86400000) + 1) / 7);
    const wkEl = document.getElementById('clock-week'); if (wkEl) wkEl.textContent = 'Week ' + wk;
    const yearEnd = new Date(now.getFullYear(), 11, 31);
    const left = Math.round((yearEnd - now) / oneDay);
    const leftEl = document.getElementById('clock-left'); if (leftEl) leftEl.textContent = left + ' days';
    calcTZConvert();
  }
  tick(); _calcClockTimer = setInterval(tick, 1000);
}

function calcDateDiff() {
  const from = document.getElementById('date-from').value, to = document.getElementById('date-to').value;
  const res = document.getElementById('date-diff-result');
  if (!from || !to) { res.style.display = 'block'; res.innerHTML = '<span style="color:#EF4444">Please select both dates</span>'; return; }
  const ms = new Date(to) - new Date(from), abs = Math.abs(ms);
  const days = Math.round(abs / 864e5), weeks = Math.floor(days / 7), months = Math.round(days / 30.4375), years = (abs / (864e5 * 365.25)).toFixed(2);
  const sign = ms < 0 ? '(past)' : ms > 0 ? '(future)' : '(same day)';
  res.style.display = 'block';
  res.innerHTML = '<div style="font-weight:700;color:var(--accent-cyan);margin-bottom:8px">' + days + ' days ' + sign + '</div>' +
    '<div style="font-size:13px;color:var(--text-muted)">Weeks: <strong style="color:var(--text-primary)">' + weeks + '</strong></div>' +
    '<div style="font-size:13px;color:var(--text-muted)">Months: <strong style="color:var(--text-primary)">~' + months + '</strong></div>' +
    '<div style="font-size:13px;color:var(--text-muted)">Years: <strong style="color:var(--text-primary)">~' + years + '</strong></div>';
}

function calcDateAdd() {
  const base = document.getElementById('date-base').value;
  const days = parseInt(document.getElementById('date-days').value, 10);
  const res = document.getElementById('date-add-result');
  if (!base || isNaN(days)) { res.style.display = 'block'; res.innerHTML = '<span style="color:#EF4444">Enter a valid date and number of days</span>'; return; }
  const d = new Date(base); d.setDate(d.getDate() + days);
  res.style.display = 'block';
  res.innerHTML = '<div style="font-weight:700;color:#10B981;font-size:15px">' + d.toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '</div>' +
    '<div style="font-size:12px;color:var(--text-muted);margin-top:4px">ISO: ' + d.toISOString().split('T')[0] + '</div>';
}

function calcTZConvert() {
  const sel = document.getElementById('tz-select'), res = document.getElementById('tz-result');
  if (!sel || !res) return;
  try { const now = new Date(); res.textContent = now.toLocaleString('en-US', { timeZone: sel.value, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short', month: 'short', day: 'numeric' }) + ' (' + sel.value + ')'; } catch (e) { res.textContent = '—'; }
}

let _calcCurrRates = null;
const CALC_CURRENCIES = [
  ['USD', 'US Dollar'], ['EUR', 'Euro'], ['GBP', 'British Pound'], ['KES', 'Kenyan Shilling'],
  ['TZS', 'Tanzanian Shilling'], ['UGX', 'Ugandan Shilling'], ['JPY', 'Japanese Yen'],
  ['CNY', 'Chinese Yuan'], ['INR', 'Indian Rupee'], ['AED', 'UAE Dirham'], ['ZAR', 'South African Rand'],
  ['NGN', 'Nigerian Naira'], ['EGP', 'Egyptian Pound'], ['GHS', 'Ghanaian Cedi'], ['RWF', 'Rwandan Franc'],
  ['CAD', 'Canadian Dollar'], ['AUD', 'Australian Dollar'], ['CHF', 'Swiss Franc'], ['SEK', 'Swedish Krona'],
  ['NOK', 'Norwegian Krone'], ['BRL', 'Brazilian Real'], ['MXN', 'Mexican Peso'], ['SAR', 'Saudi Riyal'],
  ['SGD', 'Singapore Dollar'], ['HKD', 'Hong Kong Dollar'], ['TRY', 'Turkish Lira'], ['PKR', 'Pakistani Rupee'],
  ['BDT', 'Bangladeshi Taka'], ['ETB', 'Ethiopian Birr'], ['XOF', 'West African CFA']
];
const CALC_FALLBACK_RATES = { USD: 1, EUR: 0.92, GBP: 0.79, KES: 132, TZS: 2700, UGX: 3750, JPY: 157, CNY: 7.25, INR: 83.5, AED: 3.67, ZAR: 18.8, NGN: 1600, EGP: 48, GHS: 15.5, RWF: 1320, CAD: 1.36, AUD: 1.55, CHF: 0.90, SEK: 10.7, NOK: 10.6, BRL: 5.0, MXN: 17.2, SAR: 3.75, SGD: 1.35, HKD: 7.82, TRY: 32.5, PKR: 278, BDT: 110, ETB: 57, XOF: 600 };

function calcCurrencyInit() {
  const from = document.getElementById('curr-from'), to = document.getElementById('curr-to');
  if (!from || from.options.length > 0) return;
  CALC_CURRENCIES.forEach(([code, label]) => { from.add(new Option(label + ' (' + code + ')', code)); to.add(new Option(label + ' (' + code + ')', code)); });
  from.value = 'USD'; to.value = 'KES';
  if (!_calcCurrRates) calcCurrencyRefresh(); else calcCurrency();
}

async function calcCurrencyRefresh() {
  const info = document.getElementById('curr-rate-info');
  if (info) info.textContent = 'Fetching live rates…';
  try {
    const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (!r.ok) throw new Error();
    const data = await r.json();
    _calcCurrRates = data.rates; _calcCurrRates['USD'] = 1;
    if (info) info.textContent = 'Live rates · Updated: ' + new Date(data.date || Date.now()).toLocaleDateString('en-KE');
  } catch (e) {
    _calcCurrRates = { ...CALC_FALLBACK_RATES };
    if (info) info.textContent = 'Using offline fallback rates';
  }
  calcCurrency();
}

function calcCurrency() {
  const amount = parseFloat(document.getElementById('curr-amount')?.value) || 1;
  const from = document.getElementById('curr-from')?.value || 'USD';
  const to = document.getElementById('curr-to')?.value || 'KES';
  const rates = _calcCurrRates || CALC_FALLBACK_RATES;
  const res = document.getElementById('curr-result'), multi = document.getElementById('curr-multi');
  if (!rates[from] || !rates[to]) { if (res) res.textContent = '—'; return; }
  const converted = (amount / rates[from]) * rates[to];
  const fmt = n => n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : n.toFixed(4);
  if (res) res.textContent = fmt(converted) + ' ' + to;
  const snap = ['USD', 'EUR', 'GBP', 'KES', 'AED', 'ZAR', 'NGN', 'JPY'];
  if (multi) multi.innerHTML = snap.map(code => {
    if (code === from) return '';
    const val = (amount / rates[from]) * (rates[code] || 0);
    return '<div class="calc-currency-snap-item"><span class="calc-currency-snap-label">' + code + '</span><span class="calc-currency-snap-val">' + fmt(val) + '</span><div style="clear:both"></div></div>';
  }).join('');
}
/* ══════════════════════════════════════════
   LANDING PAGE FUNCTIONS
═══════════════════════════════════════════ */

function showLandingPage() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('landing-page').style.display = 'block';
  document.getElementById('mobile-onboarding').style.display = 'none';
  document.getElementById('app-loading').style.display = 'none';
  window.scrollTo(0, 0);
}

function showAuthScreen(tab) {
  document.getElementById('landing-page').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'block';
  document.getElementById('mobile-onboarding').style.display = 'none';
  if (tab) switchAuthTab(tab);
  window.scrollTo(0, 0);
}

function lpScrollTo(id) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function toggleLpMenu() {
  const menu = document.getElementById('lp-mobile-menu');
  if (menu) menu.classList.toggle('open');
}

// Sticky nav scroll effect
(function () {
  window.addEventListener('scroll', function () {
    const nav = document.getElementById('lp-nav');
    if (nav) {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }
  }, { passive: true });
})();

// Counter animation for stats
function animateCounters() {
  const cards = document.querySelectorAll('.lp-stat-num');
  cards.forEach(el => {
    const target = parseInt(el.dataset.target) || 0;
    const isInfinity = el.dataset.text === '∞';
    if (isInfinity) { el.textContent = '∞'; return; }
    let start = 0;
    const duration = 1400;
    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// Observe stats section to trigger animation
(function () {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { animateCounters(); obs.disconnect(); }
    });
  }, { threshold: 0.3 });
  const statsEl = document.querySelector('.lp-stats');
  if (statsEl) obs.observe(statsEl);
})();