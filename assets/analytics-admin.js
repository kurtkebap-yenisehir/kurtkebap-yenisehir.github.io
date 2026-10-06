import { getAnalyticsConfig } from './analytics-config.js';
import { EVENT_LABELS } from './analytics-shared.js';
import { normalizeReport } from './analytics-report.js';

const config = getAnalyticsConfig();
const $ = selector => document.querySelector(selector);
const numbers = new Intl.NumberFormat('tr-TR');
const daysFormat = new Intl.DateTimeFormat('tr-TR', {day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul'});
let token = '', expiresAt = 0, activeRequest, generation = 0, lastDays = 7;

function notice(message, error = false) {
  $('#stats-notice').textContent = message;
  $('#stats-notice').classList.toggle('error', error);
  $('#stats-notice').hidden = !message;
}

function busy(value) {
  for (const selector of ['#stats-login-button', '#stats-days', '#stats-refresh']) $(selector).disabled = value;
  $('#stats-results').setAttribute('aria-busy', String(value));
}

function signedOut(message = '') {
  generation++;
  activeRequest?.abort();
  token = ''; expiresAt = 0;
  $('#stats-password').value = '';
  $('#stats-signin').hidden = !config;
  $('#stats-dashboard').hidden = true;
  $('#stats-results').hidden = true;
  busy(false);
  notice(message, Boolean(message));
}

async function request(path, body, accessToken, signal) {
  const headers = {'Content-Type': 'application/json', apikey: config.publishableKey};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${config.url}${path}`, {method: 'POST', headers, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', signal});
  let data;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) {
    const error = new Error('İstek tamamlanamadı.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function addRow(body, values) {
  const row = document.createElement('tr');
  for (const value of values) { const cell = document.createElement('td'); cell.textContent = String(value); row.append(cell); }
  body.append(row);
}

function renderReport(report) {
  for (const key of ['visitors', 'sessions', 'page_views', 'button_clicks']) $(`#stats-${key.replaceAll('_', '-')}`).textContent = numbers.format(report.summary[key]);
  const dayText = value => daysFormat.format(new Date(`${value}T12:00:00+03:00`));
  $('#stats-period').textContent = `${dayText(report.start_date)} – ${dayText(report.end_date)}`;
  const dailyRows = $('#stats-daily-rows'); dailyRows.replaceChildren();
  const chart = $('#stats-chart'); chart.replaceChildren();
  const max = Math.max(1, ...report.daily.map(day => day.visitors));
  for (const day of report.daily) {
    addRow(dailyRows, [dayText(day.date), numbers.format(day.visitors), numbers.format(day.page_views)]);
    const bar = document.createElement('div'); bar.className = 'stats-chart-bar';
    bar.style.setProperty('--bar-height', `${day.visitors / max * 100}%`);
    bar.title = `${dayText(day.date)}: ${numbers.format(day.visitors)} ziyaretçi`; chart.append(bar);
  }
  const counts = new Map(report.events.map(event => [event.event_name, event.count]));
  const eventRows = $('#stats-event-rows'); eventRows.replaceChildren();
  for (const [name, label] of Object.entries(EVENT_LABELS).filter(([name]) => name !== 'page_view').sort(([a], [b]) => (counts.get(b) || 0) - (counts.get(a) || 0))) addRow(eventRows, [label, numbers.format(counts.get(name) || 0)]);
  const pageRows = $('#stats-page-rows'); pageRows.replaceChildren();
  const menuViews = report.pages.filter(row => row.page !== '/baglantilar.html').reduce((sum, row) => sum + row.page_views, 0);
  addRow(pageRows, ['Menü', numbers.format(menuViews)]);
  addRow(pageRows, ['Ortak QR sayfası', numbers.format(report.pages.find(row => row.page === '/baglantilar.html')?.page_views || 0)]);
  $('#stats-updated').textContent = `Son güncelleme: ${new Intl.DateTimeFormat('tr-TR', {dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul'}).format(new Date(report.updated_at))}`;
  $('#stats-empty').hidden = report.summary.page_views !== 0;
  $('#stats-results').hidden = false;
}

async function loadReport() {
  if (!token || Date.now() >= expiresAt) { signedOut('Giriş süresi doldu. Yeniden giriş yapın.'); return; }
  $('#stats-signin').hidden = true; $('#stats-dashboard').hidden = false;
  activeRequest?.abort();
  const controller = new AbortController(); activeRequest = controller;
  const current = ++generation;
  const timeout = setTimeout(() => controller.abort(), 15000);
  busy(true); notice('Rapor yükleniyor…');
  try {
    const days = Number($('#stats-days').value);
    const result = await request('/functions/v1/menu-analytics', {action: 'report', days}, token, controller.signal);
    if (current !== generation) return;
    const report = normalizeReport(result);
    renderReport(report); lastDays = days; notice('');
    $('#stats-signin').hidden = true; $('#stats-dashboard').hidden = false;
  } catch (error) {
    if (current !== generation) return;
    if (error.status === 401) signedOut('Giriş süresi doldu. Yeniden giriş yapın.');
    else if (error.status === 403) signedOut('Bu hesabın işletme istatistiklerine erişim yetkisi yok.');
    else { $('#stats-days').value = String(lastDays); notice(error.name === 'AbortError' ? 'Rapor isteği zaman aşımına uğradı. Yeniden deneyin.' : 'Rapor alınamadı. İnternet bağlantısını ve Supabase kurulumunu kontrol edin.', true); }
  } finally { clearTimeout(timeout); if (current === generation) busy(false); }
}

$('#stats-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!config) return;
  activeRequest?.abort();
  const controller = new AbortController(); activeRequest = controller;
  const current = ++generation;
  const email = $('#stats-email').value.trim(), password = $('#stats-password').value;
  $('#stats-password').value = '';
  const timeout = setTimeout(() => controller.abort(), 15000);
  busy(true); notice('Giriş yapılıyor…');
  try {
    const session = await request('/auth/v1/token?grant_type=password', {email, password}, null, controller.signal);
    if (current !== generation) return;
    if (typeof session?.access_token !== 'string' || !Number.isFinite(session.expires_in) || session.expires_in <= 0) throw new Error('Giriş yanıtı okunamadı.');
    token = session.access_token; expiresAt = Date.now() + session.expires_in * 1000;
  } catch (error) {
    if (current !== generation) return;
    notice(error.status === 400 || error.status === 401 ? 'E-posta veya şifre doğrulanamadı. Hesabınızın etkin olduğundan emin olun.' : error.status === 429 ? 'Çok fazla giriş denemesi yapıldı. Bir süre sonra yeniden deneyin.' : 'Giriş yapılamadı. Bağlantınızı ve Supabase kurulumunu kontrol edin.', true);
  } finally { clearTimeout(timeout); if (current === generation) busy(false); }
  if (current === generation && token) await loadReport();
});

$('#stats-days').addEventListener('change', loadReport);
$('#stats-refresh').addEventListener('click', loadReport);
$('#stats-logout').addEventListener('click', () => {
  const oldToken = token;
  signedOut();
  if (oldToken) request('/auth/v1/logout?scope=local', {}, oldToken).catch(() => {});
});
window.addEventListener('pagehide', () => { signedOut(); });
$('#stats-setup').hidden = Boolean(config);
$('#stats-signin').hidden = !config;
