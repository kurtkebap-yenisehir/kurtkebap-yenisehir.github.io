export const EVENT_NAMES = Object.freeze([
  'page_view', 'menu_open', 'order_open', 'trendyol_click', 'migros_click',
  'yemeksepeti_click', 'google_review_click', 'instagram_click', 'phone_click',
]);
export const PAGE_NAMES = Object.freeze(['/', '/index.html', '/baglantilar.html']);
export const MAX_BODY_BYTES = 2048;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasExactKeys(value, names) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === names.length
    && names.every((name) => Object.hasOwn(value, name));
}

export function validateCollect(value) {
  if (!hasExactKeys(value, ['action', 'event_id', 'visitor_id', 'session_id', 'event_name', 'page'])
      || value.action !== 'collect'
      || !['event_id', 'visitor_id', 'session_id'].every((name) => typeof value[name] === 'string' && UUID.test(value[name]))
      || !EVENT_NAMES.includes(value.event_name) || !PAGE_NAMES.includes(value.page)) {
    return null;
  }
  return {
    action: 'collect', event_id: value.event_id.toLowerCase(),
    visitor_id: value.visitor_id.toLowerCase(), session_id: value.session_id.toLowerCase(),
    event_name: value.event_name, page: value.page,
  };
}

export function validateReport(value) {
  return hasExactKeys(value, ['action', 'days']) && value.action === 'report'
    && [1, 7, 30].includes(value.days) ? { action: 'report', days: value.days } : null;
}

export function parseAllowedOrigins(setting) {
  const names = setting === undefined
    ? ['https://kurtkebap-yenisehir.github.io'] : setting.split(',').map((name) => name.trim()).filter(Boolean);
  if (names.length === 0 || names.some((name) => {
    try {
      const url = new URL(name);
      return url.origin !== name || url.username || url.password
        || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
    } catch { return true; }
  })) throw new Error('Invalid ALLOWED_ORIGINS');
  return new Set(names);
}

export async function readSmallJson(request) {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    throw new RangeError('Request too large');
  }
  const kind = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!['application/json', 'text/plain'].includes(kind)) throw new TypeError('Expected JSON');
  if (!request.body) throw new SyntaxError('Missing body');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError('Request too large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
