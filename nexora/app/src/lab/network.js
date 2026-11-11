'use strict';
/* Enregistreur réseau avancé (Browser Lab) : toutes les requêtes d'une page avec leurs temps détaillés,
 * tailles, en-têtes, initiateur, corps des réponses à la demande, export HAR 1.2. */
const cdp = require('./cdp');

const TYPE = {
  Document: 'doc', Stylesheet: 'css', Script: 'js', Image: 'img', Font: 'font', XHR: 'fetch', Fetch: 'fetch', Media: 'media', WebSocket: 'ws', Manifest: 'other', Other: 'other', Ping: 'other', Preflight: 'other', EventSource: 'fetch', TextTrack: 'other', SignedExchange: 'other', CSPViolationReport: 'other',
};

class NetRecorder {
  constructor(wc, emit) {
    this.wc = wc;
    this.emit = emit;
    this.entries = new Map();
    this.order = [];
    this.changed = new Set();
    this.page = {};
    this.preserve = false;
    this.timer = null;
    this.off = cdp.on(wc, (m, p) => this.onEvent(m, p));
  }

  async start() {
    await cdp.send(this.wc, 'Network.enable', { maxTotalBufferSize: 200e6, maxResourceBufferSize: 50e6 });
    await cdp.send(this.wc, 'Page.enable');
    this.timer = setInterval(() => this.flush(), 300);
  }

  stop() {
    clearInterval(this.timer);
    this.off();
  }

  reset() {
    this.entries.clear();
    this.order = [];
    this.changed.clear();
    this.page = {};
    this.emit({ reset: true });
  }

  touch(e) { this.changed.add(e.id); }

  flush() {
    if (!this.changed.size && !this.pageDirty) return;
    const upserts = [...this.changed].map((id) => this.public(this.entries.get(id))).filter(Boolean);
    this.changed.clear();
    this.pageDirty = false;
    this.emit({ upserts, page: this.page });
  }

  public(e) {
    if (!e) return null;
    const { reqHeaders, resHeaders, postData, ...rest } = e;
    return rest;
  }

  onEvent(method, p) {
    switch (method) {
      case 'Page.frameNavigated':
        if (!p.frame.parentId && !this.preserve && !/^(about|chrome|devtools):/.test(p.frame.url)) {
          // Les requêtes de la nouvelle page commencent avant cet événement : on garde le document principal.
          const doc = [...this.entries.values()].reverse().find((e) => e.type === 'doc' && e.url === p.frame.url);
          const keepFrom = doc ? doc.start : Infinity;
          for (const [id, e] of this.entries) if (e.start < keepFrom) this.entries.delete(id);
          this.order = this.order.filter((id) => this.entries.has(id));
          this.page = { url: p.frame.url, navStart: doc ? doc.start : null };
          this.emit({ reset: true });
          for (const id of this.order) this.changed.add(id);
        }
        break;
      case 'Page.domContentEventFired': this.page.dcl = p.timestamp; this.pageDirty = true; break;
      case 'Page.loadEventFired': this.page.load = p.timestamp; this.pageDirty = true; break;
      case 'Network.requestWillBeSent': {
        const prev = this.entries.get(p.requestId);
        if (prev && p.redirectResponse) {
          // Redirection : l'entrée précédente est close et garde son propre identifiant.
          const rid = `${p.requestId}:${prev.redirects || 0}`;
          const closed = { ...prev, id: rid, status: p.redirectResponse.status, statusText: p.redirectResponse.statusText, end: p.timestamp, redirectTo: p.request.url, timing: p.redirectResponse.timing || prev.timing, resHeaders: p.redirectResponse.headers };
          this.entries.set(rid, closed);
          this.order.splice(this.order.indexOf(p.requestId), 0, rid);
          this.touch(closed);
          prev.redirects = (prev.redirects || 0) + 1;
        }
        const e = prev || { id: p.requestId };
        Object.assign(e, {
          url: p.request.url,
          method: p.request.method,
          type: TYPE[p.type] || 'other',
          cdpType: p.type,
          start: p.timestamp,
          wallTime: p.wallTime,
          priority: p.request.initialPriority,
          reqHeaders: p.request.headers,
          postData: p.request.postData,
          initiator: p.initiator ? { type: p.initiator.type, url: p.initiator.url || (p.initiator.stack && p.initiator.stack.callFrames && p.initiator.stack.callFrames[0] && p.initiator.stack.callFrames[0].url) || '', line: p.initiator.lineNumber } : null,
          status: null,
          encoded: 0,
          decoded: 0,
          end: null,
          failed: false,
        });
        if (!prev) { this.entries.set(e.id, e); this.order.push(e.id); }
        if (this.order.length > 6000) { const old = this.order.shift(); this.entries.delete(old); }
        this.touch(e);
        break;
      }
      case 'Network.requestWillBeSentExtraInfo': {
        const e = this.entries.get(p.requestId);
        if (e) e.reqHeaders = { ...(e.reqHeaders || {}), ...p.headers };
        break;
      }
      case 'Network.responseReceived': {
        const e = this.entries.get(p.requestId);
        if (!e) break;
        const r = p.response;
        Object.assign(e, {
          status: r.status, statusText: r.statusText, mime: r.mimeType, protocol: r.protocol, remoteIP: r.remoteIPAddress, remotePort: r.remotePort,
          fromCache: Boolean(r.fromDiskCache || r.fromPrefetchCache), fromMemory: false, fromSW: Boolean(r.fromServiceWorker), timing: r.timing, resHeaders: r.headers,
          security: r.securityState, encoded: r.encodedDataLength || e.encoded, cdpType: p.type, type: TYPE[p.type] || e.type,
        });
        this.touch(e);
        break;
      }
      case 'Network.responseReceivedExtraInfo': {
        const e = this.entries.get(p.requestId);
        if (e) { e.resHeaders = { ...(e.resHeaders || {}), ...p.headers }; if (p.statusCode) e.status = e.status || p.statusCode; }
        break;
      }
      case 'Network.requestServedFromCache': {
        const e = this.entries.get(p.requestId);
        if (e) { e.fromMemory = true; this.touch(e); }
        break;
      }
      case 'Network.dataReceived': {
        const e = this.entries.get(p.requestId);
        if (e) { e.decoded += p.dataLength; e.encoded += p.encodedDataLength || 0; this.touch(e); }
        break;
      }
      case 'Network.loadingFinished': {
        const e = this.entries.get(p.requestId);
        if (e) { e.end = p.timestamp; if (p.encodedDataLength) e.encoded = p.encodedDataLength; this.touch(e); }
        break;
      }
      case 'Network.loadingFailed': {
        const e = this.entries.get(p.requestId);
        if (e) { Object.assign(e, { end: p.timestamp, failed: true, errorText: p.errorText, canceled: p.canceled, blocked: p.blockedReason || p.corsErrorStatus && p.corsErrorStatus.corsError }); this.touch(e); }
        break;
      }
      case 'Network.webSocketCreated': {
        const e = { id: p.requestId, url: p.url, method: 'GET', type: 'ws', start: Date.now() / 1000, frames: 0, encoded: 0, decoded: 0 };
        this.entries.set(e.id, e);
        this.order.push(e.id);
        this.touch(e);
        break;
      }
      case 'Network.webSocketFrameReceived':
      case 'Network.webSocketFrameSent': {
        const e = this.entries.get(p.requestId);
        if (e) { e.frames = (e.frames || 0) + 1; e.decoded += (p.response && p.response.payloadData ? p.response.payloadData.length : 0); this.touch(e); }
        break;
      }
      default: break;
    }
  }

  details(id) {
    const e = this.entries.get(id);
    if (!e) return null;
    return { ...this.public(e), reqHeaders: e.reqHeaders || {}, resHeaders: e.resHeaders || {}, postData: e.postData || null };
  }

  async body(id) {
    const r = await cdp.send(this.wc, 'Network.getResponseBody', { requestId: String(id).split(':')[0] });
    return r;
  }

  /* HAR 1.2 (lisible par Chrome, Firefox, WebPageTest…). */
  har(appVersion) {
    const entries = this.order.map((id) => this.entries.get(id)).filter((e) => e && e.type !== 'ws' && e.wallTime);
    const base = entries.length ? entries[0] : null;
    const iso = (e) => new Date(((e.wallTime || 0) + 0) * 1000).toISOString();
    const hdr = (h) => Object.entries(h || {}).map(([name, value]) => ({ name, value: String(value) }));
    const qs = (u) => { try { return [...new URL(u).searchParams].map(([name, value]) => ({ name, value })); } catch { return []; } };
    const t = (e) => {
      const tm = e.timing;
      if (!tm) {
        const total = e.end && e.start ? (e.end - e.start) * 1000 : 0;
        return { blocked: -1, dns: -1, connect: -1, ssl: -1, send: 0, wait: total, receive: 0 };
      }
      const span = (a, b) => (tm[a] >= 0 && tm[b] >= 0 ? Math.max(0, tm[b] - tm[a]) : -1);
      const headers = tm.receiveHeadersEnd;
      const recv = e.end ? Math.max(0, (e.end - tm.requestTime) * 1000 - headers) : 0;
      const firstStart = [tm.dnsStart, tm.connectStart, tm.sendStart].filter((x) => x >= 0)[0] || 0;
      return {
        blocked: Math.max(0, (tm.requestTime - e.start) * 1000 + firstStart),
        dns: span('dnsStart', 'dnsEnd'),
        connect: span('connectStart', 'connectEnd'),
        ssl: span('sslStart', 'sslEnd'),
        send: Math.max(0, tm.sendEnd - tm.sendStart),
        wait: Math.max(0, headers - tm.sendEnd),
        receive: recv,
      };
    };
    return {
      log: {
        version: '1.2',
        creator: { name: 'NEX-BROWSER', version: appVersion || '3' },
        pages: base ? [{
          startedDateTime: iso(base), id: 'page_1', title: this.page.url || base.url, pageTimings: { onContentLoad: this.page.dcl && base.start ? (this.page.dcl - base.start) * 1000 : -1, onLoad: this.page.load && base.start ? (this.page.load - base.start) * 1000 : -1 },
        }] : [],
        entries: entries.map((e) => {
          const timings = t(e);
          const time = Object.values(timings).filter((x) => x > 0).reduce((a, b) => a + b, 0);
          return {
            pageref: 'page_1',
            startedDateTime: iso(e),
            time,
            request: {
              method: e.method, url: e.url, httpVersion: e.protocol || 'HTTP/1.1', headers: hdr(e.reqHeaders), queryString: qs(e.url), cookies: [], headersSize: -1, bodySize: e.postData ? e.postData.length : 0, ...(e.postData ? { postData: { mimeType: (e.reqHeaders && (e.reqHeaders['Content-Type'] || e.reqHeaders['content-type'])) || '', text: e.postData } } : {}),
            },
            response: {
              status: e.status || 0, statusText: e.statusText || (e.failed ? e.errorText : ''), httpVersion: e.protocol || 'HTTP/1.1', headers: hdr(e.resHeaders), cookies: [], content: { size: e.decoded || 0, mimeType: e.mime || '' }, redirectURL: e.redirectTo || '', headersSize: -1, bodySize: e.encoded || -1, _transferSize: e.encoded || 0,
            },
            cache: {},
            timings,
            serverIPAddress: e.remoteIP || '',
            _resourceType: (e.cdpType || '').toLowerCase(),
            _priority: e.priority,
            _initiator: e.initiator || undefined,
          };
        }),
      },
    };
  }
}

module.exports = { NetRecorder };
