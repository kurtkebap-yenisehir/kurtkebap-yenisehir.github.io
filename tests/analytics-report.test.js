import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReport } from '../assets/analytics-report.js';

const report = () => ({summary: {visitors: 2, sessions: 3, page_views: 5, button_clicks: 4}, daily: [{date: '2026-10-05', visitors: 2, page_views: 3}, {date: '2026-10-06', visitors: 1, page_views: 2}], events: [{event_name: 'phone_click', count: 4}], pages: [{page: '/', page_views: 5}], updated_at: '2026-10-06T12:00:00Z', start_date: '2026-10-05', end_date: '2026-10-06'});
test('period unique visitors are preserved instead of summing daily visitors', () => {
  const value = normalizeReport(report());
  assert.equal(value.summary.visitors, 2);
  assert.equal(value.daily.reduce((sum, day) => sum + day.visitors, 0), 3);
});
test('malformed and negative remote counts are rejected', () => {
  const value = report(); value.summary.page_views = -1;
  assert.throws(() => normalizeReport(value));
  const another = report(); another.events[0].count = '4';
  assert.throws(() => normalizeReport(another));
});
test('unexpected page identifiers and oversized daily data are rejected', () => {
  const value = report(); value.pages[0].page = '/admin.html';
  assert.throws(() => normalizeReport(value));
  const another = report(); another.daily = Array(31).fill(another.daily[0]);
  assert.throws(() => normalizeReport(another));
});
