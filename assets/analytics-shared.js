export const EVENT_LABELS = Object.freeze({
  page_view: 'Sayfa görüntülenmesi',
  menu_open: 'Menüyü aç',
  order_open: 'Online sipariş seçenekleri',
  trendyol_click: 'Trendyol Go',
  migros_click: 'Migros Yemek',
  yemeksepeti_click: 'Yemeksepeti',
  google_review_click: 'Google yorum',
  instagram_click: 'Instagram',
  phone_click: 'Telefon',
});

export const TRACKED_PAGES = Object.freeze(['/', '/index.html', '/baglantilar.html']);
export const ANALYTICS_CONSENT_KEY = 'kurt-kebap.analytics.consent.v1';
export const ANALYTICS_VISITOR_KEY = 'kurt-kebap.analytics.visitor.v1';
export const ANALYTICS_SESSION_KEY = 'kurt-kebap.analytics.session.v1';
export const SESSION_TTL_MS = 30 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAnalyticsEligible(location, navigator = {}) {
  if (!location || location.protocol !== 'https:' || location.hostname !== 'kurtkebap-yenisehir.github.io' || !TRACKED_PAGES.includes(location.pathname)) return false;
  if (new URLSearchParams(location.search || '').has('preview')) return false;
  return navigator.globalPrivacyControl !== true && !['1', 'yes'].includes(String(navigator.doNotTrack || location.doNotTrack || '').toLowerCase());
}

export function analyticsUuid(crypto = globalThis.crypto) {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto?.getRandomValues !== 'function') return null;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function read(storage, key) {
  try { return storage?.getItem(key) || null; } catch { return null; }
}
function write(storage, key, value) {
  try { storage?.setItem(key, value); } catch { /* Continue with memory-only identity. */ }
}

// Construct only after permission; importing this module never accesses storage.
export function createAnalyticsIdentity({ localStorage, sessionStorage, now = Date.now, uuid = analyticsUuid } = {}) {
  let visitorId = read(localStorage, ANALYTICS_VISITOR_KEY);
  if (!UUID.test(visitorId || '')) {
    visitorId = uuid();
    if (UUID.test(visitorId || '')) write(localStorage, ANALYTICS_VISITOR_KEY, visitorId);
  }
  let session;
  try { session = JSON.parse(read(sessionStorage, ANALYTICS_SESSION_KEY)); } catch { session = null; }
  return {
    current() {
      if (!UUID.test(visitorId || '')) return null;
      const time = now();
      if (!session || !UUID.test(session.id || '') || !Number.isFinite(session.lastSeen) || time < session.lastSeen || time - session.lastSeen >= SESSION_TTL_MS) session = { id: uuid(), lastSeen: time };
      if (!UUID.test(session.id || '')) return null;
      session.lastSeen = time;
      write(sessionStorage, ANALYTICS_SESSION_KEY, JSON.stringify(session));
      return { visitor_id: visitorId, session_id: session.id };
    },
    clear() {
      visitorId = null; session = null;
      for (const [storage, key] of [[localStorage, ANALYTICS_VISITOR_KEY], [sessionStorage, ANALYTICS_SESSION_KEY]]) {
        try { storage?.removeItem(key); } catch { /* No persistence when storage is unavailable. */ }
      }
    },
  };
}

export function buildAnalyticsEvent(eventName, page, identity, eventId) {
  if (!Object.hasOwn(EVENT_LABELS, eventName) || !TRACKED_PAGES.includes(page) || !UUID.test(eventId || '') || !UUID.test(identity?.visitor_id || '') || !UUID.test(identity?.session_id || '')) return null;
  return { action: 'collect', event_id: eventId, visitor_id: identity.visitor_id, session_id: identity.session_id, event_name: eventName, page };
}
