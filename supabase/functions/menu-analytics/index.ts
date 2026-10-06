import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseAllowedOrigins, readSmallJson, validateCollect, validateReport } from './validation.mjs';

// This key stays inside the Edge Function. No incoming Authorization header is
// copied to the privileged database client.
const projectUrl = Deno.env.get('SUPABASE_URL') ?? '';
let serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
if (!serviceKey) {
  try { serviceKey = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; }
  catch { /* The handler returns a generic configuration error. */ }
}
const rateSalt = Deno.env.get('ANALYTICS_RATE_SALT') || serviceKey;
let origins: Set<string>;
try { origins = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS')); }
catch { origins = new Set(); }
const database = projectUrl && serviceKey ? createClient(projectUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}) : null;

function headersFor(origin: string) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff',
  });
  if (origins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info');
    headers.set('Access-Control-Max-Age', '600');
  }
  return headers;
}

async function rateHash(request: Request) {
  // Supabase's proxy supplies X-Forwarded-For. Missing/invalid addresses share
  // one restricted bucket instead of bypassing the limiter. No raw IP is saved.
  const forwarded = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  const ip = /^[\da-f:.]{3,64}$/i.test(forwarded) ? forwarded.toLowerCase() : 'unknown';
  const today = new Date().toISOString().slice(0, 10);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(rateSalt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`${today}\n${ip}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin') ?? '';
  const headers = headersFor(origin);
  const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
  if (!origins.has(origin)) return respond({ error: 'Bu adres için erişim kapalı.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') {
    headers.set('Allow', 'POST, OPTIONS');
    return respond({ error: 'Yalnızca POST destekleniyor.' }, 405);
  }
  if (!database || !rateSalt) return respond({ error: 'İstatistik servisi henüz yapılandırılmadı.' }, 503);

  let body;
  try { body = await readSmallJson(request); }
  catch (error) { return respond({ error: 'Geçersiz istek.' }, error instanceof RangeError ? 413 : 400); }

  try {
    const collection = validateCollect(body);
    if (collection) {
      const { data, error } = await database.rpc('analytics_record', {
        p_event_id: collection.event_id, p_visitor_id: collection.visitor_id,
        p_session_id: collection.session_id, p_event_name: collection.event_name,
        p_page: collection.page, p_ip_hash: await rateHash(request),
      });
      if (error) return respond({ error: 'Kayıt şu anda alınamıyor.' }, 503);
      if (data !== true) {
        headers.set('Retry-After', '600');
        return respond({ error: 'İstek sınırına ulaşıldı.' }, 429);
      }
      return respond({ ok: true });
    }

    const report = validateReport(body);
    if (!report) return respond({ error: 'Geçersiz istek.' }, 400);
    const authorization = request.headers.get('authorization') ?? '';
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match || match[1].length > 8192) return respond({ error: 'İstatistikleri görmek için giriş yapın.' }, 401);

    // getUser calls Supabase Auth to verify this exact token. Never trust an
    // unverified decoded JWT, body user_id, email, or GitHub access token.
    const { data: identity, error: authError } = await database.auth.getUser(match[1]);
    if (authError || !identity.user) return respond({ error: 'Oturum geçersiz veya süresi dolmuş.' }, 401);
    const { data, error } = await database.rpc('analytics_report', {
      p_user_id: identity.user.id, p_days: report.days,
    });
    if (error?.code === '42501') return respond({ error: 'Bu hesabın istatistikleri görme yetkisi yok.' }, 403);
    if (error) return respond({ error: 'Rapor şu anda alınamıyor.' }, 503);
    return respond(data);
  } catch {
    // Don't log request bodies, tokens, IP addresses or database errors.
    return respond({ error: 'İstatistik servisine şu anda ulaşılamıyor.' }, 503);
  }
});
