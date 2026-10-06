import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import * as analyticsShared from '../assets/analytics-shared.js';
import { getAnalyticsConfig } from '../assets/analytics-config.js';
import { ANALYTICS_VISITOR_KEY, ANALYTICS_SESSION_KEY, SESSION_TTL_MS, EVENT_LABELS, buildAnalyticsEvent, createAnalyticsIdentity, isAnalyticsEligible } from '../assets/analytics-shared.js';

const project = 'abcdefghijklmnopqrst';
const publicKey = 'sb_publishable_012345678901234567890123456789';
const config = { url: `https://${project}.supabase.co`, publishableKey: publicKey };
const jwt = payload => [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ iss: 'supabase', ref: project, role: 'anon', exp: Math.floor(Date.now() / 1000) + 3600, ...payload })).toString('base64url'),
  'signature',
].join('.');
const location = { protocol: 'https:', hostname: 'kurtkebap-yenisehir.github.io', pathname: '/baglantilar.html', search: '' };
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('empty configuration is inactive; only Supabase public keys are accepted', () => {
  assert.equal(getAnalyticsConfig({ url: '', publishableKey: '' }), null);
  assert.deepEqual(getAnalyticsConfig({ url: `  ${config.url}/  `, publishableKey: ` ${publicKey} ` }), config);
  assert.ok(getAnalyticsConfig({ ...config, publishableKey: jwt({}) }));
  for (const key of ['sb_secret_012345678901234567890123456789', 'github_pat_example', jwt({ role: 'service_role' }), jwt({ ref: 'otherproject' }), jwt({ exp: 0 }), 'malformed.jwt.key']) {
    assert.equal(getAnalyticsConfig({ ...config, publishableKey: key }), null);
  }
  for (const url of ['http://abcdefghijklmnopqrst.supabase.co', 'https://abcdefghijklmnopqrst.supabase.co.evil.example', `${config.url}/functions`, `${config.url}?key=1`, `https://user:pass@${project}.supabase.co`, 'https://localhost']) {
    assert.equal(getAnalyticsConfig({ ...config, url }), null);
  }
});

test('preview, development, non-public paths and privacy opt-outs cannot collect', () => {
  for (const pathname of ['/', '/index.html', '/baglantilar.html']) assert.equal(isAnalyticsEligible({ ...location, pathname }), true);
  for (const changed of [{ hostname: 'localhost' }, { hostname: '127.0.0.1' }, { protocol: 'http:' }, { pathname: '/admin.html' }, { search: '?preview=1' }, { search: '?preview=0' }]) assert.equal(isAnalyticsEligible({ ...location, ...changed }), false);
  for (const navigator of [{ doNotTrack: '1' }, { doNotTrack: 'yes' }, { globalPrivacyControl: true }]) assert.equal(isAnalyticsEligible(location, navigator), false);
});

test('browser identity survives genuine navigation and renews session after inactivity', () => {
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  let time = 1000;
  const options = { localStorage, sessionStorage, now: () => time, uuid: randomUUID };
  const first = createAnalyticsIdentity(options).current();
  time += 100;
  const navigation = createAnalyticsIdentity(options).current();
  assert.deepEqual(navigation, first);
  time += SESSION_TTL_MS;
  const nextSession = createAnalyticsIdentity(options).current();
  assert.equal(nextSession.visitor_id, first.visitor_id);
  assert.notEqual(nextSession.session_id, first.session_id);
});

test('blocked storage uses stable memory identity and malformed stored records are replaced', () => {
  const blockedStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  const manager = createAnalyticsIdentity({ localStorage: blockedStorage, sessionStorage: blockedStorage, uuid: randomUUID });
  assert.deepEqual(manager.current(), manager.current());
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  localStorage.setItem(ANALYTICS_VISITOR_KEY, 'not-a-browser-uuid');
  sessionStorage.setItem(ANALYTICS_SESSION_KEY, '{broken-json');
  const stored = createAnalyticsIdentity({ localStorage, sessionStorage, uuid: randomUUID });
  const identity = stored.current();
  assert.equal(localStorage.getItem(ANALYTICS_VISITOR_KEY), identity.visitor_id);
  assert.equal(JSON.parse(sessionStorage.getItem(ANALYTICS_SESSION_KEY)).id, identity.session_id);
  assert.notEqual(identity.visitor_id, 'not-a-browser-uuid');
});

test('events contain only permitted labels, paths and random identifiers', () => {
  const identity = { visitor_id: randomUUID(), session_id: randomUUID(), extra: 'never sent' };
  const eventId = randomUUID();
  assert.deepEqual(buildAnalyticsEvent('page_view', '/baglantilar.html', identity, eventId), {
    action: 'collect', event_id: eventId, visitor_id: identity.visitor_id, session_id: identity.session_id, event_name: 'page_view', page: '/baglantilar.html',
  });
  for (const [event, page, ids, id] of [['search', '/', identity, eventId], ['page_view', '/?preview=1', identity, eventId], ['page_view', '/admin.html', identity, eventId], ['page_view', '/', { ...identity, visitor_id: 'personal-id' }, eventId], ['page_view', '/', identity, 'github_pat_secret']]) assert.equal(buildAnalyticsEvent(event, page, ids, id), null);
});

test('both pages label existing links without changing their destination', async () => {
  for (const filename of ['index.html', 'baglantilar.html']) {
    const html = await readFile(new URL(`../${filename}`, import.meta.url), 'utf8');
    const labels = [...html.matchAll(/data-track="([^"]+)"/g)].map(match => match[1]);
    for (const label of labels) assert.ok(Object.hasOwn(EVENT_LABELS, label));
    for (const label of ['menu_open', 'order_open', 'trendyol_click', 'migros_click', 'yemeksepeti_click', 'phone_click']) assert.ok(labels.includes(label));
    assert.match(html, /href="tel:\+905319640123" data-track="phone_click"/);
    assert.match(html, /src="assets\/analytics.js"/);
    assert.doesNotMatch(html, /analytics-consent|analytics-notice|analytics-preferences/);
  }
});

test('unconfigured collector starts without reading browser, storage or DOM', async () => {
  const source = (await readFile(new URL('../assets/analytics.js', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '');
  let configReads = 0;
  const context = { getAnalyticsConfig: () => { configReads += 1; return null; } };
  for (const name of ['window', 'document', 'location', 'navigator', 'localStorage', 'sessionStorage', 'fetch']) {
    Object.defineProperty(context, name, { get() { throw Error(`Unexpected access to ${name} without configuration`); } });
  }
  runInNewContext(source, context);
  assert.equal(configReads, 1);
});

test('collector starts automatically without UI, preserves navigation and respects privacy opt-outs', async () => {
  class Element {
    constructor() { this.dataset = {}; }
    closest() { return this; }
  }
  class HTMLDetailsElement extends Element {}
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  const listeners = {};
  const windowListeners = {};
  const requests = [];
  const navigator = {};
  const source = (await readFile(new URL('../assets/analytics.js', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '');
  runInNewContext(source, {
    ...analyticsShared, analyticsUuid: randomUUID, getAnalyticsConfig: () => config,
    location, navigator, Element, HTMLDetailsElement,
    window: { localStorage, sessionStorage, addEventListener: (name, listener) => { windowListeners[name] = listener; } },
    document: {
      createElement() { throw Error('Analytics must not insert a permission window or controls'); },
      querySelector() { throw Error('Analytics must not change page controls'); },
      addEventListener: (name, listener) => { listeners[name] = listener; },
    },
    fetch: (url, options) => { requests.push({ url, ...options }); return Promise.resolve({ ok: true }); },
  });
  assert.equal(requests.length, 1, 'page view is collected without visitor interaction');
  assert.equal(JSON.parse(requests[0].body).event_name, 'page_view');
  assert.ok(localStorage.getItem(ANALYTICS_VISITOR_KEY));
  assert.ok(sessionStorage.getItem(ANALYTICS_SESSION_KEY));
  assert.equal(windowListeners.pageshow, undefined, 'BFCache restore cannot duplicate the page view');
  assert.equal(windowListeners.storage, undefined, 'old permission storage cannot change automatic measurement');
  const anchor = new Element(); anchor.dataset.track = 'trendyol_click';
  const click = { target: anchor, button: 0, defaultPrevented: false, preventDefault() { throw Error('navigation intercepted'); } };
  listeners.click(click);
  assert.equal(requests.length, 2);
  assert.equal(JSON.parse(requests[1].body).event_name, 'trendyol_click');
  assert.equal(requests[1].keepalive, true);
  assert.equal(requests[1].credentials, 'omit');
  assert.equal(requests[1].referrerPolicy, 'no-referrer');
  assert.deepEqual(Object.keys(requests[1].headers).sort(), ['apikey', 'content-type']);
  const detail = new HTMLDetailsElement(); detail.dataset.track = 'order_open'; detail.open = false;
  listeners.toggle({ target: detail });
  assert.equal(requests.length, 2);
  detail.open = true;
  listeners.toggle({ target: detail });
  assert.equal(JSON.parse(requests[2].body).event_name, 'order_open');
  navigator.globalPrivacyControl = true;
  listeners.click(click);
  assert.equal(requests.length, 3);
  navigator.globalPrivacyControl = false;
  navigator.doNotTrack = '1';
  listeners.click(click);
  assert.equal(requests.length, 3);
  navigator.doNotTrack = '0';
  listeners.click(click);
  assert.equal(requests.length, 4);
  assert.equal(requests.filter(request => JSON.parse(request.body).event_name === 'page_view').length, 1);
  assert.ok(Object.keys(listeners).every(name => ['click', 'toggle'].includes(name)));
});
