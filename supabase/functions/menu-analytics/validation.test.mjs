import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_NAMES, parseAllowedOrigins, readSmallJson, validateCollect, validateReport } from './validation.mjs';

const example = {
  action: 'collect', event_id: '11111111-1111-4111-8111-111111111111',
  visitor_id: '22222222-2222-4222-8222-222222222222',
  session_id: '33333333-3333-4333-8333-333333333333',
  event_name: 'page_view', page: '/baglantilar.html',
};

test('only known events, UUIDs, pathname values and fields reach the database', () => {
  for (const event_name of EVENT_NAMES) assert.ok(validateCollect({ ...example, event_name }));
  for (const invalid of [
    null, [], { ...example, event_name: 'unlimited_custom_event' },
    { ...example, page: '/?email=customer@example.com' },
    { ...example, visitor_id: 'customer@example.com' },
    { ...example, user_id: example.visitor_id },
    { ...example, created_at: '2020-01-01' },
    { ...example, action: 'report' },
  ]) assert.equal(validateCollect(invalid), null);
});

test('reports accept only the three numeric periods and no caller user_id', () => {
  for (const days of [1, 7, 30]) assert.deepEqual(validateReport({ action: 'report', days }), { action: 'report', days });
  for (const body of [
    { action: 'report', days: '7' }, { action: 'report', days: 90 },
    { action: 'report', days: 7, user_id: example.visitor_id },
  ]) assert.equal(validateReport(body), null);
});

test('CORS defaults to business origin; explicit localhost is accepted; wildcard and URL paths are rejected', () => {
  const origins = parseAllowedOrigins();
  assert.ok(origins.has('https://kurtkebap-yenisehir.github.io'));
  assert.ok(!origins.has('http://localhost:4173'));
  assert.ok(parseAllowedOrigins('https://kurtkebap-yenisehir.github.io,http://127.0.0.1:4173').has('http://127.0.0.1:4173'));
  for (const names of ['', '*', 'https://example.com/', 'https://example.com/path', 'http://example.com', 'https://user:pass@example.com']) {
    assert.throws(() => parseAllowedOrigins(names));
  }
});

test('small JSON supports beacon text payloads and rejects large chunked bodies', async () => {
  assert.deepEqual(await readSmallJson(new Request('https://example.com', {
    method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(example),
  })), example);
  await assert.rejects(readSmallJson(new Request('https://example.com', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: ' '.repeat(2049),
  })), RangeError);
  await assert.rejects(readSmallJson(new Request('https://example.com', {
    method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '999999999' }, body: '{}',
  })), RangeError);
  await assert.rejects(readSmallJson(new Request('https://example.com', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken',
  })), SyntaxError);
});
