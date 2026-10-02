import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePrice, priceString, normalizeSearch, validateMenu, safeImage, sortedCategories, DATA_BASE_URL } from '../assets/shared.js';
test('prices support existing narrow spaces and Turkish decimal/grouping separators', () => {
  for (const [value, expected] of [['230\u202fTL', 230], ['1.250,50 TL', 1250.5], ['1250.50', 1250.5], ['1.000 TL', 1000], ['0', 0], ['99,9 ₺', 99.9]]) assert.equal(parsePrice(value), expected);
  for (const value of ['', '-10', 'NaN', 'abc', '1,2,3', 'Infinity', '1000001', null]) assert.ok(Number.isNaN(parsePrice(value)));
  assert.equal(priceString(1234.5), '1.234,5 TL');
});
test('original menu keeps all 47 products and local image references exist', async () => {
  const menu = validateMenu(JSON.parse(await readFile(new URL('../menu.json', import.meta.url), 'utf8')));
  assert.equal(Object.keys(menu).length, 6);
  assert.equal(Object.values(menu).flat().length, 47);
  assert.equal(sortedCategories(menu)[0], 'Kebaplar');
  for (const product of Object.values(menu).flat()) if (product.resim.startsWith('images/')) await readFile(new URL(`../${product.resim}`, import.meta.url));
});
test('unsafe image schemes are rejected and Turkish search works with unaccented input', () => {
  assert.equal(safeImage('javascript:alert(1)'), 'assets/mark.svg');
  assert.equal(safeImage('images/../../secret.jpg'), 'assets/mark.svg');
  assert.equal(safeImage('images/patlıcan_kebap.jpg'), new URL('images/patlıcan_kebap.jpg', DATA_BASE_URL).href);
  assert.equal(normalizeSearch('Çıtır ŞİŞ'), 'citir sis');
});
test('invalid remote data cannot be published as valid menu', () => {
  assert.throws(() => validateMenu({ Kebaplar: [{ isim: 'Adana', aciklama: '', resim: '', fiyat: '-1' }] }));
  assert.throws(() => validateMenu({ Kebaplar: [{ isim: 'Adana', aciklama: '', resim: '', fiyat: '1', aktif: 'false' }] }));
});
