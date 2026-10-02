export const REPOSITORY = 'emrekrt221-ship-it/qr_menu';
export const BRANCH = 'main';
// Existing management remains the single source for prices and uploaded photos.
export const DATA_BASE_URL = 'https://emrekrt221-ship-it.github.io/qr_menu/';
export const MENU_URL = new URL('menu.json', DATA_BASE_URL).href;
export const DRAFT_KEY = 'kurt-kebap-menu-draft-v1';
export const PREVIEW_KEY = 'kurt-kebap-menu-preview-v1';
export const categoryOrder = ['Kebaplar', 'Porsiyonlar', 'Dürümler', 'Hamburgerler', 'Mezeler', 'İçecekler'];
export const categoryDescriptions = {
  Kebaplar: 'Kebap çeşitlerimiz, ızgaralarımız ve özel tabaklarımız.',
  Porsiyonlar: 'Mangal lezzetleri, sofranıza porsiyon olarak.',
  Dürümler: 'Lavaşın içinde sevdiğiniz mangal lezzetleri.',
  Hamburgerler: 'Burger çeşitlerimiz ve çıtır eşlikçileri.',
  Mezeler: 'Sofranın keyfini tamamlayan mezeler ve salatalar.',
  İçecekler: 'Yemeğinizin yanında serin bir eşlikçi.'
};
export function sortedCategories(menu) {
  return [...categoryOrder.filter(key => Object.hasOwn(menu, key)), ...Object.keys(menu).filter(key => !categoryOrder.includes(key))];
}
export function parsePrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value <= 1000000 ? Math.round(value * 100) / 100 : NaN;
  if (typeof value !== 'string') return NaN;
  let clean = value.replace(/TL|₺|\s/gi, '');
  if (!/^\d+(?:[.,]\d+)*$/.test(clean)) return NaN;
  if (clean.includes(',')) clean = clean.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(clean)) clean = clean.replace(/\./g, '');
  const price = Number(clean);
  return Number.isFinite(price) && price >= 0 && price <= 1000000 ? Math.round(price * 100) / 100 : NaN;
}
export function formatAmount(price) { return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(price); }
export function priceString(price) { return `${formatAmount(price)} TL`; }
export function normalizeSearch(value) { return value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i'); }
export function safeImage(value) {
  if (typeof value !== 'string' || !value.trim()) return 'assets/mark.svg';
  if (/^images\/[\p{L}\p{N} _().-]+\.(?:png|jpe?g|webp|avif)$/iu.test(value)) return new URL(value, DATA_BASE_URL).href;
  try { const url = new URL(value); if (url.protocol === 'https:') return url.href; } catch { /* Invalid images fall back to the brand mark. */ }
  return 'assets/mark.svg';
}
export function validateMenu(menu) {
  if (!menu || Array.isArray(menu) || typeof menu !== 'object' || !Object.keys(menu).length) throw new Error('Menü biçimi geçersiz.');
  let total = 0;
  for (const [category, products] of Object.entries(menu)) {
    if (!category.trim() || !Array.isArray(products)) throw new Error('Kategori biçimi geçersiz.');
    for (const product of products) {
      total++;
      if (!product || typeof product.isim !== 'string' || !product.isim.trim() || typeof product.aciklama !== 'string' || typeof product.resim !== 'string' || !Number.isFinite(parsePrice(product.fiyat)) || (Object.hasOwn(product, 'aktif') && typeof product.aktif !== 'boolean')) throw new Error('Ürün adı, açıklaması veya fiyatı geçersiz.');
    }
  }
  if (!total) throw new Error('Menüde en az bir ürün bulunmalı.');
  return menu;
}
export function createProductCard(product, category) {
  const card = document.createElement('article'); card.className = 'product-card';
  const photo = document.createElement('img'); photo.className = `product-photo${category === 'İçecekler' ? ' drink' : ''}`;
  photo.src = safeImage(product.resim); photo.alt = product.isim; photo.loading = 'lazy'; photo.width = 500; photo.height = 312;
  photo.addEventListener('error', () => { photo.src = 'assets/mark.svg'; photo.classList.add('drink'); }, { once: true });
  const body = document.createElement('div'); body.className = 'product-body';
  const name = document.createElement('h3'); name.textContent = product.isim;
  const description = document.createElement('p'); description.className = 'product-description'; description.textContent = product.aciklama;
  const bottom = document.createElement('div'); bottom.className = 'product-bottom';
  const price = document.createElement('span'); price.className = 'product-price'; price.textContent = formatAmount(parsePrice(product.fiyat));
  const currency = document.createElement('small'); currency.textContent = '₺'; price.append(currency);
  const categoryText = document.createElement('span'); categoryText.className = 'product-category'; categoryText.textContent = category;
  bottom.append(price, categoryText); body.append(name, description, bottom); card.append(photo, body);
  return card;
}
