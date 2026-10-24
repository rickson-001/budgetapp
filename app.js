'use strict';

// ==================================================
// CONSTANTES
// ==================================================
const CATS = {
  alimentation: { e: '🍽️', l: 'Alimentation', c: '#ff9f43' },
  transport:    { e: '🚗', l: 'Transport',    c: '#54a0ff' },
  logement:     { e: '🏠', l: 'Logement',     c: '#a29bfe' },
  sante:        { e: '💊', l: 'Santé',        c: '#55efc4' },
  loisirs:      { e: '🎉', l: 'Loisirs',      c: '#fd79a8' },
  salaire:      { e: '💼', l: 'Salaire',      c: '#00d97e' },
  autre:        { e: '📦', l: 'Autre',        c: '#8fa8c0' }
};

const OP_SIGNS = {
  send: { sign: -1 }, receive: { sign: +1 }, cashout: { sign: -1 },
  withdraw: { sign: -1 }, deposit: { sign: +1 }, out: { sign: -1 }, in: { sign: +1 },
  deposit_sav: { sign: +1 }, withdraw_sav: { sign: -1 },
  transfer_out: { sign: -1 }, transfer_in: { sign: +1 },
  transfer_to_saving: { sign: -1 }, transfer_from_saving: { sign: +1 }
};

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const COLORS = ['green', 'wave', 'blue', 'gold', 'purple', 'red'];
const COLOR_CSS = { green: 'var(--green)', wave: 'var(--wave)', blue: 'var(--blue)', gold: 'var(--gold)', purple: 'var(--purple)', red: 'var(--red)' };
const COLOR_HEX = { green: '#00d97e', wave: '#009cff', blue: '#3b9eff', gold: '#ffb830', purple: '#a78bfa', red: '#ff4d6d' };
const AC_ICONS = ['🏦', '💳', '🏧', '🌊', '💵', '🪙', '🏪', '🌐', '💎', '🔐'];
const SAV_EMOJIS = ['🐖', '✈️', '🚗', '🏠', '📱', '💍', '🎓', '🏖️', '💊', '🎮', '🛒', '💼', '🎯', '📚', '💻'];

// ==================================================
// DB - Base de données avec localStorage
// ==================================================
const DB = (() => {
  const DEFAULTS = {
    txs: [],
    accounts: [],
    accountOps: [],
    savings: [],
    savingsOps: [],
    transfers: [],
    recurring: [],
    settings: { name: '', currency: 'FCFA', theme: (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark', monthlyBudget: {} }
  };

  function _load(k) {
    try {
      const raw = localStorage.getItem('b5_' + k);
      if (!raw) return null;
      const p = JSON.parse(raw);
      const d = DEFAULTS[k];
      if (Array.isArray(d) && !Array.isArray(p)) return null;
      if (d && typeof d === 'object' && !Array.isArray(d) && typeof p !== 'object') return null;
      return p;
    } catch { return null; }
  }

  function _save(k, v) {
    try { localStorage.setItem('b5_' + k, JSON.stringify(v)); }
    catch (e) { console.warn('DB save failed', k, e); }
  }

  const S = {};
  for (const k of Object.keys(DEFAULTS)) {
    const loaded = _load(k);
    S[k] = loaded !== null ? loaded : JSON.parse(JSON.stringify(DEFAULTS[k]));
  }

  // Migration monthlyBudget nombre -> objet
  if (typeof S.settings.monthlyBudget === 'number') {
    const oldBudget = S.settings.monthlyBudget;
    S.settings.monthlyBudget = {};
    if (oldBudget > 0) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      if (!S.settings.monthlyBudget[year]) S.settings.monthlyBudget[year] = {};
      S.settings.monthlyBudget[year][month] = oldBudget;
    }
    _save('settings', S.settings);
  }

  // Migration showOnHome
  if (S.accounts.length) {
    let needsSave = false;
    S.accounts.forEach(ac => {
      if (ac.showOnHome === undefined) {
        ac.showOnHome = true;
        needsSave = true;
      }
    });
    if (needsSave) _save('accounts', S.accounts);
  }



  // Migration pour les anciens transferts sans type
  if (S.transfers.length) {
    let needSave = false;
    S.transfers.forEach(t => {
      if (t.fromType === undefined) {
        t.fromType = 'account';
        t.toType = 'account';
        needSave = true;
      }
    });
    if (needSave) _save('transfers', S.transfers);
  }

  return {
    get: k => S[k],
    set: (k, v) => { S[k] = v; _save(k, v); try { FileSync.scheduleSave(); } catch (_) { } },
    update: (k, fn) => { fn(S[k]); _save(k, S[k]); try { FileSync.scheduleSave(); } catch (_) { } }
  };
})();

// ==================================================
// UTILS
// ==================================================
const Utils = {
  esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  parseAmt: s => { const n = parseFloat(String(s).replace(',', '.')); return isNaN(n) || n < 0 ? 0 : n; },
  cur: () => DB.get('settings').currency || 'FCFA',
  dec: () => (DB.get('settings').currency || 'FCFA') === 'FCFA' ? 0 : 2,
  fmt: n => {
    const absValue = Utils.fmtS(n);
    const currency = DB.get('settings').currency || 'FCFA';
    return n < 0 ? `-${absValue} ${currency}` : `${absValue} ${currency}`;
  },
  fmtS: n => { const d = Utils.dec(); const v = Math.round(Math.abs(n) * 10 ** d) / 10 ** d; return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d }); },
  fmtDate: iso => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
};

// ==================================================
// UI
// ==================================================
const UI = {
  $: id => document.getElementById(id),
  txt: (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; },
  html: (id, v) => { const e = document.getElementById(id); if (e) e.innerHTML = v; },
  _toastT: null,
  toast(msg, type = '', action = null) {
    const t = this.$('toast');
    t.textContent = msg;
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.style.cssText = 'margin-left:12px;background:none;border:none;color:inherit;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer;pointer-events:auto';
      b.onclick = () => { t.className = 'toast'; clearTimeout(this._toastT); action.fn(); };
      t.appendChild(b);
    }
    t.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { t.className = 'toast'; }, action ? 6000 : 2700);
  }
};

// Horloge
(function tick() {
  const n = new Date();
  UI.txt('clock', String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'));
  setTimeout(tick, 15000);
})();

// ==================================================
// FILE SYNC (version lisible)
// ==================================================
const FileSync = (() => {
  let _handle = null;
  let _saveTimer = null;
  let _lastSaved = null;
  let _status = 'idle';
  const SUPPORTED = (typeof window.showSaveFilePicker === 'function');

  const _IDB = (() => {
    const DB_NAME = 'budget_filesync_v6';
    const STORE = 'handles';
    const KEY = 'active';

    function open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
        r.onsuccess = e => res(e.target.result);
        r.onerror = e => rej(e.target.error);
      });
    }

    async function save(h) {
      try {
        const db = await open();
        await new Promise((res, rej) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(h, KEY);
          tx.oncomplete = res;
          tx.onerror = rej;
        });
      } catch (e) { console.warn('[FileSync] IDB save:', e); }
    }

    async function load() {
      try {
        const db = await open();
        return await new Promise((res, rej) => {
          const tx = db.transaction(STORE, 'readonly');
          const r = tx.objectStore(STORE).get(KEY);
          r.onsuccess = e => res(e.target.result || null);
          r.onerror = e => rej(e.target.error);
        });
      } catch (e) { return null; }
    }

    async function clear() {
      try {
        const db = await open();
        await new Promise((res, rej) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(KEY);
          tx.oncomplete = res;
          tx.onerror = rej;
        });
      } catch (e) { }
    }

    return { save, load, clear };
  })();

  function _build() {
    return JSON.stringify({
      version: '6.9',
      savedAt: new Date().toISOString(),
      txs: DB.get('txs'),
      accounts: DB.get('accounts'),
      accountOps: DB.get('accountOps'),
      savings: DB.get('savings'),
      savingsOps: DB.get('savingsOps'),
      transfers: DB.get('transfers'),
      recurring: DB.get('recurring'),
      settings: DB.get('settings')
    }, null, 2);
  }

  async function _write() {
    if (!_handle) return;
    try {
      let perm = await _handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'prompt') perm = await _handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') { _setStatus('error'); return; }
      const writable = await _handle.createWritable();
      await writable.write(_build());
      await writable.close();
      _lastSaved = new Date();
      _setStatus('saved');
    } catch (e) {
      if (e.name !== 'AbortError') { _setStatus('error'); }
    }
  }

  function _setStatus(s) {
    _status = s;
    const dot = UI.$('syncDot');
    if (dot) {
      dot.className = 'sync-dot sync-' + s;
      const LABELS = {
        idle: 'Aucun fichier sélectionné',
        saving: 'Sauvegarde en cours…',
        saved: 'Fichier synchronisé ✓',
        error: 'Erreur de sauvegarde',
        unsupported: 'Non supporté'
      };
      dot.title = LABELS[s] || '';
    }
    try { if (Nav._tab === 'settings') App.renderSettings(); } catch (_) { }
  }

  async function init() {
    if (!SUPPORTED) { _setStatus('unsupported'); return; }
    const h = await _IDB.load();
    if (h) {
      try {
        const perm = await h.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted' || perm === 'prompt') { _handle = h; _setStatus('idle'); }
      } catch (e) { _handle = null; }
    }
    _setStatus('idle'); // était '_handle ? idle : idle' — les deux branches identiques, simplifié
  }

  async function chooseFile() {
    if (!SUPPORTED) { UI.toast('Non supporté - Chrome ou Edge requis', 'error'); return; }
    try {
      const h = await window.showSaveFilePicker({
        suggestedName: 'budget_' + new Date().toISOString().slice(0, 10) + '.json',
        types: [{ description: 'Budget JSON', accept: { 'application/json': ['.json'] } }]
      });
      _handle = h;
      await _IDB.save(h);
      _setStatus('saving');
      await _write();
      UI.toast('✅ Fichier sélectionné et sauvegardé', 'success');
    } catch (e) {
      if (e.name !== 'AbortError') UI.toast('Erreur lors de la sélection', 'error');
    }
  }

  async function saveNow() {
    if (!_handle) { UI.toast('Aucun fichier sélectionné', 'error'); return; }
    _setStatus('saving');
    await _write();
    UI.toast(_status === 'saved' ? '✅ Sauvegarde réussie' : '⚠️ Erreur', _status === 'saved' ? 'success' : 'error');
  }

  async function loadFile() {
    if (!SUPPORTED) { UI.toast('Non supporté', 'error'); return; }
    try {
      const [h] = await window.showOpenFilePicker({
        types: [{ description: 'Budget JSON', accept: { 'application/json': ['.json'] } }],
        multiple: false
      });
      const file = await h.getFile();
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch (e) {
        UI.toast('Fichier JSON invalide', 'error');
        return;
      }
      const OK = ['txs', 'accounts', 'accountOps', 'savings', 'savingsOps', 'transfers'].every(k => data[k] === undefined || Array.isArray(data[k]));
      if (!OK) { UI.toast('Format non reconnu', 'error'); return; }
      Modals.openConfirm('📂 Charger ce fichier', `Les données actuelles seront remplacées. Continuer ?`, async () => {
        ['txs', 'accounts', 'accountOps', 'savings', 'savingsOps', 'transfers', 'recurring', 'settings'].forEach(k => {
          if (data[k] !== undefined) DB.set(k, data[k]);
        });
        _handle = h;
        await _IDB.save(h);
        _setStatus('saved');
        App.renderHome();
        App.renderAccounts();
        App.renderSavings();
        App.renderSettings();
        UI.toast('✅ Données chargées', 'success');
      });
    } catch (e) {
      if (e.name !== 'AbortError') UI.toast('Erreur', 'error');
    }
  }

  function scheduleSave() {
    if (!_handle) return;
    clearTimeout(_saveTimer);
    _setStatus('saving');
    _saveTimer = setTimeout(() => _write(), 1500);
  }

  async function disconnect() {
    _handle = null;
    clearTimeout(_saveTimer);
    await _IDB.clear();
    _setStatus('idle');
    UI.toast('Fichier déconnecté');
  }

  return {
    init, chooseFile, saveNow, loadFile, scheduleSave, disconnect,
    isSupported: () => SUPPORTED,
    isConnected: () => !!_handle,
    getStatus: () => _status,
    getFileName: () => _handle?.name || null,
    getLastSaved: () => _lastSaved
  };
})();

// ==================================================
// PWA
// ==================================================
const PWA = (() => {
  let _installPrompt = null;
  let _swReg = null;

  async function init() {
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (_) {}
    if (!('serviceWorker' in navigator)) return;
    try {
      _swReg = await navigator.serviceWorker.register('sw.js', { scope: './' });
      _swReg.addEventListener('updatefound', () => {
        const newSW = _swReg.installing;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            const bar = UI.$('pwaUpdateBar');
            if (bar) bar.classList.add('show');
          }
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => { window.location.reload(); });
    } catch (e) { console.warn('[PWA] SW registration failed:', e); }
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _installPrompt = e;
    _renderInstallSection();
  });

  window.addEventListener('appinstalled', () => {
    _installPrompt = null;
    _renderInstallSection();
    UI.toast('✅ Application installée !', 'success');
  });

  async function install() {
    if (!_installPrompt) return;
    try {
      await _installPrompt.prompt();
      const { outcome } = await _installPrompt.userChoice;
      if (outcome === 'accepted') { _installPrompt = null; _renderInstallSection(); }
    } catch (e) { console.warn('[PWA] install error:', e); }
  }

  function applyUpdate() { if (_swReg && _swReg.waiting) _swReg.waiting.postMessage('SKIP_WAITING'); }

  function isInstalled() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }

  function _renderInstallSection() {
  const area = UI.$('pwaInstallArea');
  const sec = UI.$('pwaInstallSec');
  if (!area) return;
  if (isInstalled()) {
    if (sec) sec.style.display = '';
    area.innerHTML = `<div class="settings-group"><div class="srow" style="cursor:default"><span class="srow-icon">✅</span><div class="srow-info"><div class="srow-name">Application installée</div><div class="srow-desc">Mode app actif</div></div></div></div>`;
    return;
  }
  if (_installPrompt) {
    if (sec) sec.style.display = '';
    area.innerHTML = `<div class="pwa-install-card"><div class="pwa-install-icon">📲</div><div class="pwa-install-info"><div class="pwa-install-title">Installer l'application</div><div class="pwa-install-sub">Accès rapide, fonctionne hors ligne</div></div><button class="pwa-install-btn" onclick="PWA.install()">Installer</button></div>`;
    return;
  }
  // ⚠️ ICI : au lieu de cacher la section, affiche un message d'information
  if (sec) sec.style.display = '';
  area.innerHTML = `<div class="settings-group"><div class="srow" style="cursor:default"><span class="srow-icon">🌐</span><div class="srow-info"><div class="srow-name">PWA disponible</div><div class="srow-desc">Ouvrez l'app en HTTPS ou localhost pour installer</div></div></div></div>`;
}

  return { init, install, applyUpdate, isInstalled, renderInstallSection: _renderInstallSection };
})();

// ==================================================
// LONG PRESS
// ==================================================
let _lpFired = false;
const LP = {
  _reg: {}, _t: null, _sx: 0, _sy: 0, _moved: false,
  register(fn) { const k = 'lp' + Utils.uid(); this._reg[k] = fn; return k; },
  attach(el, key) {
    if (el._lpKey === key) return;
    el._lpKey = key;
    const start = e => {
      this._moved = false;
      const p = e.touches ? e.touches[0] : e;
      this._sx = p.clientX; this._sy = p.clientY;
      clearTimeout(this._t);
      this._t = setTimeout(() => {
        if (!this._moved) {
          _lpFired = true;
          setTimeout(() => { _lpFired = false; }, 600);
          this._reg[key] && this._reg[key]();
        }
      }, 520);
    };
    const move = e => {
      const p = e.touches ? e.touches[0] : e;
      if (Math.abs(p.clientX - this._sx) > 9 || Math.abs(p.clientY - this._sy) > 9) {
        this._moved = true;
        clearTimeout(this._t);
      }
    };
    const end = () => clearTimeout(this._t);
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', end);
    el.addEventListener('mousedown', start);
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseup', end);
    el.addEventListener('mouseleave', end);
    el.addEventListener('contextmenu', e => { e.preventDefault(); this._reg[key] && this._reg[key](); });
  },
  bindAll() { document.querySelectorAll('[data-lp]').forEach(el => this.attach(el, el.dataset.lp)); }
};

// ==================================================
// NAV
// ==================================================
const Nav = {
  _tab: 'home',
  go(tab) {
    this._tab = tab;
    document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const p = UI.$('tab-' + tab), b = UI.$('nav-' + tab);
    if (p) p.classList.add('active');
    if (b) b.classList.add('active');
    UI.$('screen').scrollTop = 0;
    
    const addBtn = UI.$('navAdd');
    if (tab === 'settings') {
      addBtn.classList.add('hidden');
    } else {
      addBtn.classList.remove('hidden');
    }
    
    if (tab === 'accounts') App.renderAccounts();
    if (tab === 'savings') App.renderSavings();
    if (tab === 'settings') App.renderSettings();
  },
  addAction() {
    if (this._tab === 'accounts') {
      Modals.openAccountForm();
    } else if (this._tab === 'savings') {
      Modals.openSavingForm();
    } else {
      Modals.openTx('expense');
    }
  },
  openDetail(type, id) {
    this._detailType = type;
    this._detailId = id;
    if (type === 'account') App.renderAccountDetail(id);
    else if (type === 'saving') App.renderSavingDetail(id);
    UI.$('detailPanel').classList.add('open');
  },
  closeDetail() {
    UI.$('detailPanel').classList.remove('open');
    setTimeout(() => {
      if (this._tab === 'accounts') App.renderAccounts();
      if (this._tab === 'savings') App.renderSavings();
      App.renderHome();
    }, 320);
  },
  refreshDetail() { if (this._detailType && this._detailId) this.openDetail(this._detailType, this._detailId); }
};

// ==================================================
// APP - Rendu principal avec correction des doublons
// ==================================================
const App = {
  _month: new Date().getMonth(),
  _year: new Date().getFullYear(),
  _filter: 'all',
  _searchTerm: '',
  _searchDebounceTimer: null,
  _lastBudgetAlert: null,
  _catAlerts: new Set(),
  _catSeeded: false,

  changeMonth(d) {
    this._month += d;
    if (this._month > 11) { this._month = 0; this._year++; }
    if (this._month < 0) { this._month = 11; this._year--; }
    this.renderHome();
  },

  setFilter(f, el) {
    this._filter = f;
    document.querySelectorAll('.f-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    this.renderTxList();
  },

  monthTxs() {
    return DB.get('txs').filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === this._month && d.getFullYear() === this._year;
    });
  },

  toggleTheme(dark) {
    const t = dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    DB.update('settings', s => { s.theme = t; });
    const metaTc = document.getElementById('metaThemeColor');
    if (metaTc) metaTc.setAttribute('content', t === 'light' ? '#f4f6fb' : '#0b0f1a');
  },

  initSearch() {
    const searchInput = UI.$('txSearch');
    if (!searchInput) return;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(this._searchDebounceTimer);
      this._searchDebounceTimer = setTimeout(() => {
        this._searchTerm = e.target.value.toLowerCase();
        this.renderTxList();
      }, 300);
    });
  },

  renderHome() {
    const lbl = MONTHS[this._month] + ' ' + this._year;
    UI.txt('monthLbl', lbl);
    UI.txt('welcomeSub', lbl);
    const mt = this.monthTxs();
    const inc = mt.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = mt.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    // Solde total = somme des comptes affichés sur l'accueil
    const visibleAccounts = DB.get('accounts').filter(ac => ac.showOnHome !== false);
    const totalBalance = visibleAccounts.reduce((sum, ac) => sum + ac.balance, 0);
    const bal = totalBalance;
    const balElement = UI.$('hBal');
    if (balElement) {
      balElement.textContent = Utils.fmt(bal);
      balElement.style.color = bal < 0 ? 'var(--red)' : '';
    }
    UI.txt('hInc', '+' + Utils.fmtS(inc));
    UI.txt('hExp', '-' + Utils.fmtS(exp));

    const h = new Date().getHours();
    const g = h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
    const n = DB.get('settings').name;
    UI.txt('welcomeMsg', g + (n ? ' , ' + n.split(' ')[0] : '') + ' 👋');

    let allAccounts = DB.get('accounts');
    let acs = allAccounts.filter(ac => ac.showOnHome !== false);
    UI.html('homeAccountsRow', acs.map(ac => `
      <div class="mini-ac" data-color="${ac.colorKey}" onclick="if(!_lpFired)Nav.openDetail('account','${ac.id}')">
        <div class="mac-badge"><div class="mac-icon">${ac.icon}</div>${Utils.esc(ac.name)}</div>
        <div class="mac-bal" style="color:${ac.balance < 0 ? 'var(--red)' : (COLOR_CSS[ac.colorKey] || 'var(--green)')}">${ac.balance < 0 ? '-' : ''}${Utils.fmtS(Math.abs(ac.balance))} F</div>
        <div class="mac-sub">Solde</div>
      </div>
    `).join(''));

    this.renderBudgetGauge();
    this.renderCatBudgets();
    this.renderTxList();
    this.renderSettings();
  },

  renderCatBudgets() {
    const el = UI.$('catBudgetCard'); if (!el) return;
    const cb = DB.get('settings').catBudgets || {}, keys = Object.keys(cb).filter(k => cb[k] > 0 && CATS[k]);
    if (!keys.length) { el.style.display = 'none'; return; }
    const spent = {};
    this.monthTxs().filter(t => t.type === 'expense').forEach(t => { spent[t.cat] = (spent[t.cat] || 0) + t.amount; });
    const now = new Date(), isCur = this._year === now.getFullYear() && this._month === now.getMonth(), crossed = [];
    el.innerHTML = '<div class="sc-lbl">Budgets par catégorie</div>' + keys.map(k => {
      const b = cb[k], sp = spent[k] || 0, pct = Math.round(sp / b * 100), lvl = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
      const col = lvl === 'over' ? 'var(--red)' : lvl === 'warn' ? 'var(--gold)' : 'var(--green)';
      if (isCur && lvl !== 'ok') {
        const key = `${this._year}-${this._month}-${k}-${lvl}`;
        if (!this._catAlerts.has(key)) { this._catAlerts.add(key); if (this._catSeeded) crossed.push({ k, lvl, sp, b, pct }); }
      }
      return `<div style="margin-top:9px"><div style="display:flex;justify-content:space-between;font-size:.72rem"><span>${CATS[k].e} ${CATS[k].l}</span><span style="color:${col};font-weight:600">${Utils.fmtS(sp)} / ${Utils.fmtS(b)} ${Utils.cur()}</span></div><div style="height:6px;border-radius:99px;background:var(--surface3);margin-top:4px;overflow:hidden"><div style="height:100%;width:${Math.min(100, pct)}%;background:${col};border-radius:99px;transition:width .3s"></div></div></div>`;
    }).join('');
    el.style.display = '';
    if (isCur) this._catSeeded = true;
    if (crossed.length) {
      const c = crossed.sort((a, b) => (b.lvl === 'over') - (a.lvl === 'over'))[0];
      const msg = c.lvl === 'over' ? `⚠️ ${CATS[c.k].l} : budget dépassé (${Utils.fmtS(c.sp)} / ${Utils.fmtS(c.b)} ${Utils.cur()})` : `⚠️ ${CATS[c.k].l} : ${c.pct}% du budget utilisé`;
      UI.toast(msg, c.lvl === 'over' ? 'error' : 'info');
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('💰 Budget App', { body: msg, icon: 'icon-192.png' });
    }
  },

  renderBudgetGauge() {
    const settings = DB.get('settings');
    const budgets = settings.monthlyBudget || {};
    const budget = budgets[this._year]?.[this._month] || 0;
    const container = UI.$('budgetGaugeContainer');
    const gaugeVal = UI.$('budgetGauge');
    const gaugeFill = UI.$('budgetGaugeFill');
    const summaryEl = UI.$('budgetSummary');
    if (!container) return;
    if (budget === 0) {
      container.style.display = 'none';
      if (summaryEl) summaryEl.textContent = 'Aucun objectif défini';
      this._lastBudgetAlert = null;
      return;
    }
    const mt = this.monthTxs();
    const expenses = mt.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const percent = Math.min(100, Math.round((expenses / budget) * 100));
    if (summaryEl) summaryEl.textContent = `${Utils.fmtS(expenses)} / ${Utils.fmtS(budget)} ${Utils.cur()} (${percent}%)`;
    container.style.display = '';
    if (gaugeVal) gaugeVal.textContent = `${Utils.fmtS(expenses)} / ${Utils.fmtS(budget)} ${Utils.cur()}`;
    if (gaugeFill) {
      gaugeFill.style.width = `${percent}%`;
      gaugeFill.style.background = percent >= 100 ? 'var(--red)' : percent >= 80 ? 'var(--gold)' : 'var(--green)';
    }
    if (gaugeVal) gaugeVal.style.color = percent >= 100 ? 'var(--red)' : percent >= 80 ? 'var(--gold)' : 'var(--green)';
    const alertKey = percent >= 100 ? 'over' : percent >= 80 ? 'warn' : null;
    if (alertKey && this._lastBudgetAlert !== alertKey) {
      this._lastBudgetAlert = alertKey;
      const msg = alertKey === 'over'
        ? `⚠️ Objectif dépassé ! ${Utils.fmtS(expenses)} / ${Utils.fmtS(budget)} ${DB.get('settings').currency || 'FCFA'}`
        : `⚠️ ${percent}% de votre budget mensuel utilisé`;
      UI.toast(msg, alertKey === 'over' ? 'error' : 'info');
      // Notification système si permission accordée
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('💰 Budget App', {
          body: alertKey === 'over'
            ? `Budget dépassé : ${Utils.fmtS(expenses)} / ${Utils.fmtS(budget)} ${Utils.cur()}`
            : `Attention : ${percent}% du budget mensuel consommé`,
          icon: 'icon-192.png'
        });
      }
    }
    if (!alertKey) this._lastBudgetAlert = null;
  },

  renderTxList() {
    let mt = this.monthTxs(); // transactions classiques

    // Récupérer les transferts du mois depuis la collection `transfers`
    const allTransfers = DB.get('transfers');
    const monthTransfers = allTransfers.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === this._month && d.getFullYear() === this._year;
    });

    // Construire un objet d'affichage pour chaque transfert
    const transferItems = monthTransfers.map(t => {
      let label = '';
      let type = 'expense';
      let color = 'var(--red)';
      let sign = '-';
      let icon = '🔄';

      if (t.fromType === 'account' && t.toType === 'account') {
        const fromAcc = DB.get('accounts').find(a => a.id === t.fromAccountId);
        const toAcc = DB.get('accounts').find(a => a.id === t.toAccountId);
        label = `Transfert : ${fromAcc?.name || '?'} → ${toAcc?.name || '?'}`;
        type = 'expense';
      } 
      else if (t.fromType === 'account' && t.toType === 'saving') {
        const fromAcc = DB.get('accounts').find(a => a.id === t.fromAccountId);
        const toSav = DB.get('savings').find(s => s.id === t.toSavingId);
        label = `Transfert compte → épargne : ${fromAcc?.name || '?'} → ${toSav?.name || '?'}`;
        type = 'expense';
      }
      else if (t.fromType === 'saving' && t.toType === 'account') {
        const fromSav = DB.get('savings').find(s => s.id === t.fromSavingId);
        const toAcc = DB.get('accounts').find(a => a.id === t.toAccountId);
        label = `Transfert épargne → compte : ${fromSav?.name || '?'} → ${toAcc?.name || '?'}`;
        type = 'income';
        color = 'var(--green)';
        sign = '+';
      }

      return {
        id: t.id,
        type: type,
        amount: t.amount,
        cat: 'transfert',
        desc: t.desc || label,
        date: t.date,
        isTransfer: true,
        transferDirection: type === 'expense' ? 'out' : 'in',
        transferData: t
      };
    });

    let allItems = [...mt, ...transferItems];
    // Appliquer filtre et recherche
    let list = this._filter === 'all' ? allItems : allItems.filter(t => t.cat === this._filter);
    if (this._searchTerm) {
      list = list.filter(t =>
        (t.desc && t.desc.toLowerCase().includes(this._searchTerm)) ||
        (t.cat === 'transfert' ? 'transfert'.includes(this._searchTerm) : (CATS[t.cat] && CATS[t.cat].l.toLowerCase().includes(this._searchTerm)))
      );
    }
    list = [...list].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 40);
    const el = UI.$('homeTxList');
    if (!list.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">🗒️</div>Aucune transaction</div>'; return; }
    el.innerHTML = list.map(t => {
      if (t.isTransfer) {
        const isOut = t.transferDirection === 'out';
        const icon = '🔄';
        const color = isOut ? 'var(--red)' : 'var(--green)';
        const sign = isOut ? '-' : '+';
        return `<div class="tx-item">
          <div class="tx-ico" style="background:${color}22">${icon}</div>
          <div class="tx-info"><div class="tx-name">${Utils.esc(t.desc)}</div><div class="tx-meta">${Utils.fmtDate(t.date)} · Transfert</div></div>
          <div class="tx-right">
            <div class="tx-amt" style="color:${color}">${sign}${Utils.fmtS(t.amount)}</div>
            <button class="tx-del" onclick="Actions.deleteTransfer('${t.id}')">✕</button>
          </div>
        </div>`;
      } else {
        const c = CATS[t.cat] || CATS.autre;
        const pos = t.type === 'income';
        return `<div class="tx-item" onclick="Modals.editTx('${t.id}')">
          <div class="tx-ico" style="background:${c.c}22">${c.e}</div>
          <div class="tx-info"><div class="tx-name">${Utils.esc(t.desc || c.l)}</div><div class="tx-meta">${Utils.fmtDate(t.date)} · ${c.l}</div></div>
          <div class="tx-right">
            <div class="tx-amt ${pos ? 'pos' : 'neg'}">${pos ? '+' : '-'}${Utils.fmtS(t.amount)}</div>
            <button class="tx-del" onclick="event.stopPropagation();Actions.deleteTx('${t.id}')">✕</button>
          </div>
        </div>`;
      }
    }).join('');
  },

  renderAccounts() {
    const acs = DB.get('accounts');
    const total = acs.reduce((s, a) => s + a.balance, 0);
    UI.txt('accountsSubtitle', acs.length + ' compte' + (acs.length > 1 ? 's' : '') + ' · Total : ' + Utils.fmt(total));
    if (!acs.length) { UI.html('accountsList', '<div class="empty"><div class="empty-icon">💳</div>Aucun compte</div>'); return; }
    const ops = DB.get('accountOps');
    UI.html('accountsList', acs.map(ac => {
      const btns = this._acButtons(ac);
      const lpKey = LP.register(() => Modals.openCtxMenu('account', ac.id, ac.name));
      const recentOp = ops.filter(o => o.accountId === ac.id).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      const lastTxt = recentOp ? 'Dernière op. : ' + Utils.fmtDate(recentOp.date) : 'Aucune opération';
      return `<div class="ac-card" data-lp="${lpKey}" onclick="if(!_lpFired)Nav.openDetail('account','${ac.id}')">
        <div class="ac-card-header">
          <div class="ac-card-brand">
            <div class="ac-card-logo" style="background:${COLOR_CSS[ac.colorKey] || 'var(--blue)'}22">${ac.icon}</div>
            <div><div class="ac-card-name">${Utils.esc(ac.name)}</div><div class="ac-card-sub">${lastTxt}</div></div>
          </div>
          <div class="ac-card-bal">
            <div class="ac-card-bal-val" style="color:${ac.balance < 0 ? 'var(--red)' : (COLOR_CSS[ac.colorKey] || 'var(--blue)')}">${Utils.fmt(ac.balance)}</div>
            <div class="ac-card-bal-lbl">Solde</div>
          </div>
        </div>
        <div class="ac-card-footer">${btns}</div>
        <div class="lp-hint">Appui long pour options</div>
      </div>`;
    }).join(''));
    LP.bindAll();
  },

  _acButtons(ac) {
    const id = ac.id;
    if (ac.type === 'mobile') {
      return `<button class="ac-card-btn out" onclick="event.stopPropagation();Modals.openAccountOp('${id}','send')">📤 Envoi</button>
              <button class="ac-card-btn in" onclick="event.stopPropagation();Modals.openAccountOp('${id}','receive')">📥 Réception</button>
              <button class="ac-card-btn cash" onclick="event.stopPropagation();Modals.openAccountOp('${id}','cashout')">💵 Retrait</button>`;
    }
    if (ac.type === 'cash') {
      return `<button class="ac-card-btn out" onclick="event.stopPropagation();Modals.openAccountOp('${id}','out')">💸 Sortie</button>
              <button class="ac-card-btn in" onclick="event.stopPropagation();Modals.openAccountOp('${id}','in')">💵 Entrée</button>`;
    }
    return `<button class="ac-card-btn out" onclick="event.stopPropagation();Modals.openAccountOp('${id}','withdraw')">📤 Retrait</button>
            <button class="ac-card-btn in" onclick="event.stopPropagation();Modals.openAccountOp('${id}','deposit')">📥 Dépôt</button>`;
  },

  renderAccountDetail(id) {
    const ac = DB.get('accounts').find(a => a.id === id);
    if (!ac) return;
    UI.txt('detailTitle', ac.name);
    UI.html('detailTopRight', '');
    const ops = DB.get('accountOps').filter(o => o.accountId === id).sort((a, b) => new Date(b.date) - new Date(a.date));
    const btns = this._detailButtons(ac);
    UI.html('detailBody', `
      <div class="detail-hero">
        <div class="detail-hero-icon">${ac.icon}</div>
        <div class="detail-hero-name">${Utils.esc(ac.name)}</div>
        <div class="detail-hero-bal" style="color:${ac.balance < 0 ? 'var(--red)' : (COLOR_CSS[ac.colorKey] || 'var(--blue)')}">${Utils.fmt(ac.balance)}</div>
        <div class="detail-hero-sub">Solde disponible</div>
      </div>
      <div class="detail-actions-row">${btns}</div>
      <div class="sec-title" style="margin-bottom:10px">Historique</div>
      <div class="detail-ops">${ops.length ? ops.map(o => this._opRow(o, 'accountOps')).join('') : '<div class="empty"><div class="empty-icon">📋</div>Aucune opération</div>'}</div>
    `);
  },

  _detailButtons(ac) {
    const id = ac.id;
    if (ac.type === 'mobile') {
      return `<button class="detail-act-btn out" onclick="Modals.openAccountOp('${id}','send')"><span class="dat-icon">📤</span>Envoi</button>
              <button class="detail-act-btn in" onclick="Modals.openAccountOp('${id}','receive')"><span class="dat-icon">📥</span>Réception</button>
              <button class="detail-act-btn cash" onclick="Modals.openAccountOp('${id}','cashout')"><span class="dat-icon">💵</span>Retrait</button>`;
    }
    if (ac.type === 'cash') {
      return `<button class="detail-act-btn out" onclick="Modals.openAccountOp('${id}','out')"><span class="dat-icon">💸</span>Sortie</button>
              <button class="detail-act-btn in" onclick="Modals.openAccountOp('${id}','in')"><span class="dat-icon">💵</span>Entrée</button>`;
    }
    return `<button class="detail-act-btn out" onclick="Modals.openAccountOp('${id}','withdraw')"><span class="dat-icon">📤</span>Retrait</button>
            <button class="detail-act-btn in" onclick="Modals.openAccountOp('${id}','deposit')"><span class="dat-icon">📥</span>Dépôt</button>`;
  },

  _opRow(op, collection) {
    const OPS_CFG = {
      send: { icon: '📤', col: 'var(--red)', sign: '-' }, receive: { icon: '📥', col: 'var(--green)', sign: '+' },
      cashout: { icon: '💵', col: 'var(--gold)', sign: '-' }, withdraw: { icon: '📤', col: 'var(--red)', sign: '-' },
      deposit: { icon: '📥', col: 'var(--green)', sign: '+' }, out: { icon: '💸', col: 'var(--red)', sign: '-' },
      in: { icon: '💵', col: 'var(--green)', sign: '+' }, deposit_sav: { icon: '🐖', col: 'var(--green)', sign: '+' },
      withdraw_sav: { icon: '📤', col: 'var(--red)', sign: '-' },
      transfer_out: { icon: '🔄', col: 'var(--blue)', sign: '-' }, transfer_in: { icon: '🔄', col: 'var(--blue)', sign: '+' },
      transfer_to_saving: { icon: '🔄', col: 'var(--red)', sign: '-' }, transfer_from_saving: { icon: '🔄', col: 'var(--green)', sign: '+' }
    };
    const cfg = OPS_CFG[op.type] || { icon: '💸', col: 'var(--text2)', sign: '±' };
    return `<div class="op-row">
      <span class="op-ico">${cfg.icon}</span>
      <div class="op-info"><div class="op-desc">${Utils.esc(op.desc || op.type)}</div><div class="op-date">${Utils.fmtDate(op.date)}</div></div>
      <div class="op-right">
        <div class="op-amt" style="color:${cfg.col}">${cfg.sign}${Utils.fmtS(op.amount)} F</div>
        <button class="op-del" onclick="Actions.deleteOp('${op.id}','${collection}')">✕</button>
      </div>
    </div>`;
  },

  renderSavings() {
    const savs = DB.get('savings');
    const total = savs.reduce((s, v) => s + v.balance, 0);
    UI.txt('savingsSubtitle', savs.length + ' épargne' + (savs.length > 1 ? 's' : '') + ' · Total : ' + Utils.fmt(total));
    if (!savs.length) { UI.html('savingsList', '<div class="empty"><div class="empty-icon">🐖</div>Aucune épargne</div>'); return; }
    UI.html('savingsList', savs.map(sv => {
      const lpKey = LP.register(() => Modals.openCtxMenu('saving', sv.id, sv.name));
      let progressHTML = '';
      if (sv.goal > 0) {
        const pct = Math.min(100, Math.round(sv.balance / sv.goal * 100));
        progressHTML = `<div class="sav-progress-wrap">
          <div class="sav-progress-track"><div class="sav-progress-fill" style="width:${pct}%;background:${COLOR_HEX.gold}"></div></div>
          <div class="sav-progress-lbl">${pct}% de l'objectif (${Utils.fmtS(sv.goal)} F)</div>
        </div>`;
      }
      return `<div class="sav-card" data-lp="${lpKey}" onclick="if(!_lpFired)Nav.openDetail('saving','${sv.id}')">
        <div class="sav-top">
          <div class="sav-emoji">${sv.emoji || '🐖'}</div>
          <div class="sav-info">
            <div class="sav-name">${Utils.esc(sv.name)}</div>
            <div class="sav-goal-lbl">${sv.goal > 0 ? 'Objectif : ' + Utils.fmt(sv.goal) : 'Épargne libre'}</div>
          </div>
          <div class="sav-bal" style="color:${COLOR_HEX.gold}">${Utils.fmtS(sv.balance)} F</div>
        </div>
        ${progressHTML}
        <div class="lp-hint">Appui long pour options</div>
      </div>`;
    }).join(''));
    LP.bindAll();
  },

  renderSavingDetail(id) {
    const sv = DB.get('savings').find(s => s.id === id);
    if (!sv) return;
    UI.txt('detailTitle', sv.name);
    UI.html('detailTopRight', '');
    const ops = DB.get('savingsOps').filter(o => o.savingId === id).sort((a, b) => new Date(b.date) - new Date(a.date));
    let goalHTML = '';
    if (sv.goal > 0) {
      const pct = Math.min(100, Math.round(sv.balance / sv.goal * 100));
      goalHTML = `<div class="sav-detail-goal">
        <div class="sdg-top"><span>Progression</span><span>${Utils.fmtS(sv.balance)} / ${Utils.fmtS(sv.goal)} F</span></div>
        <div class="sdg-track"><div class="sdg-fill" style="width:${pct}%"></div></div>
        <div style="text-align:right;font-size:.65rem;color:var(--text3);margin-top:4px">${pct}% atteint</div>
      </div>`;
    }
    UI.html('detailBody', `
      <div class="detail-hero">
        <div class="detail-hero-icon">${sv.emoji || '🐖'}</div>
        <div class="detail-hero-name">${Utils.esc(sv.name)}</div>
        <div class="detail-hero-bal" style="color:${COLOR_HEX.gold}">${Utils.fmt(sv.balance)}</div>
        <div class="detail-hero-sub">Solde épargne</div>
      </div>
      ${goalHTML}
      <div class="detail-actions-row">
        <button class="detail-act-btn in" onclick="Modals.openSavingOp('${id}','deposit')"><span class="dat-icon">🐖</span>Mettre de côté</button>
        <button class="detail-act-btn out" onclick="Modals.openSavingOp('${id}','withdraw')"><span class="dat-icon">📤</span>Retirer</button>
      </div>
      <div class="sec-title" style="margin-bottom:10px">Historique</div>
      <div class="detail-ops">${ops.length ? ops.map(o => this._opRow({ ...o, type: o.type === 'deposit' ? 'deposit_sav' : o.type === 'withdraw' ? 'withdraw_sav' : o.type }, 'savingsOps')).join('') : '<div class="empty"><div class="empty-icon">📋</div>Aucune opération</div>'}</div>
    `);
  },

  renderSettings() {
    const s = DB.get('settings');
    const n = s.name || 'Utilisateur';
    UI.txt('profileNameEl', n);
    UI.txt('avatarLetter', n.charAt(0).toUpperCase() || '?');
    const tog = UI.$('darkToggle');
    if (tog) tog.checked = s.theme !== 'light';
    const metaTc = document.getElementById('metaThemeColor');
    if (metaTc) metaTc.setAttribute('content', s.theme === 'light' ? '#f4f6fb' : '#0b0f1a');
    try { PWA.renderInstallSection(); } catch (_) { }

    const sec = UI.$('fsyncSection');
    if (!sec) return;

    if (!FileSync.isSupported()) {
      sec.innerHTML = `<div class="fsync-card"><div class="fsync-unsupported-notice"><strong>⚠️ Navigateur non supporté</strong><br>La sauvegarde fichier nécessite Chrome ou Edge.</div></div>`;
      return;
    }

    const connected = FileSync.isConnected();
    const status = FileSync.getStatus();
    const fileName = FileSync.getFileName();
    const lastSaved = FileSync.getLastSaved();
    const statusLabels = { idle: 'Prêt', saving: 'Sauvegarde…', saved: 'Synchronisé ✓', error: 'Erreur' };
    const statusColors = { idle: 'var(--text3)', saving: 'var(--gold)', saved: 'var(--green)', error: 'var(--red)' };
    const lastSavedTxt = lastSaved ? 'Dernière : ' + lastSaved.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : (connected ? 'Jamais sauvegardé' : 'Aucun fichier');

    sec.innerHTML = `<div class="fsync-card">
      <div class="fsync-status-row">
        <div class="fsync-dot-wrap"><span style="font-size:1.15rem">${connected ? '📄' : '📂'}</span></div>
        <div class="fsync-info">
          <div class="fsync-name">${connected ? Utils.esc(fileName) : 'Aucun fichier sélectionné'}</div>
          <div class="fsync-sub" style="color:${statusColors[status] || 'var(--text3)'}">${connected ? statusLabels[status] || '' : lastSavedTxt}</div>
          ${connected ? `<div class="fsync-sub">${lastSavedTxt}</div>` : ''}
        </div>
      </div>
      <div class="fsync-btn-row">
        <button class="fsync-btn primary" onclick="FileSync.chooseFile()"><span class="fbi">📂</span>Choisir</button>
        <button class="fsync-btn${connected ? '' : ' primary'}" onclick="FileSync.saveNow()" ${connected ? '' : 'disabled style="opacity:.4;cursor:default"'}>💾 Sauvegarder</button>
        <button class="fsync-btn" onclick="FileSync.loadFile()"><span class="fbi">📥</span>Charger</button>
        ${connected ? '<button class="fsync-btn danger" onclick="FileSync.disconnect()"><span class="fbi">✕</span>Déconnecter</button>' : ''}
      </div>
    </div>`;
  },

  init() {
    const s = DB.get('settings');
    document.documentElement.setAttribute('data-theme', s.theme || 'dark');
    this._lastBudgetAlert = null;
    FileSync.init();
    PWA.init();
    this.renderHome();
    this.initSearch();

    // Demande de permission de notifications (non bloquant, au 1er load)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      setTimeout(() => {
        Notification.requestPermission().catch(() => {});
      }, 3000);
    }

    const statsPrev = document.getElementById('statsMonthPrev');
    const statsNext = document.getElementById('statsMonthNext');
    if (statsPrev) statsPrev.onclick = () => Modals.changeStatsMonth(-1);
    if (statsNext) statsNext.onclick = () => Modals.changeStatsMonth(1);
  }
};

// ==================================================
// MODALS
// ==================================================
let _txType = 'expense';
let _selectedCat = 'alimentation';
let _acId = '';
let _acOpType = '';
let _savId = '';
let _savOpType = '';
let _acSetupId = '';
let _renameType = '';
let _renameId = '';

const OP_CFG = {
  send: { title: '📤 Envoi', descLbl: 'Destinataire', ph: 'Ex: +226 70 00 00 00', btnCls: 'btn-wave', sign: -1 },
  receive: { title: '📥 Réception', descLbl: 'Expéditeur', ph: 'Ex: Mamadou K.', btnCls: 'btn-green', sign: +1 },
  cashout: { title: '💵 Retrait', descLbl: 'Point de retrait', ph: 'Ex: Agent Wave', btnCls: 'btn-gold', sign: -1 },
  withdraw: { title: '📤 Retrait', descLbl: 'Référence', ph: 'Ex: Retrait DAB', btnCls: 'btn-red', sign: -1 },
  deposit: { title: '📥 Dépôt', descLbl: 'Source', ph: 'Ex: Virement reçu', btnCls: 'btn-green', sign: +1 },
  out: { title: '💸 Sortie', descLbl: 'Motif', ph: 'Ex: Achat', btnCls: 'btn-red', sign: -1 },
  in: { title: '💵 Entrée', descLbl: 'Source', ph: 'Ex: Vente', btnCls: 'btn-green', sign: +1 }
};

const Modals = {
  statsMonth: new Date().getMonth(),
  statsYear: new Date().getFullYear(),

  open(id) {
    const el = UI.$(id);
    if (!el) return;
    el.classList.add('open');
    el._touchHandler = e => { if (e.target === el) e.preventDefault(); };
    el.addEventListener('touchmove', el._touchHandler, { passive: false });
  },

  close(id) {
    const el = UI.$(id);
    if (!el) return;
    el.classList.remove('open');
    if (el._touchHandler) el.removeEventListener('touchmove', el._touchHandler);
  },

  closeCtx(e) { if (e.target === UI.$('ctxOverlay')) this.close('ctxOverlay'); },

  openTransfer() {
    // Transfert entre comptes
    const fromSelect = UI.$('transferFromAccount');
    const toSelect = UI.$('transferToAccount');
    const accounts = DB.get('accounts');
    if (accounts.length < 2) {
      UI.toast('Vous devez avoir au moins 2 comptes pour effectuer un transfert', 'error');
      return;
    }
    const options = accounts.map(ac => `<option value="${ac.id}">${ac.icon} ${Utils.esc(ac.name)} - ${Utils.fmtS(ac.balance)} ${Utils.cur()}</option>`).join('');
    fromSelect.innerHTML = options;
    toSelect.innerHTML = options;
    UI.$('transferAmount').value = '';
    UI.$('transferDesc').value = '';
    this.open('transferModal');
  },

  openTransferToSaving() {
    const accounts = DB.get('accounts');
    const savings = DB.get('savings');
    if (accounts.length === 0 || savings.length === 0) {
      UI.toast('Vous devez avoir au moins un compte et une épargne', 'error');
      return;
    }
    const accountOptions = accounts.map(ac => `<option value="${ac.id}">${ac.icon} ${Utils.esc(ac.name)} - ${Utils.fmtS(ac.balance)} ${Utils.cur()}</option>`).join('');
    const savingOptions = savings.map(sv => `<option value="${sv.id}">${sv.emoji || '🐖'} ${Utils.esc(sv.name)} - ${Utils.fmtS(sv.balance)} ${Utils.cur()}</option>`).join('');
    UI.$('transferSourceAccount').innerHTML = accountOptions;
    UI.$('transferDestAccount').innerHTML = accountOptions;
    UI.$('transferSourceSaving').innerHTML = savingOptions;
    UI.$('transferDestSaving').innerHTML = savingOptions;
    UI.$('transferSavingAmount').value = '';
    UI.$('transferSavingDesc').value = '';
    this._updateTransferSavingFields('accountToSaving');
    const dirSelect = UI.$('transferDirection');
    dirSelect.onchange = () => this._updateTransferSavingFields(dirSelect.value);
    this.open('transferSavingModal');
  },

  _updateTransferSavingFields(direction) {
    const srcAccField = UI.$('transferSourceAccountField');
    const srcSavField = UI.$('transferSourceSavingField');
    const dstAccField = UI.$('transferDestAccountField');
    const dstSavField = UI.$('transferDestSavingField');
    if (direction === 'accountToSaving') {
      srcAccField.style.display = '';
      srcSavField.style.display = 'none';
      dstAccField.style.display = 'none';
      dstSavField.style.display = '';
    } else {
      srcAccField.style.display = 'none';
      srcSavField.style.display = '';
      dstAccField.style.display = '';
      dstSavField.style.display = 'none';
    }
  },

  openCatBudgets() {
    const cb = DB.get('settings').catBudgets || {};
    UI.html('catBudgetFields', Object.keys(CATS).filter(k => k !== 'salaire').map(k => `<div class="field"><label>${CATS[k].e} ${CATS[k].l} (${Utils.cur()} / mois)</label><div class="amt-wrap"><span class="amt-sign">F</span><input type="number" id="cb_${k}" min="0" placeholder="0" value="${cb[k] || ''}"/></div></div>`).join(''));
    this.open('catBudgetOverlay');
  },

  openRecurring() {
    UI.$('rcCat').innerHTML = Object.keys(CATS).map(k => `<option value="${k}">${CATS[k].e} ${CATS[k].l}</option>`).join('');
    const accs = DB.get('accounts');
    UI.$('rcAcc').innerHTML = accs.length ? accs.map(a => `<option value="${a.id}">${a.icon} ${Utils.esc(a.name)}</option>`).join('') : '<option value="">Aucun compte - créez-en un</option>';
    Actions.renderRecurring();
    this.open('recurOverlay');
  },

  editTx(id) {
    const tx = DB.get('txs').find(t => t.id === id);
    if (!tx || _lpFired) return;
    _selectedCat = tx.cat;
    this.openTx(tx.type);
    Actions._editId = id;
    const _tt = document.querySelector('#txOverlay .modal-title-text'); if (_tt) _tt.textContent = 'Modifier la transaction';
    UI.$('txAmt').value = tx.amount;
    UI.$('txDesc').value = tx.desc || '';
    if (tx.accountId) UI.$('txAccountId').value = tx.accountId;
  },

  openTx(type = 'expense') {
    Actions._editId = null;
    const _tt = document.querySelector('#txOverlay .modal-title-text'); if (_tt) _tt.textContent = 'Nouvelle transaction';
    _txType = type;
    UI.$('txAmt').value = '';
    UI.$('txDesc').value = '';

    const accountSelect = UI.$('txAccountId');
    const accounts = DB.get('accounts');
    if (accounts.length === 0) {
      accountSelect.innerHTML = '<option value="">Aucun compte - créez-en un</option>';
    } else {
      accountSelect.innerHTML = accounts.map(ac =>
        `<option value="${ac.id}">${ac.icon} ${Utils.esc(ac.name)} - ${Utils.fmtS(ac.balance)} ${Utils.cur()}</option>`
      ).join('');
    }

    _syncTxType();
    _buildCats();
    this.open('txOverlay');
  },

  setTxType(t) { _txType = t; _syncTxType(); _buildCats(); },

  openAccountOp(acId, opType) {
    _acId = acId;
    _acOpType = opType;
    const cfg = OP_CFG[opType] || { title: 'Opération', descLbl: 'Description', ph: '', btnCls: 'btn-blue', sign: +1 };
    UI.txt('acOpTitle', cfg.title);
    UI.$('acOpDesc').placeholder = cfg.ph;
    UI.txt('acOpDescLbl', cfg.descLbl);
    UI.$('acOpAmt').value = '';
    UI.$('acOpDesc').value = '';
    const warn = UI.$('acOpWarn');
    if (cfg.sign === -1) {
      const ac = DB.get('accounts').find(a => a.id === acId);
      warn.textContent = `Solde disponible : ${Utils.fmtS(ac?.balance || 0)} F`;
      warn.style.display = 'block';
    } else { warn.style.display = 'none'; }
    const btn = UI.$('acOpBtn');
    btn.className = 'btn-primary ' + (cfg.btnCls || 'btn-blue');
    btn.textContent = cfg.title;
    this.open('acOpOverlay');
    setTimeout(() => UI.$('acOpAmt').focus(), 340);
  },

  openAccountForm(editId = null) {
    _acSetupId = editId;
    UI.txt('acFormTitle', editId ? 'Modifier' : 'Nouveau compte');
    const ac = editId ? DB.get('accounts').find(a => a.id === editId) : null;
    UI.$('acFormName').value = ac ? ac.name : '';
    UI.$('acFormBal').value = ac ? ac.balance : '';
    if (ac) UI.$('acFormType').value = ac.type || 'bank';
    const showSelect = UI.$('acFormShowOnHome');
    if (showSelect) {
      showSelect.value = ac ? (ac.showOnHome !== false ? 'true' : 'false') : 'true';
    }
    let selEmoji = ac ? ac.icon : AC_ICONS[0];
    UI.html('acFormEmojis', AC_ICONS.map(e => `<div class="emoji-opt ${e === selEmoji ? 'sel' : ''}" onclick="Modals._pickAcEmoji('${e}',this)">${e}</div>`).join(''));
    let selColor = ac ? ac.colorKey : COLORS[0];
    UI.html('acFormColors', COLORS.map(c => `<div class="color-opt ${c === selColor ? 'sel' : ''}" style="background:${COLOR_HEX[c]}" onclick="Modals._pickAcColor('${c}',this)" data-color="${c}"></div>`).join(''));
    this.open('acFormOverlay');
  },

  _pickAcEmoji(e, el) { document.querySelectorAll('#acFormEmojis .emoji-opt').forEach(x => x.classList.remove('sel')); el.classList.add('sel'); },
  _pickAcColor(c, el) { document.querySelectorAll('#acFormColors .color-opt').forEach(x => x.classList.remove('sel')); el.classList.add('sel'); },

  openSavingForm(editId = null) {
    _acSetupId = editId;
    UI.txt('savFormTitle', editId ? 'Modifier' : 'Nouvelle épargne');
    const sv = editId ? DB.get('savings').find(s => s.id === editId) : null;
    UI.$('savFormName').value = sv ? sv.name : '';
    UI.$('savFormGoal').value = sv && sv.goal ? sv.goal : '';
    let selEmoji = sv ? sv.emoji : SAV_EMOJIS[0];
    UI.html('savFormEmojis', SAV_EMOJIS.map(e => `<div class="emoji-opt ${e === selEmoji ? 'sel' : ''}" onclick="Modals._pickSavEmoji('${e}',this)">${e}</div>`).join(''));
    this.open('savFormOverlay');
  },

  _pickSavEmoji(e, el) { document.querySelectorAll('#savFormEmojis .emoji-opt').forEach(x => x.classList.remove('sel')); el.classList.add('sel'); },

  openSavingOp(savId, opType) {
    _savId = savId;
    _savOpType = opType;
    const sv = DB.get('savings').find(s => s.id === savId);
    UI.txt('savOpTitle', opType === 'deposit' ? '🐖 Mettre de côté' : '📤 Retirer');
    UI.$('savOpAmt').value = '';
    UI.$('savOpNote').value = '';
    const warn = UI.$('savOpWarn');
    if (opType === 'withdraw' && sv) { warn.textContent = `Solde épargne : ${Utils.fmtS(sv.balance)} F`; warn.style.display = 'block'; }
    else { warn.style.display = 'none'; }
    const btn = UI.$('savOpBtn');
    btn.className = 'btn-primary ' + (opType === 'deposit' ? 'btn-green' : 'btn-red');
    btn.textContent = opType === 'deposit' ? 'Mettre de côté' : 'Retirer';
    this.open('savOpOverlay');
    setTimeout(() => UI.$('savOpAmt').focus(), 340);
  },

  openStats() {
    this.statsMonth = App._month;
    this.statsYear = App._year;
    UI.txt('statsMonthLbl', MONTHS[this.statsMonth] + ' ' + this.statsYear);
    this.renderStatsContent();
    this.open('statsOverlay');
  },

  changeStatsMonth(delta) {
    this.statsMonth += delta;
    if (this.statsMonth > 11) { this.statsMonth = 0; this.statsYear++; }
    if (this.statsMonth < 0) { this.statsMonth = 11; this.statsYear--; }
    UI.txt('statsMonthLbl', MONTHS[this.statsMonth] + ' ' + this.statsYear);
    this.renderStatsContent();
  },

  renderStatsContent() {
    const txs = DB.get('txs').filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === this.statsMonth && d.getFullYear() === this.statsYear;
    });
    const totalExp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const bycat = {};
    txs.filter(t => t.type === 'expense').forEach(t => { bycat[t.cat] = (bycat[t.cat] || 0) + t.amount; });
    const entries = Object.entries(bycat).sort((a, b) => b[1] - a[1]);
    const canvas = UI.$('pieCanvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2, R = 54, r = 24;
    ctx.clearRect(0, 0, W, H);
    if (!entries.length) {
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(128,168,200,0.08)'; ctx.fill();
      ctx.fillStyle = 'rgba(128,168,200,0.4)'; ctx.font = '9.5px DM Sans,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Aucune dépense', cx, cy + 4);
      UI.html('pieLegend', '');
      UI.html('progList', '<div class="empty">Aucune dépense</div>');
      return;
    }
    let angle = -Math.PI / 2;
    entries.forEach(([cat, amt]) => {
      const c = CATS[cat] || CATS.autre;
      const sl = (amt / totalExp) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, angle, angle + sl); ctx.closePath();
      ctx.fillStyle = c.c; ctx.fill();
      angle += sl;
    });
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    ctx.fillStyle = dark ? '#152030' : '#ffffff'; ctx.fill();
    ctx.fillStyle = dark ? '#eef2fb' : '#0f172a';
    ctx.font = 'bold 10.5px Syne,sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = totalExp < 0 ? 'var(--red)' : (dark ? '#eef2fb' : '#0f172a');
    ctx.fillText(Utils.fmtS(totalExp), cx, cy - 1);
    ctx.fillStyle = dark ? '#4d7a9a' : '#8fafc8'; ctx.font = '7.5px DM Sans,sans-serif';
    ctx.fillText(DB.get('settings').currency || 'FCFA', cx, cy + 11);
    UI.html('pieLegend', entries.map(([cat, amt]) => {
      const c = CATS[cat] || CATS.autre;
      const pct = Math.round(amt / totalExp * 100);
      return `<div class="leg-item"><div class="leg-dot" style="background:${c.c}"></div><span class="leg-name">${c.e} ${c.l}</span><span class="leg-pct">${pct}%</span></div>`;
    }).join(''));
    UI.html('progList', entries.map(([cat, amt]) => {
      const c = CATS[cat] || CATS.autre;
      const pct = Math.round(amt / totalExp * 100);
      return `<div class="prog-item"><div class="prog-top"><div class="prog-name">${c.e} ${c.l}</div><div class="prog-vals">${Utils.fmtS(amt)} F · ${pct}%</div></div><div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${c.c}"></div></div></div>`;
    }).join(''));
    this._renderBalanceChart();
  },

  _renderBalanceChart() {
    const canvas = UI.$('balanceChartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';

    // Construire les 6 derniers mois
    const months = [];
    let m = this.statsMonth, y = this.statsYear;
    for (let i = 5; i >= 0; i--) {
      let mm = m - i, yy = y;
      if (mm < 0) { mm += 12; yy--; }
      months.push({ month: mm, year: yy, label: MONTHS[mm].slice(0, 3) });
    }

    // Calculer le solde net par mois (revenus - dépenses)
    const allTxs = DB.get('txs');
    const data = months.map(({ month, year }) => {
      const txsM = allTxs.filter(t => { const d = new Date(t.date); return d.getMonth() === month && d.getFullYear() === year; });
      const inc = txsM.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const exp = txsM.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      return inc - exp;
    });

    const maxAbs = Math.max(...data.map(Math.abs), 1);
    const padX = 28, padY = 14;
    const chartW = W - padX * 2, chartH = H - padY * 2;
    const zero = padY + chartH / 2;

    // Grille zéro
    ctx.beginPath(); ctx.moveTo(padX, zero); ctx.lineTo(W - padX, zero);
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1; ctx.stroke();

    // Points & ligne
    const pts = data.map((v, i) => ({
      x: padX + (i / (months.length - 1)) * chartW,
      y: zero - (v / maxAbs) * (chartH / 2 - 4)
    }));

    // Gradient fill
    const grad = ctx.createLinearGradient(0, padY, 0, H - padY);
    grad.addColorStop(0, 'rgba(59,158,255,0.22)');
    grad.addColorStop(1, 'rgba(59,158,255,0.01)');
    ctx.beginPath();
    ctx.moveTo(pts[0].x, zero);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, zero);
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // Ligne principale
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = '#3b9eff'; ctx.lineWidth = 2;
    ctx.lineJoin = 'round'; ctx.stroke();

    // Points & labels
    ctx.font = '8px DM Sans,sans-serif'; ctx.textAlign = 'center';
    pts.forEach((p, i) => {
      const v = data[i];
      const col = v >= 0 ? '#00d97e' : '#ff4d6d';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = dark ? '#8fafc8' : '#4a6880';
      ctx.fillText(months[i].label, p.x, H - 2);
      if (v !== 0) {
        const sign = v > 0 ? '+' : '';
        ctx.fillStyle = col;
        const yVal = v >= 0 ? p.y - 6 : p.y + 13;
        ctx.fillText(sign + (Math.abs(v) >= 1000 ? (Math.round(Math.abs(v)/1000*10)/10) + 'k' : Math.round(Math.abs(v))), p.x, yVal);
      }
    });
  },

  openProfile() {
    const s = DB.get('settings');
    UI.$('profileName').value = s.name || '';
    UI.$('currencySel').value = s.currency || 'FCFA';
    this.open('profileOverlay');
  },

  openRename(type, id, currentName) {
    _renameType = type;
    _renameId = id;
    UI.txt('renameTitle', type === 'account' ? 'Renommer le compte' : 'Renommer l\'épargne');
    UI.$('renameInput').value = currentName;
    this.close('ctxOverlay');
    this.open('renameOverlay');
    setTimeout(() => { UI.$('renameInput').focus(); UI.$('renameInput').select(); }, 340);
  },

  openConfirm(title, msg, onConfirm) {
    UI.txt('confirmTitle', title);
    UI.html('confirmMsg', msg);
    UI.$('confirmBtn').onclick = () => { onConfirm(); this.close('confirmOverlay'); };
    this.open('confirmOverlay');
  },

  openCtxMenu(type, id, name) {
    UI.txt('ctxTitle', name); // textContent — safe
    const safeName = encodeURIComponent(name);
    const items = type === 'account' ? [
      { icon: '✏️', label: 'Renommer',          dataAction: `rename-account:${id}:${safeName}` },
      { icon: '⚙️', label: 'Modifier',           dataAction: `edit-account:${id}` },
      { divider: true },
      { icon: '🗑️', label: 'Supprimer', danger: true, dataAction: `delete-account:${id}` }
    ] : [
      { icon: '✏️', label: 'Renommer',               dataAction: `rename-saving:${id}:${safeName}` },
      { icon: '🎯', label: 'Modifier objectif',       dataAction: `edit-saving:${id}` },
      { divider: true },
      { icon: '🗑️', label: 'Supprimer', danger: true, dataAction: `delete-saving:${id}` }
    ];
    UI.html('ctxItems', items.map(it => {
      if (it.divider) return '<div class="ctx-divider"></div>';
      return `<div class="ctx-item" data-action="${it.dataAction}"><span class="ctx-item-icon">${it.icon}</span><span class="ctx-item-label${it.danger ? ' danger' : ''}">${it.label}</span></div>`;
    }).join(''));
    // Event delegation — pas de onclick inline avec données utilisateur
    document.querySelectorAll('#ctxItems .ctx-item').forEach(el => {
      el.addEventListener('click', () => {
        const [action, itemId, encodedName] = el.dataset.action.split(':');
        const itemName = encodedName ? decodeURIComponent(encodedName) : '';
        Modals.close('ctxOverlay');
        if (action === 'rename-account') Modals.openRename('account', itemId, itemName);
        else if (action === 'edit-account')   Modals.openAccountForm(itemId);
        else if (action === 'delete-account') Actions.confirmDeleteAccount(itemId);
        else if (action === 'rename-saving')  Modals.openRename('saving', itemId, itemName);
        else if (action === 'edit-saving')    Modals.openSavingForm(itemId);
        else if (action === 'delete-saving')  Actions.confirmDeleteSaving(itemId);
      });
    });
    this.open('ctxOverlay');
  },

  openHomeAccountsSettings() {
    const container = UI.$('homeAccountsList');
    if (!container) return;
    const accounts = DB.get('accounts');
    container.innerHTML = accounts.map(ac => `
      <div class="srow" style="cursor:default">
        <span class="srow-icon">${ac.icon}</span>
        <div class="srow-info">
          <div class="srow-name">${Utils.esc(ac.name)}</div>
          <div class="srow-desc">${Utils.fmt(ac.balance)}</div>
        </div>
        <label class="toggle">
          <input type="checkbox" class="home-account-toggle" data-id="${ac.id}" ${ac.showOnHome !== false ? 'checked' : ''}>
          <div class="toggle-track"></div>
        </label>
      </div>
    `).join('');
    container.querySelectorAll('.home-account-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const accountId = toggle.dataset.id;
        const isChecked = toggle.checked;
        DB.update('accounts', accounts => {
          const ac = accounts.find(a => a.id === accountId);
          if (ac) ac.showOnHome = isChecked;
        });
        App.renderHome();
      });
    });
    this.open('homeAccountsModal');
  },

  openBudgetSettings() {
    const settings = DB.get('settings');
    const budget = settings.monthlyBudget || {};
    const currentMonth = App._month;
    const currentYear = App._year;
    UI.$('budgetAmount').value = budget[currentYear]?.[currentMonth] || '';
    UI.$('budgetMonth').value = currentMonth;
    UI.$('budgetYear').value = currentYear;
    this.open('budgetModal');
  },

  confirmReset() {
    this.openConfirm('⚠️ Réinitialisation', 'Cette action supprimera toutes vos données.', () => {
      DB.set('txs', []);
      DB.set('accounts', []);
      DB.set('accountOps', []);
      DB.set('savings', []);
      DB.set('savingsOps', []);
      DB.set('transfers', []);
      App.renderHome();
      App.renderAccounts();
      App.renderSavings();
      UI.toast('Données réinitialisées', 'success');
    });
  }
};

// ==================================================
// ACTIONS - Logique métier
// ==================================================
const Actions = {
  _isSubmitting: false,

  saveTransfer() {
    if (this._isSubmitting) return;
    this._isSubmitting = true;
    
    const fromAccountId = UI.$('transferFromAccount').value;
    const toAccountId = UI.$('transferToAccount').value;
    const amount = Utils.parseAmt(UI.$('transferAmount').value);
    const desc = UI.$('transferDesc').value.trim() || 'Transfert';
    
    if (!fromAccountId || !toAccountId) {
      UI.toast('Veuillez sélectionner les comptes', 'error');
      this._isSubmitting = false;
      return;
    }
    
    if (fromAccountId === toAccountId) {
      UI.toast('Les comptes source et destination doivent être différents', 'error');
      this._isSubmitting = false;
      return;
    }
    
    if (amount <= 0) {
      UI.toast('Montant invalide', 'error');
      this._isSubmitting = false;
      return;
    }
    
    const fromAccount = DB.get('accounts').find(a => a.id === fromAccountId);
    if (fromAccount && amount > fromAccount.balance) {
      UI.toast(`Solde insuffisant sur le compte source (${Utils.fmtS(fromAccount.balance)} ${Utils.cur()})`, 'error');
      this._isSubmitting = false;
      return;
    }
    
    const now = new Date().toISOString();
    const transferId = Utils.uid();
    
    DB.update('accounts', accounts => {
      const fromAc = accounts.find(a => a.id === fromAccountId);
      const toAc = accounts.find(a => a.id === toAccountId);
      if (fromAc) fromAc.balance = Math.round((fromAc.balance - amount) * 100) / 100;
      if (toAc) toAc.balance = Math.round((toAc.balance + amount) * 100) / 100;
    });
    
    DB.update('transfers', transfers => transfers.push({
      id: transferId,
      fromType: 'account',
      toType: 'account',
      fromAccountId,
      toAccountId,
      amount,
      desc,
      date: now
    }));
    
    DB.update('accountOps', ops => ops.push(
      {
        id: Utils.uid(),
        accountId: fromAccountId,
        type: 'transfer_out',
        amount: amount,
        desc: `Transfert vers ${DB.get('accounts').find(a => a.id === toAccountId)?.name || 'autre compte'} : ${desc}`,
        date: now,
        transferId: transferId
      },
      {
        id: Utils.uid(),
        accountId: toAccountId,
        type: 'transfer_in',
        amount: amount,
        desc: `Transfert depuis ${DB.get('accounts').find(a => a.id === fromAccountId)?.name || 'autre compte'} : ${desc}`,
        date: now,
        transferId: transferId
      }
    ));
    
    this._isSubmitting = false;
    Modals.close('transferModal');
    App.renderHome();
    App.renderAccounts();
    UI.toast(`✅ ${Utils.fmtS(amount)} ${Utils.cur()} transféré avec succès`, 'success');
  },

  saveTransferToSaving() {
    if (this._isSubmitting) return;
    this._isSubmitting = true;
    
    const direction = UI.$('transferDirection').value;
    const amount = Utils.parseAmt(UI.$('transferSavingAmount').value);
    const desc = UI.$('transferSavingDesc').value.trim() || (direction === 'accountToSaving' ? 'Alimentation épargne' : 'Retrait épargne');
    
    if (amount <= 0) {
      UI.toast('Montant invalide', 'error');
      this._isSubmitting = false;
      return;
    }
    
    const now = new Date().toISOString();
    const transferId = Utils.uid();
    
    if (direction === 'accountToSaving') {
      const accountId = UI.$('transferSourceAccount').value;
      const savingId = UI.$('transferDestSaving').value;
      const account = DB.get('accounts').find(a => a.id === accountId);
      const saving = DB.get('savings').find(s => s.id === savingId);
      if (!account || !saving) { UI.toast('Compte ou épargne introuvable', 'error'); this._isSubmitting = false; return; }
      if (amount > account.balance) {
        UI.toast(`Solde insuffisant sur le compte (${Utils.fmtS(account.balance)} ${Utils.cur()})`, 'error');
        this._isSubmitting = false;
        return;
      }
      DB.update('accounts', accounts => {
        const ac = accounts.find(a => a.id === accountId);
        if (ac) ac.balance = Math.round((ac.balance - amount) * 100) / 100;
      });
      DB.update('savings', savings => {
        const sv = savings.find(s => s.id === savingId);
        if (sv) sv.balance = Math.round((sv.balance + amount) * 100) / 100;
      });
      DB.update('transfers', transfers => transfers.push({
        id: transferId,
        fromType: 'account',
        toType: 'saving',
        fromAccountId: accountId,
        toSavingId: savingId,
        amount,
        desc,
        date: now
      }));
      DB.update('accountOps', ops => ops.push({
        id: Utils.uid(),
        accountId: accountId,
        type: 'transfer_to_saving',
        amount: amount,
        desc: `Transfert vers épargne "${saving.name}" : ${desc}`,
        date: now,
        transferId: transferId
      }));
      DB.update('savingsOps', ops => ops.push({
        id: Utils.uid(),
        savingId: savingId,
        type: 'transfer_from_saving',
        amount: amount,
        desc: `Transfert depuis compte "${account.name}" : ${desc}`,
        date: now,
        transferId: transferId
      }));
      UI.toast(`✅ ${Utils.fmtS(amount)} ${Utils.cur()} transféré du compte vers l'épargne`, 'success');
    } else {
      const savingId = UI.$('transferSourceSaving').value;
      const accountId = UI.$('transferDestAccount').value;
      const saving = DB.get('savings').find(s => s.id === savingId);
      const account = DB.get('accounts').find(a => a.id === accountId);
      if (!saving || !account) { UI.toast('Épargne ou compte introuvable', 'error'); this._isSubmitting = false; return; }
      if (amount > saving.balance) {
        UI.toast(`Solde insuffisant sur l'épargne (${Utils.fmtS(saving.balance)} ${Utils.cur()})`, 'error');
        this._isSubmitting = false;
        return;
      }
      DB.update('savings', savings => {
        const sv = savings.find(s => s.id === savingId);
        if (sv) sv.balance = Math.round((sv.balance - amount) * 100) / 100;
      });
      DB.update('accounts', accounts => {
        const ac = accounts.find(a => a.id === accountId);
        if (ac) ac.balance = Math.round((ac.balance + amount) * 100) / 100;
      });
      DB.update('transfers', transfers => transfers.push({
        id: transferId,
        fromType: 'saving',
        toType: 'account',
        fromSavingId: savingId,
        toAccountId: accountId,
        amount,
        desc,
        date: now
      }));
      DB.update('accountOps', ops => ops.push({
        id: Utils.uid(),
        accountId: accountId,
        type: 'transfer_from_saving',
        amount: amount,
        desc: `Transfert depuis épargne "${saving.name}" : ${desc}`,
        date: now,
        transferId: transferId
      }));
      DB.update('savingsOps', ops => ops.push({
        id: Utils.uid(),
        savingId: savingId,
        type: 'transfer_to_saving',
        amount: amount,
        desc: `Transfert vers compte "${account.name}" : ${desc}`,
        date: now,
        transferId: transferId
      }));
      UI.toast(`✅ ${Utils.fmtS(amount)} ${Utils.cur()} transféré de l'épargne vers le compte`, 'success');
    }
    
    this._isSubmitting = false;
    Modals.close('transferSavingModal');
    App.renderHome();
    App.renderAccounts();
    App.renderSavings();
  },

  saveTx() {
    if (this._isSubmitting) return;
    this._isSubmitting = true;
    const btn = UI.$('txSaveBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Enregistrement...';
    try {
      const amt = Utils.parseAmt(UI.$('txAmt').value);
      if (amt <= 0) { UI.toast('Montant invalide', 'error'); btn.disabled = false; btn.textContent = originalText; this._isSubmitting = false; return; }
      const accountId = UI.$('txAccountId').value;
      if (!accountId) { UI.toast('Veuillez sélectionner un compte', 'error'); btn.disabled = false; btn.textContent = originalText; this._isSubmitting = false; return; }
      const desc = UI.$('txDesc').value.trim();
      const wasEdit = !!this._editId;
      let _oldTx = null, _snap = null;
      const _undoEdit = () => { if (_snap) Actions._restore(_snap); };
      if (wasEdit) {
        _oldTx = DB.get('txs').find(t => t.id === this._editId);
        if (_oldTx) { _snap = Actions._snap(); Actions._removeTx(_oldTx); }
      }
      if (_txType === 'expense') {
        const account = DB.get('accounts').find(a => a.id === accountId);
        if (account && amt > account.balance) { _undoEdit(); UI.toast(`Solde insuffisant (${Utils.fmtS(account.balance)} ${Utils.cur()})`, 'error'); btn.disabled = false; btn.textContent = originalText; this._isSubmitting = false; return; }
      }
      const sign = _txType === 'income' ? +1 : -1;
      DB.update('accounts', acs => {
        const ac = acs.find(a => a.id === accountId);
        if (ac) ac.balance = Math.round((ac.balance + sign * amt) * 100) / 100;
      });
      const newOpId = Utils.uid();
      DB.update('accountOps', ops => ops.push({
        id: newOpId,
        accountId: accountId,
        type: _txType === 'income' ? 'deposit' : 'withdraw',
        amount: amt,
        desc: `Transaction: ${desc || (_txType === 'income' ? 'Revenu' : 'Dépense')}`,
        date: new Date().toISOString()
      }));
      DB.update('txs', txs => txs.push({
        id: (this._newTxId = Utils.uid()),
        type: _txType,
        amount: amt,
        cat: _selectedCat,
        desc: desc,
        accountId: accountId,
        linkedOpId: newOpId,
        date: new Date().toISOString()
      }));
      btn.disabled = false;
      btn.textContent = originalText;
      this._isSubmitting = false;
      if (wasEdit && _oldTx) {
        DB.update('txs', txs => { const t = txs.find(x => x.id === this._newTxId); if (t) t.date = _oldTx.date; });
        DB.update('accountOps', ops => { const o = ops.find(x => x.id === newOpId); if (o) o.date = _oldTx.date; });
      }
      this._editId = null;
      Modals.close('txOverlay');
      App.renderHome();
      App.renderAccounts();
      if (Nav._detailType === 'account') Nav.refreshDetail();
      UI.toast(wasEdit ? '✅ Transaction modifiée' : (_txType === 'income' ? '✅ Revenu enregistré' : '✅ Dépense enregistrée'), 'success');
    } catch (e) {
      console.error(e);
      btn.disabled = false;
      btn.textContent = originalText;
      this._isSubmitting = false;
      UI.toast('Erreur', 'error');
    }
  },

  _applyTx(t) {
    const sign = t.type === 'income' ? 1 : -1, opId = Utils.uid();
    DB.update('accounts', acs => { const ac = acs.find(a => a.id === t.accountId); if (ac) ac.balance = Math.round((ac.balance + sign * t.amount) * 100) / 100; });
    DB.update('accountOps', ops => ops.push({ id: opId, accountId: t.accountId, type: t.type === 'income' ? 'deposit' : 'withdraw', amount: t.amount, desc: `Transaction: ${t.desc || (t.type === 'income' ? 'Revenu' : 'Dépense')}`, date: t.date }));
    DB.update('txs', txs => txs.push({ id: Utils.uid(), type: t.type, amount: t.amount, cat: t.cat, desc: t.desc, accountId: t.accountId, linkedOpId: opId, date: t.date, recurringId: t.recurringId }));
  },

  runRecurring() {
    const now = new Date(), cur = now.getFullYear() * 12 + now.getMonth(); let n = 0;
    DB.update('recurring', list => list.forEach(r => {
      if (!r.active || !DB.get('accounts').some(a => a.id === r.accountId)) return;
      let m = (r.lastRun == null ? r.startMonth - 1 : r.lastRun) + 1;
      if (cur - m > 11) m = cur - 11;
      for (; m <= cur; m++) {
        const y = Math.floor(m / 12), mo = m % 12, d = Math.min(r.day, new Date(y, mo + 1, 0).getDate());
        if (m === cur && d > now.getDate()) break;
        this._applyTx({ type: r.type, amount: r.amount, cat: r.cat, desc: r.desc, accountId: r.accountId, date: new Date(y, mo, d, 8).toISOString(), recurringId: r.id });
        r.lastRun = m; n++;
      }
    }));
    if (n) { App.renderHome(); App.renderAccounts(); UI.toast(`🔁 ${n} transaction(s) récurrente(s) ajoutée(s)`, 'info'); }
  },

  renderRecurring() {
    const list = DB.get('recurring'), accs = DB.get('accounts');
    UI.html('recurList', list.length ? list.map(r => {
      const c = CATS[r.cat] || { e: '📦', l: r.cat }, ac = accs.find(a => a.id === r.accountId), inc = r.type === 'income';
      return `<div class="tx-item" style="margin-bottom:8px;${r.active ? '' : 'opacity:.5'}"><div class="tx-ico" style="background:${c.c || 'var(--surface2)'}22">${c.e}</div><div class="tx-info"><div class="tx-name">${Utils.esc(r.desc || c.l)}</div><div class="tx-meta">Le ${r.day} · ${Utils.esc(ac ? ac.name : 'Compte supprimé')}</div></div><div class="tx-right"><div class="tx-amt ${inc ? 'pos' : 'neg'}">${inc ? '+' : '-'}${Utils.fmtS(r.amount)}</div><button class="tx-del" aria-label="Pause/reprise" onclick="Actions.toggleRecurring('${r.id}')">${r.active ? '⏸' : '▶'}</button><button class="tx-del" aria-label="Supprimer" onclick="Actions.deleteRecurring('${r.id}')">✕</button></div></div>`;
    }).join('') : '<div class="tx-meta" style="padding:6px 0 14px">Aucune récurrence pour l\'instant.</div>');
  },

  saveCatBudgets() {
    const cb = {};
    Object.keys(CATS).filter(k => k !== 'salaire').forEach(k => { const v = Utils.parseAmt(UI.$('cb_' + k)?.value); if (v > 0) cb[k] = v; });
    DB.update('settings', s => { s.catBudgets = cb; });
    App._catAlerts = new Set(); App._catSeeded = false;
    Modals.close('catBudgetOverlay');
    App.renderHome();
    UI.toast(Object.keys(cb).length ? '✅ Budgets enregistrés' : 'Budgets par catégorie supprimés', 'success');
  },

  addRecurring() {
    const amount = Utils.parseAmt(UI.$('rcAmt').value), accountId = UI.$('rcAcc').value;
    if (amount <= 0) { UI.toast('Montant invalide', 'error'); return; }
    if (!accountId) { UI.toast('Veuillez sélectionner un compte', 'error'); return; }
    const day = Math.min(31, Math.max(1, parseInt(UI.$('rcDay').value) || 1)), now = new Date(), cur = now.getFullYear() * 12 + now.getMonth();
    DB.update('recurring', l => l.push({ id: Utils.uid(), type: UI.$('rcType').value, amount, cat: UI.$('rcCat').value, desc: UI.$('rcDesc').value.trim(), accountId, day, active: true, startMonth: cur, lastRun: day < now.getDate() ? cur : cur - 1 }));
    UI.$('rcAmt').value = ''; UI.$('rcDesc').value = '';
    this.runRecurring(); this.renderRecurring();
    UI.toast('✅ Récurrence ajoutée', 'success');
  },

  toggleRecurring(id) {
    const now = new Date();
    DB.update('recurring', l => { const r = l.find(x => x.id === id); if (r) { r.active = !r.active; if (r.active) r.lastRun = now.getFullYear() * 12 + now.getMonth(); } });
    this.renderRecurring();
  },

  deleteRecurring(id) {
    DB.update('recurring', l => { const i = l.findIndex(x => x.id === id); if (i > -1) l.splice(i, 1); });
    this.renderRecurring();
    UI.toast('Récurrence supprimée');
  },

  _snap() { return JSON.stringify({ txs: DB.get('txs'), accountOps: DB.get('accountOps'), accounts: DB.get('accounts') }); },
  _restore(snap) { const o = JSON.parse(snap); ['txs', 'accountOps', 'accounts'].forEach(k => DB.set(k, o[k])); },

  _removeTx(tx) {
      DB.update('txs', txs => { const i = txs.findIndex(t => t.id === tx.id); if (i > -1) txs.splice(i, 1); });
      if (tx.linkedOpId) {
        DB.update('accountOps', ops => { const idx = ops.findIndex(o => o.id === tx.linkedOpId); if (idx > -1) ops.splice(idx, 1); });
      } else if (tx.accountId) {
        DB.update('accountOps', ops => {
          const idx = ops.findIndex(o => o.accountId === tx.accountId && o.amount === tx.amount && Math.abs(new Date(o.date) - new Date(tx.date)) < 60000 && ((tx.type === 'income' && (o.type === 'deposit' || o.type === 'receive' || o.type === 'in')) || (tx.type === 'expense' && (o.type === 'withdraw' || o.type === 'send' || o.type === 'out'))));
          if (idx > -1) ops.splice(idx, 1);
        });
      }
      if (tx.accountId) {
        const remainingOps = DB.get('accountOps').filter(o => o.accountId === tx.accountId);
        let newBalance = 0;
        remainingOps.forEach(op => {
          const depositTypes = ['deposit', 'receive', 'in', 'deposit_sav', 'transfer_in', 'transfer_from_saving'];
          const withdrawTypes = ['withdraw', 'send', 'out', 'cashout', 'withdraw_sav', 'transfer_out', 'transfer_to_saving'];
          if (depositTypes.includes(op.type)) newBalance += op.amount;
          else if (withdrawTypes.includes(op.type)) newBalance -= op.amount;
        });
        DB.update('accounts', accounts => { const ac = accounts.find(a => a.id === tx.accountId); if (ac) ac.balance = Math.round(newBalance * 100) / 100; });
      }
  },

  deleteTx(id) {
    const tx = DB.get('txs').find(t => t.id === id);
    if (!tx) return;
    Modals.openConfirm('Supprimer la transaction', `Supprimer "${tx.desc || 'cette transaction'}" ?`, () => {
      const snap = Actions._snap();
      Actions._removeTx(tx);
      App.renderHome();
      App.renderAccounts();
      if (Nav._detailType === 'account') Nav.refreshDetail();
      UI.toast('Transaction supprimée', '', { label: 'Annuler', fn: () => {
        Actions._restore(snap);
        App.renderHome(); App.renderAccounts();
        if (Nav._detailType === 'account') Nav.refreshDetail();
        UI.toast('↩️ Suppression annulée', 'success');
      } });
    });
  },

  // NOUVELLE FONCTION : Supprimer un transfert (un seul événement)
  deleteTransfer(id) {
    const transfer = DB.get('transfers').find(t => t.id === id);
    if (!transfer) return;
    Modals.openConfirm('Supprimer le transfert', `Supprimer ce transfert ?`, () => {
      // Supprimer l'entrée de la collection transfers
      DB.update('transfers', transfers => {
        const idx = transfers.findIndex(t => t.id === id);
        if (idx > -1) transfers.splice(idx, 1);
      });
      // Supprimer les opérations liées dans accountOps
      DB.update('accountOps', ops => {
        for (let i = ops.length-1; i >= 0; i--) {
          if (ops[i].transferId === id) ops.splice(i, 1);
        }
      });
      // Supprimer les opérations liées dans savingsOps
      DB.update('savingsOps', ops => {
        for (let i = ops.length-1; i >= 0; i--) {
          if (ops[i].transferId === id) ops.splice(i, 1);
        }
      });
      // Recalculer les soldes des comptes et épargnes impactés
      if (transfer.fromType === 'account') {
        const remainingOps = DB.get('accountOps').filter(o => o.accountId === transfer.fromAccountId);
        let newBalance = 0;
        remainingOps.forEach(o => {
          const depositTypes = ['deposit', 'receive', 'in', 'deposit_sav', 'transfer_in', 'transfer_from_saving'];
          const withdrawTypes = ['withdraw', 'send', 'out', 'cashout', 'withdraw_sav', 'transfer_out', 'transfer_to_saving'];
          if (depositTypes.includes(o.type)) newBalance += o.amount;
          else if (withdrawTypes.includes(o.type)) newBalance -= o.amount;
        });
        DB.update('accounts', accounts => {
          const ac = accounts.find(a => a.id === transfer.fromAccountId);
          if (ac) ac.balance = Math.round(newBalance * 100) / 100;
        });
      }
      if (transfer.toType === 'account') {
        const remainingOps = DB.get('accountOps').filter(o => o.accountId === transfer.toAccountId);
        let newBalance = 0;
        remainingOps.forEach(o => {
          const depositTypes = ['deposit', 'receive', 'in', 'deposit_sav', 'transfer_in', 'transfer_from_saving'];
          const withdrawTypes = ['withdraw', 'send', 'out', 'cashout', 'withdraw_sav', 'transfer_out', 'transfer_to_saving'];
          if (depositTypes.includes(o.type)) newBalance += o.amount;
          else if (withdrawTypes.includes(o.type)) newBalance -= o.amount;
        });
        DB.update('accounts', accounts => {
          const ac = accounts.find(a => a.id === transfer.toAccountId);
          if (ac) ac.balance = Math.round(newBalance * 100) / 100;
        });
      }
      if (transfer.fromType === 'saving') {
        const remainingOps = DB.get('savingsOps').filter(o => o.savingId === transfer.fromSavingId);
        let newBalance = 0;
        remainingOps.forEach(o => {
          if (o.type === 'deposit' || o.type === 'transfer_from_saving') newBalance += o.amount;
          else if (o.type === 'withdraw' || o.type === 'transfer_to_saving') newBalance -= o.amount;
        });
        DB.update('savings', savings => {
          const sv = savings.find(s => s.id === transfer.fromSavingId);
          if (sv) sv.balance = Math.round(newBalance * 100) / 100;
        });
      }
      if (transfer.toType === 'saving') {
        const remainingOps = DB.get('savingsOps').filter(o => o.savingId === transfer.toSavingId);
        let newBalance = 0;
        remainingOps.forEach(o => {
          if (o.type === 'deposit' || o.type === 'transfer_from_saving') newBalance += o.amount;
          else if (o.type === 'withdraw' || o.type === 'transfer_to_saving') newBalance -= o.amount;
        });
        DB.update('savings', savings => {
          const sv = savings.find(s => s.id === transfer.toSavingId);
          if (sv) sv.balance = Math.round(newBalance * 100) / 100;
        });
      }
      App.renderHome();
      App.renderAccounts();
      App.renderSavings();
      UI.toast('Transfert supprimé');
    });
  },

  saveAccountOp() {
    const amt = Utils.parseAmt(UI.$('acOpAmt').value);
    if (amt <= 0) { UI.toast('Montant invalide', 'error'); return; }
    const desc = UI.$('acOpDesc').value.trim();
    const cfg = OP_CFG[_acOpType] || { sign: +1 };
    if (cfg.sign === -1) {
      const ac = DB.get('accounts').find(a => a.id === _acId);
      if (ac && amt > ac.balance) { UI.toast(`Solde insuffisant (${Utils.fmtS(ac.balance)} F)`, 'error'); return; }
    }
    DB.update('accounts', acs => { const ac = acs.find(a => a.id === _acId); if (ac) ac.balance = Math.round((ac.balance + cfg.sign * amt) * 100) / 100; });
    const newOpId = Utils.uid();
    DB.update('accountOps', ops => ops.push({ id: newOpId, accountId: _acId, type: _acOpType, amount: amt, desc: desc, date: new Date().toISOString() }));
    Modals.close('acOpOverlay');
    App.renderHome();
    if (Nav._detailType === 'account') Nav.refreshDetail();
    else App.renderAccounts();
    UI.toast('✅ Opération enregistrée', 'success');
  },

  deleteOp(id, collection) {
    const op = DB.get(collection).find(o => o.id === id);
    if (!op) return;
    Modals.openConfirm('Supprimer', 'Cette opération sera supprimée.', () => {
      DB.update(collection, ops => { const idx = ops.findIndex(o => o.id === id); if (idx > -1) ops.splice(idx, 1); });
      if (collection === 'accountOps' && op.accountId) {
        const remainingOps = DB.get('accountOps').filter(o => o.accountId === op.accountId);
        let newBalance = 0;
        remainingOps.forEach(o => {
          const depositTypes = ['deposit', 'receive', 'in', 'deposit_sav', 'transfer_in', 'transfer_from_saving'];
          const withdrawTypes = ['withdraw', 'send', 'out', 'cashout', 'withdraw_sav', 'transfer_out', 'transfer_to_saving'];
          if (depositTypes.includes(o.type)) newBalance += o.amount;
          else if (withdrawTypes.includes(o.type)) newBalance -= o.amount;
        });
        DB.update('accounts', accounts => { const ac = accounts.find(a => a.id === op.accountId); if (ac) ac.balance = Math.round(newBalance * 100) / 100; });
        const linkedTx = DB.get('txs').find(t => t.accountId === op.accountId && t.amount === op.amount && Math.abs(new Date(t.date) - new Date(op.date)) < 60000);
        if (linkedTx) {
          DB.update('txs', txs => { const i = txs.findIndex(t => t.id === linkedTx.id); if (i > -1) txs.splice(i, 1); });
        }
      } else if (collection === 'savingsOps' && op.savingId) {
        const remainingOps = DB.get('savingsOps').filter(o => o.savingId === op.savingId);
        let newBalance = 0;
        remainingOps.forEach(o => {
          if (o.type === 'deposit' || o.type === 'transfer_from_saving') newBalance += o.amount;
          else if (o.type === 'withdraw' || o.type === 'transfer_to_saving') newBalance -= o.amount;
        });
        DB.update('savings', savings => { const sv = savings.find(s => s.id === op.savingId); if (sv) sv.balance = Math.round(newBalance * 100) / 100; });
      }
      if (Nav._detailType === 'account' || Nav._detailType === 'saving') Nav.refreshDetail();
      App.renderHome();
      App.renderAccounts();
      App.renderSavings();
      UI.toast('Opération supprimée');
    });
  },

  saveAccountForm() {
    const name = UI.$('acFormName').value.trim();
    if (!name) { UI.toast('Nom requis', 'error'); return; }
    const icon = document.querySelector('#acFormEmojis .emoji-opt.sel')?.textContent || AC_ICONS[0];
    const colorKey = document.querySelector('#acFormColors .color-opt.sel')?.dataset.color || COLORS[0];
    const type = UI.$('acFormType').value || 'bank';
    const showOnHome = UI.$('acFormShowOnHome')?.value === 'true';
    const bal = Utils.parseAmt(UI.$('acFormBal').value);
    if (_acSetupId) {
      DB.update('accounts', acs => { const ac = acs.find(a => a.id === _acSetupId); if (ac) { ac.name = name; ac.icon = icon; ac.colorKey = colorKey; ac.type = type; ac.balance = bal; ac.showOnHome = showOnHome; } });
      UI.toast('✅ Compte modifié', 'success');
    } else {
      DB.update('accounts', acs => acs.push({ id: 'acc-' + Utils.uid(), name, icon, colorKey, balance: bal, type, showOnHome }));
      UI.toast('✅ Compte créé', 'success');
    }
    Modals.close('acFormOverlay');
    App.renderHome();
    App.renderAccounts();
  },

  saveMonthlyBudget() {
    const amount = Utils.parseAmt(UI.$('budgetAmount').value);
    const month = parseInt(UI.$('budgetMonth').value);
    const year = parseInt(UI.$('budgetYear').value);
    const settings = DB.get('settings');
    const budgets = settings.monthlyBudget || {};
    if (!budgets[year]) budgets[year] = {};
    budgets[year][month] = amount;
    DB.update('settings', s => { s.monthlyBudget = budgets; });
    Modals.close('budgetModal');
    App.renderHome();
    UI.toast(amount > 0 ? `✅ Objectif ${Utils.fmtS(amount)} ${Utils.cur()} enregistré` : '❌ Objectif supprimé', 'success');
  },

  saveRename() {
    const v = UI.$('renameInput').value.trim();
    if (!v) { UI.toast('Nom requis', 'error'); return; }
    if (_renameType === 'account') {
      DB.update('accounts', acs => { const ac = acs.find(a => a.id === _renameId); if (ac) ac.name = v; });
      App.renderAccounts();
      App.renderHome();
      if (Nav._detailType === 'account' && Nav._detailId === _renameId) UI.txt('detailTitle', v);
    } else {
      DB.update('savings', savs => { const sv = savs.find(s => s.id === _renameId); if (sv) sv.name = v; });
      App.renderSavings();
      if (Nav._detailType === 'saving' && Nav._detailId === _renameId) UI.txt('detailTitle', v);
    }
    Modals.close('renameOverlay');
    UI.toast('✅ Renommé', 'success');
  },

  confirmDeleteAccount(id) {
    const ac = DB.get('accounts').find(a => a.id === id);
    Modals.openConfirm('🗑️ Supprimer', `Supprimer ${Utils.esc(ac?.name || 'ce compte')} ?`, () => {
      DB.update('accounts', acs => { const i = acs.findIndex(a => a.id === id); if (i > -1) acs.splice(i, 1); });
      DB.update('accountOps', ops => { let i; while ((i = ops.findIndex(o => o.accountId === id)) > -1) ops.splice(i, 1); });
      if (Nav._detailType === 'account' && Nav._detailId === id) Nav.closeDetail();
      App.renderHome();
      App.renderAccounts();
      UI.toast('Compte supprimé');
    });
  },

  saveSavingForm() {
    const name = UI.$('savFormName').value.trim();
    if (!name) { UI.toast('Nom requis', 'error'); return; }
    const emoji = document.querySelector('#savFormEmojis .emoji-opt.sel')?.textContent || '🐖';
    const goal = Utils.parseAmt(UI.$('savFormGoal').value) || 0;
    if (_acSetupId) {
      DB.update('savings', savs => { const sv = savs.find(s => s.id === _acSetupId); if (sv) { sv.name = name; sv.emoji = emoji; sv.goal = goal; } });
      UI.toast('✅ Épargne modifiée', 'success');
    } else {
      DB.update('savings', savs => savs.push({ id: 'sav-' + Utils.uid(), name, emoji, balance: 0, goal, createdAt: new Date().toISOString() }));
      UI.toast('✅ Épargne créée', 'success');
    }
    Modals.close('savFormOverlay');
    App.renderSavings();
  },

  saveSavingOp() {
    const amt = Utils.parseAmt(UI.$('savOpAmt').value);
    if (amt <= 0) { UI.toast('Montant invalide', 'error'); return; }
    const desc = UI.$('savOpNote').value.trim();
    if (_savOpType === 'withdraw') {
      const sv = DB.get('savings').find(s => s.id === _savId);
      if (sv && amt > sv.balance) { UI.toast(`Solde insuffisant (${Utils.fmtS(sv.balance)} F)`, 'error'); return; }
    }
    const sign = _savOpType === 'deposit' ? +1 : -1;
    DB.update('savings', savs => { const sv = savs.find(s => s.id === _savId); if (sv) sv.balance = Math.round((sv.balance + sign * amt) * 100) / 100; });
    DB.update('savingsOps', ops => ops.push({ id: Utils.uid(), savingId: _savId, type: _savOpType, amount: amt, desc, date: new Date().toISOString() }));
    Modals.close('savOpOverlay');
    App.renderSavings();
    App.renderHome();
    if (Nav._detailType === 'saving') Nav.refreshDetail();
    UI.toast(_savOpType === 'deposit' ? '✅ Épargne mise à jour' : '✅ Retrait effectué', 'success');
  },

  confirmDeleteSaving(id) {
    const sv = DB.get('savings').find(s => s.id === id);
    Modals.openConfirm('🗑️ Supprimer', `Supprimer ${Utils.esc(sv?.name || 'cette épargne')} ?`, () => {
      DB.update('savings', savs => { const i = savs.findIndex(s => s.id === id); if (i > -1) savs.splice(i, 1); });
      DB.update('savingsOps', ops => { let i; while ((i = ops.findIndex(o => o.savingId === id)) > -1) ops.splice(i, 1); });
      if (Nav._detailType === 'saving' && Nav._detailId === id) Nav.closeDetail();
      App.renderSavings();
      App.renderHome();
      UI.toast('Épargne supprimée');
    });
  },

  exportJSON() {
    const data = { app: 'budget', version: 1, exportedAt: new Date().toISOString() };
    ['txs','accounts','accountOps','savings','savingsOps','transfers','recurring','settings'].forEach(k => data[k] = DB.get(k));
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'budget_sauvegarde_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click(); URL.revokeObjectURL(url);
    UI.toast('✅ Sauvegarde téléchargée', 'success');
  },

  importJSON(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      let d;
      try { d = JSON.parse(r.result); } catch { UI.toast('Fichier invalide', 'error'); return; }
      const arrays = ['txs','accounts','accountOps','savings','savingsOps','transfers'];
      if (!d || d.app !== 'budget' || arrays.some(k => !Array.isArray(d[k])) || typeof d.settings !== 'object') { UI.toast('Sauvegarde non reconnue', 'error'); return; }
      Modals.openConfirm('📥 Restaurer', 'Remplacer toutes les données actuelles par cette sauvegarde ?', () => {
        ['txs','accounts','accountOps','savings','savingsOps','transfers','recurring','settings'].forEach(k => DB.set(k, k === 'recurring' ? (Array.isArray(d[k]) ? d[k] : []) : d[k]));
        location.reload();
      });
    };
    r.readAsText(file);
  },

  exportCSV() {
    const txs = DB.get('txs'), transfers = DB.get('transfers');
    const accs = DB.get('accounts'), savs = DB.get('savings');
    const currency = Utils.cur();
    const safe = v => { v = String(v ?? ''); return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; };
    const nameOf = (type, id) => { const o = (type === 'saving' ? savs : accs).find(x => x.id === id); return o ? o.name : (type === 'saving' ? 'Épargne' : 'Compte'); };
    const rows = [['Date', 'Type', 'Catégorie', 'Compte', 'Description', `Montant (${currency})`]];
    txs.forEach(t => {
      const cat = CATS[t.cat] ? CATS[t.cat].l : t.cat;
      rows.push([new Date(t.date).toLocaleDateString('fr-FR'), t.type === 'income' ? 'Revenu' : 'Dépense', cat,
        nameOf('account', t.accountId), t.desc || '', (t.type === 'income' ? '+' : '-') + t.amount]);
    });
    transfers.forEach(t => {
      const from = nameOf(t.fromType, t.fromAccountId || t.fromSavingId), to = nameOf(t.toType, t.toAccountId || t.toSavingId);
      rows.push([new Date(t.date).toLocaleDateString('fr-FR'), 'Transfert', 'Transfert', `${from} → ${to}`, t.desc || 'Transfert', t.amount]);
    });
    const csv = rows.map(r => r.map(v => `"${safe(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'budget_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click(); URL.revokeObjectURL(url);
    UI.toast('✅ Export CSV téléchargé', 'success');
  },

  saveProfile() {
    const name = UI.$('profileName').value.trim();
    const cur = UI.$('currencySel').value;
    DB.update('settings', s => { s.name = name; s.currency = cur; });
    Modals.close('profileOverlay');
    App.renderHome();
    App.renderSettings();
    UI.toast('✅ Profil enregistré', 'success');
  }
};

// ==================================================
// FORMULAIRES
// ==================================================
function _syncTxType() { UI.$('btnExp').className = 'type-btn' + (_txType === 'expense' ? ' ae' : ''); UI.$('btnInc').className = 'type-btn' + (_txType === 'income' ? ' ai' : ''); }
function _buildCats() { const keys = _txType === 'income' ? ['salaire', 'autre'] : Object.keys(CATS).filter(k => k !== 'salaire'); if (!keys.includes(_selectedCat)) _selectedCat = keys[0]; UI.html('txCats', keys.map(k => { const c = CATS[k]; return `<div class="cat-chip ${_selectedCat === k ? 'sel' : ''}" onclick="_selCat('${k}')">${c.e} ${c.l}</div>`; }).join('')); }
function _selCat(k) { _selectedCat = k; _buildCats(); }

// ==================================================
// GESTIONNAIRES D'ÉVÉNEMENTS
// ==================================================
const MODAL_IDS = ['catBudgetOverlay', 'recurOverlay', 'txOverlay', 'acOpOverlay', 'acFormOverlay', 'renameOverlay', 'savFormOverlay', 'savOpOverlay', 'statsOverlay', 'profileOverlay', 'confirmOverlay', 'homeAccountsModal', 'budgetModal', 'transferModal', 'transferSavingModal'];

MODAL_IDS.forEach(id => { const el = UI.$(id); if (!el) return; el.addEventListener('click', e => { if (e.target === el) Modals.close(id); }); el.addEventListener('touchstart', e => { if (e.target === el) e.preventDefault(); }, { passive: false }); });

document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (UI.$('ctxOverlay').classList.contains('open')) { Modals.close('ctxOverlay'); return; } for (let i = MODAL_IDS.length - 1; i >= 0; i--) { const el = UI.$(MODAL_IDS[i]); if (el && el.classList.contains('open')) { Modals.close(MODAL_IDS[i]); return; } } if (UI.$('detailPanel').classList.contains('open')) Nav.closeDetail(); });

// ==================================================
// DÉMARRAGE
// ==================================================
App.init();
Actions.runRecurring();
document.addEventListener('visibilitychange', () => { if (!document.hidden) Actions.runRecurring(); });

(function handleDeepLink() { const hash = location.hash; if (!hash) return; const map = { '#savings': 'savings', '#accounts': 'accounts', '#expense': 'home' }; const tab = map[hash]; if (tab) { setTimeout(() => { Nav.go(tab); if (hash === '#expense') Modals.openTx('expense'); history.replaceState(null, '', location.pathname); }, 150); } })();
