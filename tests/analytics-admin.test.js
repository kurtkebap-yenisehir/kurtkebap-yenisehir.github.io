import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { EVENT_LABELS } from '../assets/analytics-shared.js';
import { normalizeReport } from '../assets/analytics-report.js';

const source = (await readFile(new URL('../assets/analytics-admin.js', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '');
function element() {
  return {hidden: true, value: '', textContent: '', disabled: false, children: [], listeners: {}, attributes: {},
    classList: {toggle() {}}, style: {setProperty() {}},
    addEventListener(name, fn) { this.listeners[name] = fn; },
    setAttribute(name, value) { this.attributes[name] = value; },
    replaceChildren() { this.children = []; }, append(child) { this.children.push(child); }
  };
}
function setup(responses) {
  const nodes = new Map(), requests = [];
  const node = name => { if (!nodes.has(name)) nodes.set(name, element()); return nodes.get(name); };
  node('#stats-days').value = '7'; node('#stats-email').value = 'owner@example.test'; node('#stats-password').value = 'local-test-only';
  vm.runInNewContext(source, {
    document: {querySelector: node, createElement: element}, window: {addEventListener() {}},
    getAnalyticsConfig: () => ({url: 'https://example.supabase.co', publishableKey: 'test-public-key'}),
    EVENT_LABELS, normalizeReport, Intl, Date, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      requests.push({url, headers: options.headers, body: JSON.parse(options.body)});
      const result = responses.shift();
      assert.ok(result, 'Unexpected network request');
      return {ok: result.status === 200, status: result.status, json: async () => result.data};
    }
  });
  return {node, requests, submit: () => node('#stats-login-form').listeners.submit({preventDefault() {}})};
}
const login = {status: 200, data: {access_token: 'local-test-token', expires_in: 3600}};
const report = {status: 200, data: {summary: {visitors: 2, sessions: 3, page_views: 5, button_clicks: 4}, daily: [{date: '2026-10-06', visitors: 2, page_views: 5}], events: [{event_name: 'phone_click', count: 4}], pages: [{page: '/', page_views: 3}, {page: '/index.html', page_views: 1}, {page: '/baglantilar.html', page_views: 1}], updated_at: '2026-10-06T12:00:00Z', start_date: '2026-10-06', end_date: '2026-10-06'}};

test('password login clears password, sends verified-session report and signs out on expired session', async () => {
  const app = setup([login, report, {status: 401}]);
  await app.submit();
  assert.equal(app.node('#stats-password').value, '');
  assert.equal(app.requests[0].headers.Authorization, undefined);
  assert.deepEqual(app.requests[1].body, {action: 'report', days: 7});
  assert.equal(app.requests[1].headers.Authorization, 'Bearer local-test-token');
  assert.equal(app.node('#stats-results').hidden, false);
  assert.equal(app.node('#stats-visitors').textContent, '2');
  assert.equal(app.node('#stats-page-views').textContent, '5');
  await app.node('#stats-refresh').listeners.click();
  assert.equal(app.node('#stats-dashboard').hidden, true);
  assert.equal(app.node('#stats-signin').hidden, false);
  assert.match(app.node('#stats-notice').textContent, /Giriş süresi doldu/);
});
test('an unauthorized account cannot see reports or empty fake totals', async () => {
  const app = setup([login, {status: 403}]);
  await app.submit();
  assert.equal(app.node('#stats-dashboard').hidden, true);
  assert.equal(app.node('#stats-results').hidden, true);
  assert.equal(app.node('#stats-signin').hidden, false);
  assert.match(app.node('#stats-notice').textContent, /erişim yetkisi yok/);
});
test('first report service outage allows retry without pretending data is zero', async () => {
  const app = setup([login, {status: 503}, report]);
  await app.submit();
  assert.equal(app.node('#stats-dashboard').hidden, false);
  assert.equal(app.node('#stats-results').hidden, true);
  assert.equal(app.node('#stats-refresh').disabled, false);
  assert.match(app.node('#stats-notice').textContent, /Rapor alınamadı/);
  await app.node('#stats-refresh').listeners.click();
  assert.equal(app.node('#stats-results').hidden, false);
});
