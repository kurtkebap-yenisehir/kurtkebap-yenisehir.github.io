import { validateMenu, sortedCategories, categoryDescriptions, normalizeSearch, createProductCard, PREVIEW_KEY, MENU_URL } from './shared.js';
const nav = document.querySelector('#categories');
const grid = document.querySelector('#menu-grid');
const status = document.querySelector('#menu-status');
const search = document.querySelector('#search');
const preview = new URLSearchParams(location.search).get('preview') === '1';
let menu, selected = '', lastLoaded = 0, previewImages = {};
function render() {
  const query = normalizeSearch(search.value.trim());
  const categories = sortedCategories(menu);
  const visible = query ? categories : [selected];
  nav.replaceChildren();
  for (const category of categories) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'category-button'; button.textContent = category;
    button.setAttribute('aria-pressed', String(!query && category === selected));
    button.addEventListener('click', () => { selected = category; search.value = ''; render(); });
    nav.append(button);
  }
  document.querySelector('#category-title').textContent = query ? 'Arama sonuçları' : selected;
  document.querySelector('#category-eyebrow').textContent = query ? 'MENÜDE ARA' : 'MENÜMÜZ';
  document.querySelector('#category-description').textContent = query ? `“${search.value.trim()}” için menümüzde bulunan lezzetler.` : categoryDescriptions[selected] || 'Menümüzden lezzetler.';
  const cards = [];
  for (const category of visible) {
    for (const product of menu[category]) {
      if (product.aktif === false) continue;
      if (query && !normalizeSearch(`${product.isim} ${product.aciklama} ${category}`).includes(query)) continue;
      const card = createProductCard(product, category);
      const draftImage = previewImages[product.resim];
      if (preview && typeof draftImage === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(draftImage)) card.querySelector('img').src = draftImage;
      cards.push(card);
    }
  }
  grid.replaceChildren(...cards);
  document.querySelector('#product-count').textContent = `${cards.length} ürün`;
  status.hidden = cards.length > 0;
  status.textContent = query ? 'Aradığınız ürün bulunamadı. Başka bir kelime deneyebilirsiniz.' : 'Bu kategoride şu an gösterilecek ürün bulunmuyor.';
}
async function loadMenu() {
  try {
    let data;
    if (preview) {
      const raw = sessionStorage.getItem(PREVIEW_KEY);
      if (!raw) throw new Error('Taslak bulunamadı.');
      const draft = JSON.parse(raw);
      data = draft.menu || draft;
      previewImages = draft.images || {};
      document.querySelector('#preview-banner').hidden = false;
    } else {
      const response = await fetch(MENU_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('Menü yüklenemedi.');
      data = await response.json();
    }
    menu = validateMenu(data);
    if (!Object.hasOwn(menu, selected)) selected = sortedCategories(menu)[0];
    lastLoaded = Date.now(); render();
  } catch {
    if (menu) return;
    status.hidden = false; status.replaceChildren();
    const message = document.createElement('p'); message.textContent = preview ? 'Taslak yüklenemedi. Yönetim panelinden önizlemeyi yeniden açın.' : 'Menümüz şu an yüklenemedi. Lütfen tekrar deneyin.';
    const retry = document.createElement('button'); retry.className = 'button primary'; retry.textContent = 'Tekrar dene'; retry.addEventListener('click', loadMenu);
    status.append(message, retry);
  }
}
search.addEventListener('input', () => { if (menu) render(); });
document.addEventListener('visibilitychange', () => { if (!preview && !document.hidden && Date.now() - lastLoaded > 60000) loadMenu(); });
loadMenu();
