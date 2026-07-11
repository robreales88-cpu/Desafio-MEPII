/**
 * APIClient — Frontend service for DESAFÍO platform.
 *
 * Connects to the Google Apps Script Web App endpoint.
 * Features:
 *   • POST / GET to Apps Script with automatic CORS handling
 *   • Offline queue — actions taken offline sync when back online
 *   • localStorage cache layer (localStorage is primary cache; Sheets is source of truth)
 *   • User-agent tagging for audit log
 *   • Auto-retry on transient failures (up to 3 attempts)
 *   • EventBus integration — emits 'api:synced', 'api:error', 'api:offline'
 *
 * SETUP: replace SCRIPT_URL below with your deployed Web App URL.
 */
(function () {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────────────
  const SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'; // ← replace
  const CACHE_KEY  = 'desafio_api_cache';
  const QUEUE_KEY  = 'desafio_api_queue';
  const UA         = navigator.userAgent.substring(0, 120);
  const MAX_RETRY  = 3;
  const RETRY_MS   = [1000, 3000, 8000];

  // ── HELPERS ─────────────────────────────────────────────────────
  function bus() { return window.platformBus || null; }
  function emit(event, data) { bus() && bus().emit(event, data); }

  function readQueue()  { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; } }
  function saveQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {} }
  function readCache()  { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } }
  function saveCache(c) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {} }

  // ── CORE REQUEST ────────────────────────────────────────────────
  async function _request(method, params, body, attempt = 0) {
    const url = new URL(SCRIPT_URL);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    url.searchParams.set('ua', encodeURIComponent(UA));

    const opts = { method };
    if (method === 'POST' && body) {
      opts.body    = JSON.stringify(body);
      opts.headers = { 'Content-Type': 'text/plain' }; // Apps Script requires text/plain for CORS
    }

    try {
      const res  = await fetch(url.toString(), opts);
      const json = await res.json();
      emit('api:synced', { action: params.action });
      return json;
    } catch (err) {
      if (attempt < MAX_RETRY - 1) {
        await new Promise(r => setTimeout(r, RETRY_MS[attempt]));
        return _request(method, params, body, attempt + 1);
      }
      emit('api:error', { action: params.action, error: err.message });
      throw err;
    }
  }

  // ── PUBLIC API ──────────────────────────────────────────────────
  class APIClient {
    constructor(scriptUrl) {
      if (scriptUrl) {
        // Allow runtime override
        Object.defineProperty(this, '_url', { value: scriptUrl });
      }
      this._online = navigator.onLine;
      window.addEventListener('online',  () => { this._online = true;  this._flushQueue(); });
      window.addEventListener('offline', () => { this._online = false; emit('api:offline', {}); });
    }

    /** POST to Apps Script action endpoint. */
    async post(action, data = {}) {
      data.ua = UA;
      if (!this._online || SCRIPT_URL.includes('YOUR_DEPLOYMENT_ID')) {
        this._enqueue(action, data);
        return { ok: true, queued: true };
      }
      try {
        return await _request('POST', { action }, data);
      } catch {
        this._enqueue(action, data);
        return { ok: true, queued: true };
      }
    }

    /** GET from Apps Script action endpoint. Caches result. */
    async get(action, params = {}, cacheTTL = 60) {
      params.ua = UA;
      const cacheKey = action + JSON.stringify(params);
      const cache    = readCache();
      if (cache[cacheKey] && (Date.now() - cache[cacheKey].ts) < cacheTTL * 1000) {
        return cache[cacheKey].data;
      }
      if (!this._online || SCRIPT_URL.includes('YOUR_DEPLOYMENT_ID')) {
        return cache[cacheKey]?.data || { ok: false, error: 'Offline' };
      }
      try {
        const result = await _request('GET', { action, ...params }, null);
        if (result.ok) {
          cache[cacheKey] = { data: result, ts: Date.now() };
          saveCache(cache);
        }
        return result;
      } catch {
        return cache[cacheKey]?.data || { ok: false, error: 'Network error' };
      }
    }

    // ── DOMAIN SHORTCUTS ────────────────────────────────────────

    async registro(perfil) {
      return this.post('registro', perfil);
    }

    async login(email) {
      return this.post('login', { email });
    }

    async guardarProgreso(data) {
      return this.post('guardarProgreso', data);
    }

    async guardarXP(email, xp) {
      return this.post('guardarXP', { email, xp });
    }

    async guardarInsignia(email, insignia) {
      return this.post('guardarInsignia', { email, insignia });
    }

    async guardarEvento(email, evento, detalle = '') {
      return this.post('guardarEvento', { email, evento, detalle });
    }

    async getRanking(limit = 20) {
      return this.get('ranking', { limit }, 120);
    }

    async getEstadisticas() {
      return this.get('estadisticas', {}, 300);
    }

    async getPerfil(email) {
      return this.get('perfil', { email }, 30);
    }

    async getAdminData(adminEmail, page = 0, query = '') {
      return this.get('admin', { adminEmail, page, query }, 15);
    }

    async ping() {
      return this.get('ping', {}, 0);
    }

    // ── OFFLINE QUEUE ───────────────────────────────────────────

    _enqueue(action, data) {
      const q = readQueue();
      q.push({ action, data, ts: Date.now() });
      saveQueue(q);
      console.info(`[API] Queued: ${action} (offline). Queue length: ${q.length}`);
    }

    async _flushQueue() {
      const q = readQueue();
      if (!q.length) return;
      console.info(`[API] Flushing ${q.length} queued actions…`);
      const failed = [];
      for (const item of q) {
        try {
          await _request('POST', { action: item.action }, item.data);
        } catch {
          failed.push(item);
        }
      }
      saveQueue(failed);
      if (!failed.length) emit('api:synced', { flushed: q.length });
    }

    /** Number of actions pending sync. */
    get pendingCount() { return readQueue().length; }

    /** Force flush of any queued actions. */
    flushNow() { return this._flushQueue(); }
  }

  // ── SINGLETON ───────────────────────────────────────────────────
  window.APIClient     = APIClient;
  window.desafioAPI    = new APIClient();

  // Flush any queued actions once page loads
  if (navigator.onLine) {
    window.addEventListener('load', () => window.desafioAPI.flushNow(), { once: true });
  }
})();
