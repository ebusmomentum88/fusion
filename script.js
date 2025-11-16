/**
 * script.js - Static dashboard integrated with your backend
 *
 * CONFIG:
 *  - API_BASE set to your backend base URL (provided).
 *  - Replace PAYSTACK_PUBLIC_KEY with your Paystack public key if you want inline card payments.
 *  - PAYSTACK_VERIFY_ENDPOINT is optional; if provided, the app will call it after Paystack callback to confirm the payment.
 */

/* CONFIG: Integrated backend base URL */
const CONFIG = {
  API_BASE: 'https://paymomentbackend.onrender.com/api', // <-- your backend base
  PAYSTACK_PUBLIC_KEY: '', // <-- put your Paystack public key here if using card payments
  PAYSTACK_VERIFY_ENDPOINT: '/pay/verify' // optional verify route on your backend (full path will be API_BASE + this)
};

/* --- Mock data fallback (used only if backend unreachable) --- */
const MOCK = {
  token: 'demo-token',
  user: { name: 'Demo User', email: 'demo@example.com', phone: '08130000000' },
  balance: 15200.5,
  transactions: [
    { id: 'tx_1', title: 'Top up', meta: 'Card', amount: 5000, date: '2025-11-10' },
    { id: 'tx_2', title: 'Electricity', meta: 'Ibadan Elec', amount: -2300, date: '2025-11-09' },
    { id: 'tx_3', title: 'Airtime', meta: '0813xxxxxxx', amount: -500, date: '2025-11-02' },
  ]
};

/* --- Utilities --- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const show = el => el && el.classList.remove('hidden');
const hide = el => el && el.classList.add('hidden');

function toast(msg, timeout = 3000) {
  const t = $('#toast');
  if (!t) return alert(msg);
  t.textContent = msg;
  show(t);
  clearTimeout(t._timer);
  t._timer = setTimeout(() => hide(t), timeout);
}

function currency(n) {
  if (typeof n !== 'number') n = Number(n) || 0;
  return '₦' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* --- App state --- */
const App = {
  token: null,
  user: null,
  balanceVisible: true,
  balance: 0,
  transactions: []
};

/* --- DOM refs --- */
const authScreen = $('#auth-screen');
const dashboardScreen = $('#dashboard-screen');
const loginForm = $('#login-form');
const registerForm = $('#register-form');
const tabLogin = $('#tab-login');
const tabRegister = $('#tab-register');
const greeting = $('#greeting');
const userEmail = $('#user-email');
const balanceValue = $('#balance-value');
const txList = $('#tx-list');
const addMoneyModal = $('#add-money-modal');
const serviceModal = $('#service-modal');

/* --- API wrapper --- */
async function apiFetch(path, options = {}) {
  const base = CONFIG.API_BASE && CONFIG.API_BASE.trim();
  // If base missing, use mock (demo mode)
  if (!base) {
    await new Promise(r => setTimeout(r, 250));
    if (path.includes('/auth/login')) return { ok: true, data: { token: MOCK.token, user: MOCK.user } };
    if (path.includes('/auth/register')) return { ok: true, data: { token: MOCK.token, user: MOCK.user } };
    if (path.includes('/me/balance')) return { ok: true, data: { balance: MOCK.balance } };
    if (path.includes('/me/transactions')) return { ok: true, data: { transactions: MOCK.transactions } };
    if (path.includes('/pay/service')) return { ok: true, data: { result: 'success', id: 'svc_' + Date.now() } };
    if (path.includes('/pay/topup')) return { ok: true, data: { result: 'success', id: 'top_' + Date.now() } };
    return { ok: false, error: 'No API configured' };
  }

  // Build URL
  const url = base + path;
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (App.token) headers['Authorization'] = 'Bearer ' + App.token;

  try {
    const res = await fetch(url, Object.assign({ headers }, options));
    const contentType = res.headers.get('content-type') || '';
    let json = null;
    if (contentType.includes('application/json')) json = await res.json();
    else {
      // attempt parse text
      const text = await res.text();
      try { json = JSON.parse(text); } catch(_) { json = text; }
    }
    return { ok: res.ok, data: json, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/* --- Auth --- */
async function handleLogin(e) {
  e.preventDefault();
  const identifier = $('#login-identifier').value.trim();
  const password = $('#login-password').value.trim();
  if (!identifier || !password) return toast('Provide email/phone and password');

  const res = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
  if (res.ok && res.data && (res.data.token || res.data.access_token)) {
    App.token = res.data.token || res.data.access_token;
    App.user = res.data.user || res.data.profile || MOCK.user;
    localStorage.setItem('pd_token', App.token);
    localStorage.setItem('pd_user', JSON.stringify(App.user));
    onLoggedIn();
    toast('Logged in');
  } else {
    // Try to display error message from backend
    const err = res.data?.message || res.data?.error || res.error || 'Login failed';
    toast(err);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = $('#register-name').value.trim();
  const email = $('#register-email').value.trim();
  const phone = $('#register-phone').value.trim();
  const password = $('#register-password').value.trim();
  if (!name || !email || !password) return toast('Complete required fields');

  const res = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, phone, password }) });
  if (res.ok && res.data && (res.data.token || res.data.access_token)) {
    App.token = res.data.token || res.data.access_token;
    App.user = res.data.user || res.data.profile || MOCK.user;
    localStorage.setItem('pd_token', App.token);
    localStorage.setItem('pd_user', JSON.stringify(App.user));
    onLoggedIn();
    toast('Account created');
  } else {
    const err = res.data?.message || res.data?.error || res.error || 'Register failed';
    toast(err);
  }
}

/* --- After login --- */
async function onLoggedIn() {
  hide(authScreen);
  show(dashboardScreen);
  greeting.textContent = 'Hi, ' + (App.user?.name || 'User');
  userEmail.textContent = App.user?.email || '';
  await refreshBalance();
  await loadTransactions();
}

/* --- Balance & transactions --- */
async function refreshBalance() {
  const res = await apiFetch('/me/balance');
  if (res.ok && typeof res.data?.balance !== 'undefined') {
    App.balance = Number(res.data.balance) || 0;
  } else if (res.ok && typeof res.data === 'number') {
    App.balance = Number(res.data);
  } else {
    App.balance = MOCK.balance || 0;
  }
  updateBalanceUI();
}

function updateBalanceUI() {
  balanceValue.textContent = App.balanceVisible ? currency(App.balance) : '****';
}

async function loadTransactions() {
  const res = await apiFetch('/me/transactions');
  if (res.ok && Array.isArray(res.data?.transactions)) {
    App.transactions = res.data.transactions;
  } else if (res.ok && Array.isArray(res.data)) {
    App.transactions = res.data;
  } else {
    App.transactions = MOCK.transactions;
  }
  renderTransactions();
}

function renderTransactions() {
  txList.innerHTML = '';
  if (!App.transactions || !App.transactions.length) {
    txList.innerHTML = '<li class="tx-item muted">No transactions yet</li>';
    return;
  }
  App.transactions.forEach(tx => {
    const li = document.createElement('li');
    li.className = 'tx-item';
    const title = tx.title || tx.description || tx.type || 'Transaction';
    const meta = tx.meta || tx.source || tx.note || '';
    const date = tx.date || tx.created_at || '';
    const amount = Number(tx.amount || tx.value || 0);
    li.innerHTML = `
      <div>
        <div><strong>${title}</strong></div>
        <div class="meta">${meta} • ${date}</div>
      </div>
      <div>${amount < 0 ? '-' : ''}<strong>${currency(Math.abs(amount))}</strong></div>
    `;
    txList.appendChild(li);
  });
}

/* --- Add money (Paystack inline if configured) --- */
function openAddMoneyModal() { show(addMoneyModal); }
function closeAddMoneyModal() { hide(addMoneyModal); }

async function startPayment() {
  const amount = Number($('#add-amount').value) || 0;
  const method = $('#add-method').value;
  if (!amount || amount < 50) return toast('Provide a valid amount (min 50)');

  // Card payment via Paystack inline if configured
  if (method === 'card' && CONFIG.PAYSTACK_PUBLIC_KEY) {
    if (!window.PaystackPop || !window.PaystackPop.setup) {
      toast('Loading Paystack script...');
      loadPaystackKey();
      // short wait for script to attach
      await new Promise(r => setTimeout(r, 800));
    }

    if (window.PaystackPop && window.PaystackPop.setup) {
      const handler = window.PaystackPop.setup({
        key: CONFIG.PAYSTACK_PUBLIC_KEY,
        email: App.user?.email || 'customer@example.com',
        amount: Math.round(amount * 100),
        currency: 'NGN',
        metadata: { custom_fields: [{ display_name: "Customer Phone", variable_name: "phone", value: App.user?.phone || '' }] },
        onClose: function() { toast('Payment window closed'); },
        callback: async function(response) {
          toast('Payment successful. Verifying...');
          // Optionally call backend verify endpoint
          if (CONFIG.PAYSTACK_VERIFY_ENDPOINT) {
            const verifyPath = (CONFIG.PAYSTACK_VERIFY_ENDPOINT.startsWith('/')) ? CONFIG.PAYSTACK_VERIFY_ENDPOINT : '/' + CONFIG.PAYSTACK_VERIFY_ENDPOINT;
            const v = await apiFetch(verifyPath + '?reference=' + encodeURIComponent(response.reference));
            if (v.ok) {
              toast('Payment verified');
            } else {
              toast('Verification failed');
            }
          }
          await refreshBalance();
          await loadTransactions();
        }
      });
      handler.openIframe();
      closeAddMoneyModal();
      return;
    } else {
      toast('Paystack failed to initialize; falling back to transfer flow.');
    }
  }

  // Bank transfer / fallback flow
  const res = await apiFetch('/pay/topup', { method: 'POST', body: JSON.stringify({ amount, method }) });
  if (res.ok) {
    toast('Top up initiated');
    await refreshBalance();
    await loadTransactions();
    closeAddMoneyModal();
  } else {
    const err = res.data?.message || res.data?.error || res.error || 'Top up failed';
    toast(err);
  }
}

/* --- Service payments --- */
let currentService = null;
function openServiceModal(service) {
  currentService = service;
  $('#service-title').textContent = service.charAt(0).toUpperCase() + service.slice(1);
  $('#service-customer').value = '';
  $('#service-amount').value = '';
  show(serviceModal);
}
function closeServiceModal() { hide(serviceModal); }

async function payService() {
  const customer = $('#service-customer').value.trim();
  const amount = Number($('#service-amount').value);
  if (!customer || !amount || amount <= 0) return toast('Complete the service form');

  const res = await apiFetch('/pay/service', { method: 'POST', body: JSON.stringify({ service: currentService, customer, amount }) });
  if (res.ok) {
    toast('Service paid');
    await refreshBalance();
    await loadTransactions();
    closeServiceModal();
  } else {
    const err = res.data?.message || res.data?.error || res.error || 'Service payment failed';
    toast(err);
  }
}

/* --- UI wiring --- */
function wireUI() {
  // Tabs
  tabLogin.addEventListener('click', () => { tabLogin.classList.add('active'); tabRegister.classList.remove('active'); show(loginForm); hide(registerForm); });
  tabRegister.addEventListener('click', () => { tabRegister.classList.add('active'); tabLogin.classList.remove('active'); show(registerForm); hide(loginForm); });

  // auth
  loginForm.addEventListener('submit', handleLogin);
  registerForm.addEventListener('submit', handleRegister);

  // logout
  $('#logout-btn').addEventListener('click', () => {
    App.token = null; App.user = null;
    localStorage.removeItem('pd_token'); localStorage.removeItem('pd_user');
    hide(dashboardScreen); show(authScreen);
  });

  // balance visibility
  $('#toggle-balance').addEventListener('click', () => {
    App.balanceVisible = !App.balanceVisible;
    updateBalanceUI();
  });

  // add money
  $('#add-money-btn').addEventListener('click', openAddMoneyModal);
  $('#close-add-modal').addEventListener('click', closeAddMoneyModal);
  $('#start-pay-btn').addEventListener('click', startPayment);

  // quick actions
  $$('.quick').forEach(el => el.addEventListener('click', e => {
    const a = e.currentTarget.dataset.action;
    toast('Quick action: ' + a);
  }));

  // service grid
  $$('.grid-item').forEach(el => el.addEventListener('click', e => openServiceModal(e.currentTarget.dataset.service)));

  $('#close-service-modal').addEventListener('click', closeServiceModal);
  $('#service-pay-btn').addEventListener('click', payService);

  $('#refresh-transactions').addEventListener('click', loadTransactions);
}

/* --- Load Paystack script if key set --- */
function loadPaystackKey() {
  if (CONFIG.PAYSTACK_PUBLIC_KEY && !window.PaystackPop) {
    const s = document.createElement('script');
    s.src = 'https://js.paystack.co/v1/inline.js';
    s.onload = () => console.log('Paystack loaded');
    s.onerror = () => console.warn('Paystack failed to load');
    document.head.appendChild(s);
  }
}

/* --- initialize --- */
function init() {
  wireUI();
  loadPaystackKey();

  // Auto-login if token present
  const token = localStorage.getItem('pd_token');
  if (token) {
    App.token = token;
    try { App.user = JSON.parse(localStorage.getItem('pd_user')); } catch(_) { App.user = MOCK.user; }
    onLoggedIn();
  } else {
    hide(dashboardScreen);
    show(authScreen);
  }
}

document.addEventListener('DOMContentLoaded', init);
