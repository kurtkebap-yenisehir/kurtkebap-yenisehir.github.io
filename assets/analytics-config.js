// These values are public. Publish this configuration after enabling the collector and owner account.
// Never place a secret/service-role key or a GitHub access token here.
export const ANALYTICS_CONFIG = Object.freeze({
  url: 'https://loopwgeevnowvycojcss.supabase.co',
  publishableKey: 'sb_publishable_iIaZBadLOFE2I4dvURtq9w_z-oYOyw8',
});

function anonPayload(key) {
  try {
    const segments = key.split('.');
    if (segments.length !== 3 || !segments.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return null;
    const decode = value => {
      const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')));
    };
    const header = decode(segments[0]);
    return header.alg === 'HS256' ? decode(segments[1]) : null;
  } catch { return null; }
}

export function getAnalyticsConfig(raw = ANALYTICS_CONFIG) {
  if (!raw || typeof raw.url !== 'string' || typeof raw.publishableKey !== 'string') return null;
  const key = raw.publishableKey.trim();
  try {
    const url = new URL(raw.url.trim());
    if (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') return null;
    const project = url.hostname.split('.')[0];
    if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) {
      const payload = anonPayload(key);
      if (!payload || payload.role !== 'anon' || payload.iss !== 'supabase' || payload.ref !== project || typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
    }
    return Object.freeze({ url: url.origin, publishableKey: key });
  } catch { return null; }
}

export function isAnalyticsConfigured(raw = ANALYTICS_CONFIG) {
  return getAnalyticsConfig(raw) !== null;
}
