/**
 * script.js - Static dashboard with placeholder API integration
 *
 * How to use:
 * 1. Replace API_BASE with your backend base URL.
 * 2. Replace PAYSTACK_PUBLIC_KEY with your Paystack public key (for card payments).
 * 3. Optionally implement backend endpoints described below.
 *
 * The app falls back to mock data if API_BASE is not set or endpoints fail.
 */

/* CONFIG: Replace with your real endpoints / keys */
const CONFIG = {
  API_BASE: '', // e.g. 'https://paymomentbackend.onrender.com/api'
  PAYSTACK_PUBLIC_KEY: '', // e.g. 'pk_live_xxx'
  PAYSTACK_VERIFY_ENDPOINT: '' // optional: backend route to verify payment (recommended)
};

/* --- Mock data used when API not provided --- */
const MOCK = {
  token: 'demo-token',
  user: { name: 'Eunice Chidi', email: 'eunice@example.com', phone: '08130000000' },
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
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');

function toast(msg, timeout = 3000) {
  const t = $('#toast');
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

/* --- DOM references --- */
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

/* --- Simple API wrapper (uses CONFIG.API_BASE) --- */
async function apiFetch(path, options = {}) {
  const base = CONFIG.API_BASE && CONFIG.API_BASE.trim();
  if (!base) {
    // no backend configured => simulate network with mock
    await new Promise(r => setTimeout(r, 300));
    // Simulate common endpoints
    if (path.includes('/auth/login')) return { ok: true, data: { token: MOCK.token, user: MOCK.user } };
    if (path.includes('/auth/register')) return { ok: true, data: { token: MOCK.token, user: MOCK.user } };
    if (path.includes('/me/balance')) return { ok: true, data: { balance: MOCK.balance } };
    if (path.includes('/me/transactions')) return { ok: true, data: { transactions: MOCK.transactions } };
    if (path.includes('/pay/service')) return { ok: true, data: { result: 'success', id: 'svc_' + Date.now() } };
    return { ok: false, error: 'No API configured (demo mode)' };
  }

  const url = base + path;
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (App.token) headers['Authorization'] = 'Bearer ' + App.token;

  try {
    const res = await fetch(url, Object.assign({ headers }, options));
    const json = await res.json();
    return { ok: res.ok, data: json, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message || err };
  }
}

/* --- Auth handlers (demo-ready) --- */
async function handleLogin(e) {
  e.preventDefault();
  const identifier = $('#login-identifier').value.trim();
  const password = $('#login-password').value.trim();
  if (!identifier || !password) return toast('Provide email/phone and password');

  const res = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
  if (res.ok) {
    App.token = res.data.token;
    App.user = res.data.user;
    onLoggedIn();
    toast('Logged in');
  } else {
    toast('Login failed: ' + (res.error || 'server error'));
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
  if (res.ok) {
    App.token = res.data.token;
    App.user = res.data.user;
    onLoggedIn();
    toast('Account created');
  } else {
    toast('Register failed: ' + (res.error || 'server error'));
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
  if (res.ok) {
    App.balance = res.data.balance;
  } else {
    // fallback to mock or zero
    App.balance = MOCK.balance || 0;
  }
  updateBalanceUI();
}

function updateBalanceUI() {
  balanceValue.textContent = App.balanceVisible ? currency(App.balance) : '****';
}

async function loadTransactions() {
  const res = await apiFetch('/me/transactions');
  if (res.ok) {
    App.transactions = res.data.transactions;
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
    li.innerHTML = `
      <div>
        <div><strong>${tx.title}</strong></div>
        <div class="meta">${tx.meta} • ${tx.date}</div>
      </div>
      <div>${tx.amount < 0 ? '-' : ''}<strong>${currency(Math.abs(tx.amount))}</strong></div>
    `;
    txList.appendChild(li);
  });
}

/* --- Add money (Paystack inline integration if key provided) --- */
function openAddMoneyModal() { show(addMoneyModal); }
function closeAddMoneyModal() { hide(addMoneyModal); }

async function startPayment() {
  const amount = Number($('#add-amount').value) || 0;
  const method = $('#add-method').value;
  if (!amount || amount < 50) return toast('Provide a valid amount (min 50)');

  // If Paystack key available and method card: use Paystack inline
  if (method === 'card' && CONFIG.PAYSTACK_PUBLIC_KEY) {
    const handler = window.PaystackPop && window.PaystackPop.setup ? window.PaystackPop.setup({
      key: CONFIG.PAYSTACK_PUBLIC_KEY,
      email: App.user?.email || 'customer@example.com',
      amount: Math.round(amount * 100),
      currency: 'NGN',
      metadata: { custom_fields: [{ display_name: "Customer Phone", variable_name: "phone", value: App.user?.phone || '' }] },
      onClose: function() { toast('Payment closed'); },
      callback: async function(response) {
        toast('Payment success, verifying...');
        // Optionally verify via backend
        if (CONFIG.PAYSTACK_VERIFY_ENDPOINT) {
          const v = await apiFetch(CONFIG.PAYSTACK_VERIFY_ENDPOINT + '?reference=' + encodeURIComponent(response.reference));
          if (v.ok) {
            toast('Payment verified');
            await refreshBalance();
            await loadTransactions();
          } else {
            toast('Verification failed');
          }
        } else {
          // No verify endpoint — just assume success
          await refreshBalance();
          await loadTransactions();
        }
      }
    }) : null;

    if (handler) {
      handler.openIframe();
      closeAddMoneyModal();
      return;
    } else {
      toast('Paystack script not loaded; falling back to demo top up');
    }
  }

  // Fallback: call /pay/topup or simulate success
  const res = await apiFetch('/pay/topup', { method: 'POST', body: JSON.stringify({ amount }) });
  if (res.ok) {
    toast('Top up success');
    // refresh local copy
    await refreshBalance();
    await loadTransactions();
    closeAddMoneyModal();
  } else {
    toast('Top up failed: ' + (res.error || 'server error'));
  }
}

/* --- Service payments (airtime, data, electricity, tv, betting, transport) --- */
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

  // call backend
  const res = await apiFetch('/pay/service', { method: 'POST', body: JSON.stringify({ service: currentService, customer, amount }) });
  if (res.ok) {
    toast('Service paid');
    await refreshBalance();
    await loadTransactions();
    closeServiceModal();
  } else {
    toast('Service failed: ' + (res.error || 'server error'));
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

  // If token exists in localStorage — auto-login (demo)
  if (localStorage.getItem('pd_token')) {
    App.token = localStorage.getItem('pd_token');
    App.user = JSON.parse(localStorage.getItem('pd_user') || 'null') || MOCK.user;
    onLoggedIn();
  } else {
    // show auth by default
    hide(dashboardScreen);
    show(authScreen);
  }

  // persist login for demo when user logs in (override handleLogin to store)
  const originalHandleLogin = handleLogin;
  window.handleLogin = async function(e) {
    await originalHandleLogin(e);
    if (App.token) {
      localStorage.setItem('pd_token', App.token);
      localStorage.setItem('pd_user', JSON.stringify(App.user));
    }
  };

  const originalHandleRegister = handleRegister;
  window.handleRegister = async function(e) {
    await originalHandleRegister(e);
    if (App.token) {
      localStorage.setItem('pd_token', App.token);
      localStorage.setItem('pd_user', JSON.stringify(App.user));
    }
  };
}

document.addEventListener('DOMContentLoaded', init);
