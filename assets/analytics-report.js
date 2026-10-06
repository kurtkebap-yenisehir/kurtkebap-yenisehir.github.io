const count = value => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Geçersiz istatistik yanıtı.');
  return value;
};
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new Error('Geçersiz rapor tarihi.');
  return value;
};

export function normalizeReport(raw) {
  if (!raw || !raw.summary || !Array.isArray(raw.daily) || raw.daily.length > 30 || !Array.isArray(raw.events) || raw.events.length > 20 || !Array.isArray(raw.pages) || raw.pages.length > 3) throw new Error('Rapor yanıtı okunamadı.');
  if (typeof raw.updated_at !== 'string' || Number.isNaN(Date.parse(raw.updated_at))) throw new Error('Güncelleme tarihi okunamadı.');
  return {
    summary: Object.fromEntries(['visitors', 'sessions', 'page_views', 'button_clicks'].map(key => [key, count(raw.summary[key])])),
    daily: raw.daily.map(row => ({date: date(row.date), visitors: count(row.visitors), page_views: count(row.page_views)})),
    events: raw.events.map(row => {
      if (typeof row.event_name !== 'string' || row.event_name.length > 40) throw new Error('Buton raporu okunamadı.');
      return {event_name: row.event_name, count: count(row.count)};
    }),
    pages: raw.pages.map(row => {
      if (!['/', '/index.html', '/baglantilar.html'].includes(row.page)) throw new Error('Sayfa raporu okunamadı.');
      return {page: row.page, page_views: count(row.page_views)};
    }),
    updated_at: raw.updated_at, start_date: date(raw.start_date), end_date: date(raw.end_date)
  };
}
