import { REPOSITORY, BRANCH, DRAFT_KEY, PREVIEW_KEY, validateMenu, sortedCategories, parsePrice, formatAmount, priceString, safeImage, normalizeSearch, MENU_URL } from './shared.js';

const $ = (id) => document.getElementById(id);
const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (first, second) => JSON.stringify(first) === JSON.stringify(second);
const API_BASE = `https://api.github.com/repos/${REPOSITORY}`;
let menu = null;
let baseline = null;
let baselineSha = null;
let images = {};
let token = '';
let busy = false;
let storageFailed = false;
let modalItem = null;
let modalPhoto = null;
let uploadGeneration = 0;
let uploadingPhoto = false;
let pendingPublish = null;
let githubCheckedAt = 0;
const rawPrices = new Map();

function notice(message, error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
  $('notice').hidden = !message;
}

function isDirty() {
  return Boolean(menu && baseline && !same(menu, baseline));
}

function countChanges() {
  if (!menu || !baseline) return 0;
  return Object.entries(menu).reduce((total, [category, products]) => total + products.filter((product, index) => !same(product, baseline[category]?.[index])).length, 0);
}

function imageSource(path) {
  return images[path]?.dataURL || safeImage(path);
}

function pruneImages() {
  const referenced = new Set(Object.values(menu || {}).flat().map((product) => product.resim));
  for (const path of Object.keys(images)) if (!referenced.has(path)) delete images[path];
}

function missingPhotos() {
  const existing = new Set(Object.values(baseline || {}).flat().map((product) => product.resim));
  return Object.values(menu || {}).flat().filter((product) => /^images\/upload-/.test(product.resim) && !images[product.resim] && !existing.has(product.resim));
}

function persistDraft() {
  pruneImages();
  try {
    // Credentials are intentionally excluded. Only menu data and pending photos are persisted.
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, menu, baseline, baselineSha, images, pendingPublish, githubCheckedAt, rawPrices: Object.fromEntries(rawPrices) }));
    storageFailed = false;
  } catch {
    storageFailed = true;
    notice('Tarayıcının taslak alanı dolu veya kapalı. Düzenlemeler bu sekmede duruyor; sekmeyi kapatmadan GitHub\'a kaydedin veya JSON yedeğini indirin. Fotoğraflar için daha küçük dosyalar kullanabilirsiniz.', true);
  }
  updateStatus();
}

function updateStatus() {
  const dirty = isDirty();
  const count = countChanges();
  const missing = missingPhotos().length;
  $('connection-state').classList.toggle('is-connected', Boolean(token));
  $('connection-label').textContent = token ? 'GitHub bağlı' : 'Bağlı değil';
  $('connect-form').hidden = Boolean(token);
  $('disconnect-button').hidden = !token;
  $('save-status').textContent = busy ? 'İşlem sürüyor…' : !menu ? 'Menü yüklenemedi' : rawPrices.size ? `${rawPrices.size} geçersiz fiyatı düzeltin` : missing ? `${missing} fotoğrafı yeniden seçin` : dirty ? `${count} ürün değişikliği hazır` : 'Tüm değişiklikler kayıtlı';
  $('save-detail').textContent = storageFailed ? 'Taslak bu sekmede. Yedek indirin.' : rawPrices.size ? 'Fiyatları kontrol edin. Önizleme ve kaydetme düzeltildikten sonra açılır.' : missing ? `${missingPhotos().map((product) => product.isim).join(', ')}: fotoğraf verisi eksik. Ürünü düzenleyip fotoğrafı yeniden yükleyin veya kaldırın.` : dirty ? 'Taslak bu tarayıcıda · Yayına almak için GitHub\'a kaydedin' : token ? 'GitHub\'a bağlı · Menü düzenlemeye hazır' : 'Düzenleyebilir ve önizleyebilirsiniz · Kaydetmek için bağlanın';
  $('publish-button').disabled = busy || !token || !dirty || rawPrices.size > 0 || missing > 0 || !menu;
  $('publish-button').textContent = busy ? 'Lütfen bekleyin…' : 'GitHub\'a kaydet';
  $('preview-button').disabled = busy || !menu || rawPrices.size > 0 || missing > 0;
  $('reload-button').disabled = busy || !token;
  $('download-button').disabled = busy || !menu;
  $('reset-button').disabled = busy || (!dirty && !rawPrices.size);
  $('add-product').disabled = busy || !menu || rawPrices.size > 0;
  $('connect-button').disabled = busy || rawPrices.size > 0;
  $('bulk-form').querySelectorAll('input,select,button').forEach((element) => { element.disabled = busy || rawPrices.size > 0; });
  $('editor-list').querySelectorAll('button').forEach((element) => { element.disabled = busy || rawPrices.size > 0; });
  $('save-product').disabled = busy || uploadingPhoto;
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll('input,select,textarea,button').forEach((element) => { element.disabled = value; });
  $('editor').setAttribute('aria-busy', String(value));
  updateStatus();
}

function populateCategories() {
  const categories = sortedCategories(menu);
  for (const id of ['category-filter', 'bulk-category']) {
    const select = $(id);
    const selection = select.value;
    select.replaceChildren(new Option('Tüm kategoriler', ''));
    categories.forEach((category) => select.append(new Option(category, category)));
    if (categories.includes(selection)) select.value = selection;
  }
  $('category-options').replaceChildren(...categories.map((category) => new Option(category, category)));
}

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderEditor() {
  if (!menu) return;
  const query = normalizeSearch($('search').value);
  const filter = $('category-filter').value;
  const fragment = document.createDocumentFragment();
  let visible = 0;
  let total = 0;
  for (const category of sortedCategories(menu)) {
    menu[category].forEach((product, index) => {
      total += 1;
      if ((filter && filter !== category) || (query && !normalizeSearch(`${product.isim} ${product.aciklama} ${category}`).includes(query))) return;
      visible += 1;
      const row = make('article', 'editor-row');
      row.classList.toggle('is-hidden', product.aktif === false);
      row.classList.toggle('is-changed', !same(product, baseline?.[category]?.[index]));
      const photo = make('img', 'editor-thumb');
      photo.src = imageSource(product.resim);
      photo.alt = '';
      photo.loading = 'lazy';
      photo.addEventListener('error', () => { photo.src = safeImage(''); }, { once: true });
      row.append(photo);
      const description = make('div');
      description.append(make('h3', 'editor-product-name', product.isim), make('p', 'editor-meta', category));
      if (product.aktif === false) description.append(make('span', 'editor-meta', 'Menüde gizli'));
      const edit = make('button', 'text-button', 'Fotoğraf ve detayları düzenle');
      edit.type = 'button';
      edit.setAttribute('aria-label', `${product.isim} düzenle`);
      edit.addEventListener('click', () => openProduct(category, index));
      description.append(edit);
      row.append(description);
      const priceLabel = make('label', 'price-field');
      const labelText = make('span', 'sr-only', `${product.isim} fiyatı (TL)`);
      const input = make('input', 'text-input');
      input.type = 'text';
      input.inputMode = 'decimal';
      const key = JSON.stringify([category, index]);
      input.value = rawPrices.get(key) ?? formatAmount(parsePrice(product.fiyat));
      input.setAttribute('aria-label', `${product.isim} fiyatı (TL)`);
      if (rawPrices.has(key)) { input.setCustomValidity('0 ile 1.000.000 TL arasında geçerli bir fiyat yazın.'); input.setAttribute('aria-invalid', 'true'); }
      input.addEventListener('input', () => {
        const value = parsePrice(input.value);
        const valid = Number.isFinite(value);
        input.setCustomValidity(valid ? '' : '0 ile 1.000.000 TL arasında geçerli bir fiyat yazın.');
        input.setAttribute('aria-invalid', String(!valid));
        if (!valid) rawPrices.set(key, input.value); else rawPrices.delete(key);
        if (valid) {
          if (value !== parsePrice(product.fiyat)) product.fiyat = priceString(value);
          row.classList.toggle('is-changed', !same(product, baseline?.[category]?.[index]));
          persistDraft();
        } else persistDraft();
      });
      input.addEventListener('change', () => { if (!input.checkValidity()) input.reportValidity(); });
      priceLabel.append(labelText, input, make('span', '', 'TL'));
      row.append(priceLabel);
      const activeLabel = make('label', 'toggle-label');
      const active = make('input');
      active.type = 'checkbox';
      active.checked = product.aktif !== false;
      active.setAttribute('aria-label', `${product.isim} menüde göster`);
      active.addEventListener('change', () => {
        product.aktif = active.checked;
        persistDraft();
        renderEditor();
      });
      activeLabel.append(active, make('span', '', 'Göster'));
      row.append(activeLabel);
      fragment.append(row);
    });
  }
  if (!visible) fragment.append(make('p', 'muted', 'Bu aramaya uygun ürün bulunamadı.'));
  $('editor-list').replaceChildren(fragment);
  $('row-count').textContent = `${visible} / ${total} ürün · ${sortedCategories(menu).length} kategori`;
  updateStatus();
}

function renderAll() {
  populateCategories();
  renderEditor();
}

class GitHubError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

async function api(path, method = 'GET', body) {
  if (!token) throw new GitHubError('Kaydetmek için önce GitHub\'a bağlanın.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2026-03-10', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      await response.json().catch(() => ({}));
      if (response.status === 401) throw new GitHubError('GitHub erişim anahtarı geçersiz veya süresi dolmuş. Yeni bir anahtarla bağlanın.', 401);
      if (response.status === 403) {
        const rateLimited = response.headers.get('x-ratelimit-remaining') === '0';
        throw new GitHubError(rateLimited ? 'GitHub istek sınırına ulaşıldı. Bir süre sonra tekrar deneyin; taslağınız duruyor.' : 'GitHub bu işlemi reddetti. Anahtarın yalnızca qr_menu deposuna eriştiğini ve Contents: Read and write iznini kontrol edin. Depo kuralı da kaydetmeyi engelliyor olabilir.', 403);
      }
      if (response.status === 404) throw new GitHubError('GitHub deposu veya menu.json bulunamadı. Anahtarın qr_menu deposuna erişimini kontrol edin.', 404);
      if (response.status === 409 || response.status === 422) throw new GitHubError('GitHub\'da eşzamanlı bir değişiklik veya depo kuralı var. Son menüyü kontrol edin; taslağınız korundu.', response.status);
      throw new GitHubError(`GitHub işlemi tamamlanamadı (${response.status}). Taslağınız korundu.`, response.status);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof GitHubError) throw error;
    throw new GitHubError('GitHub bağlantısı kesildi veya yanıt zaman aşımına uğradı. İnternet bağlantınızı kontrol edin; taslağınız korundu.');
  } finally { clearTimeout(timeout); }
}

function decodeContent(content) {
  const binary = atob(content.replace(/\s/g, ''));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

async function readRemote() {
  const ref = await api(`/git/ref/heads/${encodeURIComponent(BRANCH)}`);
  const head = ref.object.sha;
  const commit = await api(`/git/commits/${head}`);
  const file = await api(`/contents/menu.json?ref=${encodeURIComponent(head)}`);
  if (file.encoding !== 'base64' || typeof file.content !== 'string') throw new GitHubError('GitHub menü dosyası okunamadı; mevcut taslağınız korundu.');
  const data = JSON.parse(decodeContent(file.content));
  validateMenu(data);
  return { data, sha: file.sha, head, tree: commit.tree.sha };
}

function matchesBaseline(remote) {
  return baselineSha ? baselineSha === remote.sha : same(baseline, remote.data);
}

function matchesPublishReceipt(remote) {
  return pendingPublish && remote.sha === pendingPublish.menuSha && same(menu, pendingPublish.menu);
}

function adoptRemote(remote) {
  menu = clone(remote.data);
  baseline = clone(remote.data);
  baselineSha = remote.sha;
  githubCheckedAt = Date.now();
  images = {};
  pendingPublish = null;
  rawPrices.clear();
  persistDraft();
  renderAll();
}

async function connect(event) {
  event.preventDefault();
  if (busy) return;
  const entered = $('github-token').value.trim();
  $('github-token').value = '';
  if (!entered) return;
  token = entered;
  setBusy(true);
  notice('GitHub\'daki son menü kontrol ediliyor…');
  try {
    const remote = await readRemote();
    if (matchesPublishReceipt(remote)) {
      completePublish(clone(menu), remote.sha);
    } else if (isDirty() && !matchesBaseline(remote)) {
      notice('GitHub\'daki menü, taslağınızın başlangıcından sonra değişmiş. Taslağınız korundu. Önce JSON yedeğini indirin, ardından “GitHub\'daki son menüyü al” ile son sürümü yükleyin ve değişikliklerinizi yeniden uygulayın.', true);
    } else if (isDirty()) {
      baselineSha = remote.sha;
      githubCheckedAt = Date.now();
      persistDraft();
      notice('GitHub bağlantısı hazır. Mevcut taslağınızı önizleyip kaydedebilirsiniz.');
    } else {
      adoptRemote(remote);
      notice('GitHub bağlantısı hazır. Depodaki son menü yüklendi.');
    }
  } catch (error) { token = ''; notice(error.message, true); }
  finally { setBusy(false); }
}

async function reloadRemote() {
  if (busy || !token) return;
  if ((isDirty() || rawPrices.size) && !confirm('Kaydedilmemiş düzenlemeler ve yeni fotoğraflar silinip GitHub\'daki son menü yüklenecek. Devam edilsin mi? Önce JSON yedeğini indirebilirsiniz.')) return;
  setBusy(true);
  try { adoptRemote(await readRemote()); notice('GitHub\'daki son menü yüklendi.'); }
  catch (error) { handleError(error); }
  finally { setBusy(false); }
}

function handleError(error) {
  if (error.status === 401) token = '';
  notice(error.message || 'İşlem tamamlanamadı. Taslağınız korundu.', true);
}

async function publish() {
  if (busy || !token || !isDirty() || rawPrices.size || missingPhotos().length) return;
  validateMenu(menu);
  const snapshot = clone(menu);
  const pendingImages = clone(images);
  setBusy(true);
  let newCommit = null;
  let menuBlob = null;
  try {
    notice('GitHub\'daki son sürüm kontrol ediliyor…');
    const remote = await readRemote();
    if (matchesPublishReceipt(remote)) { completePublish(snapshot, remote.sha); return; }
    if (!matchesBaseline(remote)) throw new GitHubError('GitHub\'daki menü başka bir işlemle değişmiş. Üzerine yazılmadı; taslağınız korundu. JSON yedeği alıp GitHub\'daki son menüyü yükleyin.');
    const treeEntries = [];
    const entries = Object.entries(pendingImages);
    for (let index = 0; index < entries.length; index += 1) {
      const [path, photo] = entries[index];
      notice(`Fotoğraflar hazırlanıyor (${index + 1}/${entries.length})…`);
      const blob = await api('/git/blobs', 'POST', { content: photo.dataURL.split(',')[1], encoding: 'base64' });
      treeEntries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    menuBlob = await api('/git/blobs', 'POST', { content: `${JSON.stringify(snapshot, null, 2)}\n`, encoding: 'utf-8' });
    treeEntries.push({ path: 'menu.json', mode: '100644', type: 'blob', sha: menuBlob.sha });
    const tree = await api('/git/trees', 'POST', { base_tree: remote.tree, tree: treeEntries });
    newCommit = await api('/git/commits', 'POST', { message: 'Menü yönetimi: ürün, fiyat ve fotoğraf güncellemesi', tree: tree.sha, parents: [remote.head] });
    pendingPublish = { commitSha: newCommit.sha, menuSha: menuBlob.sha, menu: snapshot };
    persistDraft();
    notice('Menü ve fotoğraflar GitHub\'a birlikte kaydediliyor…');
    try {
      await api(`/git/refs/heads/${encodeURIComponent(BRANCH)}`, 'PATCH', { sha: newCommit.sha, force: false });
    } catch (error) {
      // A lost response is ambiguous: the ref may already have advanced on GitHub.
      if (error.status !== 0) throw error;
      try {
        const current = await readRemote();
        if (current.sha !== menuBlob.sha) throw error;
      } catch {
        throw new GitHubError('Kaydetme yanıtı alınamadı; GitHub\'daki sonucu doğrulayamadık. Taslağınız duruyor. Bağlantı düzeldiğinde tekrar kaydetmek sonucu kontrol eder veya “GitHub\'daki son menüyü al” ile kontrol edebilirsiniz.');
      }
    }
    completePublish(snapshot, menuBlob.sha);
  } catch (error) {
    // A retry after an ambiguous successful ref update should recover without a conflict.
    if (newCommit && error.status === 0) {
      try {
        const remote = await readRemote();
        if (remote.sha === menuBlob.sha) { completePublish(snapshot, menuBlob.sha); return; }
      } catch { /* Keep a recoverable draft if verification also fails. */ }
    }
    handleError(error);
  } finally { setBusy(false); }
}

function completePublish(snapshot, sha) {
  menu = snapshot;
  baseline = clone(snapshot);
  baselineSha = sha;
  githubCheckedAt = Date.now();
  images = {};
  pendingPublish = null;
  persistDraft();
  renderAll();
  notice('Menü ve fotoğraflar GitHub\'a kaydedildi. GitHub Pages yayınının güncellenmesi birkaç dakika sürebilir.');
}

function openProduct(category, index) {
  if (busy || !menu || rawPrices.size) return;
  const product = category !== undefined ? menu[category][index] : { isim: '', aciklama: '', fiyat: '0 TL', resim: '' };
  modalItem = category !== undefined ? { category, index, original: clone(product) } : { original: clone(product) };
  modalPhoto = null;
  uploadGeneration += 1;
  uploadingPhoto = false;
  $('product-dialog-title').textContent = category !== undefined ? 'Ürünü düzenle' : 'Yeni ürün ekle';
  $('save-product').textContent = category !== undefined ? 'Değişiklikleri uygula' : 'Ürünü ekle';
  $('product-name').value = product.isim;
  $('product-category').value = category ?? $('category-filter').value ?? '';
  $('product-description').value = product.aciklama;
  $('product-price').value = formatAmount(parsePrice(product.fiyat));
  $('product-active').checked = product.aktif !== false;
  $('product-image').value = product.resim || '';
  $('photo-file').value = '';
  $('photo-status').textContent = '';
  $('product-error').hidden = true;
  updatePhotoPreview();
  updateStatus();
  $('product-dialog').showModal();
  $('product-name').focus();
}

function closeProduct() {
  uploadGeneration += 1;
  uploadingPhoto = false;
  modalPhoto = null;
  modalItem = null;
  $('product-dialog').close();
  updateStatus();
}

function updatePhotoPreview() {
  const path = $('product-image').value.trim();
  const photo = $('product-photo');
  photo.hidden = !path;
  photo.src = modalPhoto?.path === path ? modalPhoto.dataURL : imageSource(path);
}

async function resizePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG veya WebP türünde bir fotoğraf seçin.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Fotoğraf 15 MB sınırını aşıyor. Daha küçük bir dosya seçin.');
  if (!file.size) throw new Error('Fotoğraf dosyası boş. Başka bir dosya seçin.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Bu fotoğraf açılamadı. Farklı bir JPG, PNG veya WebP deneyin.')); image.src = url; });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Fotoğraf boyutları okunamadı.');
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Tarayıcınız fotoğraf hazırlamayı desteklemiyor.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally { URL.revokeObjectURL(url); }
}

async function uploadPhoto(event) {
  const file = event.target.files?.[0];
  if (!file || !modalItem) return;
  const generation = ++uploadGeneration;
  uploadingPhoto = true;
  updateStatus();
  $('photo-status').textContent = 'Fotoğraf hazırlanıyor…';
  try {
    const dataURL = await resizePhoto(file);
    if (generation !== uploadGeneration || !modalItem) return;
    const id = crypto.randomUUID();
    modalPhoto = { path: `images/upload-${id}.jpg`, dataURL };
    $('product-image').value = modalPhoto.path;
    $('photo-status').textContent = `Fotoğraf hazır (${Math.ceil(dataURL.split(',')[1].length * 0.75 / 1024)} KB). Ürünü kaydettiğinizde taslağa eklenir.`;
    updatePhotoPreview();
  } catch (error) {
    if (generation === uploadGeneration) $('photo-status').textContent = error.message;
  } finally {
    if (generation === uploadGeneration) { uploadingPhoto = false; updateStatus(); }
  }
}

function saveProduct(event) {
  event.preventDefault();
  if (busy || uploadingPhoto || !modalItem || rawPrices.size) return;
  try {
    const name = $('product-name').value.trim();
    const category = $('product-category').value.trim();
    const price = parsePrice($('product-price').value);
    const image = $('product-image').value.trim();
    if (!name || !category) throw new Error('Ürün adını ve kategorisini yazın.');
    if (['__proto__', 'constructor', 'prototype'].includes(category)) throw new Error('Bu kategori adını kullanamazsınız.');
    if (!Number.isFinite(price)) throw new Error('0 ile 1.000.000 TL arasında geçerli bir fiyat yazın.');
    if (image && safeImage(image) === safeImage('')) throw new Error('Fotoğraf için images/ ile başlayan bir dosya yolu veya https:// adresi kullanın.');
    const original = modalItem.original;
    const description = $('product-description').value;
    const updated = { ...original, isim: name === original.isim ? original.isim : name, aciklama: description === original.aciklama ? original.aciklama : description.trim(), fiyat: price === parsePrice(original.fiyat) ? original.fiyat : priceString(price), resim: image };
    if ($('product-active').checked) { if ('aktif' in updated) updated.aktif = true; } else updated.aktif = false;
    const next = clone(menu);
    if (modalItem.category !== undefined) {
      if (category === modalItem.category) next[category][modalItem.index] = updated;
      else {
        next[modalItem.category].splice(modalItem.index, 1);
        if (!next[modalItem.category].length) delete next[modalItem.category];
        if (!Object.hasOwn(next, category)) next[category] = [];
        next[category].push(updated);
      }
    } else {
      if (!Object.hasOwn(next, category)) next[category] = [];
      next[category].push(updated);
    }
    validateMenu(next);
    menu = next;
    if (modalPhoto?.path === image) images[image] = { dataURL: modalPhoto.dataURL };
    closeProduct();
    persistDraft();
    renderAll();
    if (!storageFailed) notice('Ürün taslağa eklendi. Önizleyip GitHub\'a kaydedebilirsiniz.');
  } catch (error) { $('product-error').textContent = error.message; $('product-error').hidden = false; }
}

function bulkUpdate(event) {
  event.preventDefault();
  if (busy || !menu || rawPrices.size) return;
  const raw = $('bulk-value').value.trim().replace(',', '.');
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(raw)) { notice('Toplu işlem için geçerli bir sayı girin. Örnek: 10, 2,50 veya -10.', true); return; }
  const value = Number(raw);
  const mode = $('bulk-mode').value;
  const category = $('bulk-category').value;
  const next = clone(menu);
  let count = 0;
  for (const name of Object.keys(next)) {
    if (category && name !== category) continue;
    for (const product of next[name]) {
      const current = parsePrice(product.fiyat);
      const updated = Math.round((mode === 'percent' ? current * (1 + value / 100) : mode === 'amount' ? current + value : value) * 100) / 100;
      if (updated < 0 || updated > 1000000 || !Number.isFinite(updated)) { notice('İşlem bazı fiyatları geçerli aralığın dışına çıkarıyor. Hiçbir fiyat değiştirilmedi.', true); return; }
      if (updated !== current) product.fiyat = priceString(updated);
      count += 1;
    }
  }
  const operation = mode === 'percent' ? `%${value}` : mode === 'amount' ? `${value} TL fark` : `${formatAmount(value)} TL`;
  if (!confirm(`${category || 'Tüm kategoriler'} içinde ${count} ürünün fiyatı ${operation} ile güncellenecek. Taslağa uygulansın mı?`)) return;
  validateMenu(next);
  menu = next;
  persistDraft();
  renderEditor();
  if (!storageFailed) notice(`${count} ürünün fiyatı taslakta güncellendi. GitHub\'a kaydedene kadar yayındaki fiyatlar değişmez.`);
}

function preview() {
  if (busy || !menu || rawPrices.size || missingPhotos().length) return;
  try {
    sessionStorage.setItem(PREVIEW_KEY, JSON.stringify({ menu, images: Object.fromEntries(Object.entries(images).map(([path, image]) => [path, image.dataURL])) }));
    $('preview-frame').src = `index.html?preview=1&t=${Date.now()}`;
    $('preview-dialog').showModal();
  } catch { notice('Önizleme için tarayıcı depolama alanı kullanılamadı. Daha küçük fotoğraflar deneyin veya JSON yedeğini indirin.', true); }
}

function downloadBackup() {
  if (!menu) return;
  // A draft with new photos includes their content, so the backup does not lose them.
  const hasPhotos = Object.keys(images).length > 0;
  const backup = hasPhotos ? { format: 'qr-menu-draft-backup', version: 1, menu, pendingImages: images, baseline, baselineSha } : menu;
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = hasPhotos ? 'qr-menu-fotografli-taslak-yedegi.json' : 'menu-yedek.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice(hasPhotos ? 'JSON yedeği indirildi. Bu dosya menüyü ve yeni fotoğrafların verisini birlikte içerir; doğrudan menu.json yerine kullanmayın.' : 'Menü JSON yedeği indirildi.');
}

function resetDraft() {
  if (busy || (!isDirty() && !rawPrices.size) || !confirm('Kaydedilmemiş düzenlemeler ve yeni fotoğraflar silinsin mi? Son yüklenen menüye dönülecek.')) return;
  menu = clone(baseline);
  images = {};
  pendingPublish = null;
  rawPrices.clear();
  persistDraft();
  renderAll();
  notice('Taslak, son yüklenen menüye döndürüldü.');
}

async function init() {
  setBusy(true);
  let recovered = false;
  try {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { /* Storage may be blocked; the live menu remains usable. */ }
    if (saved?.version === 1 && saved.menu && saved.baseline) {
      try {
        validateMenu(saved.menu);
        validateMenu(saved.baseline);
        const restoredMenu = clone(saved.menu);
        const restoredBaseline = clone(saved.baseline);
        const restoredPrices = new Map();
        const restoredImages = {};
        let restoredReceipt = null;
        for (const [key, value] of Object.entries(saved.rawPrices || {})) {
          let position;
          try { position = JSON.parse(key); } catch { continue; }
          if (Array.isArray(position) && typeof position[0] === 'string' && Number.isInteger(position[1]) && restoredMenu[position[0]]?.[position[1]] && typeof value === 'string' && value.length < 100 && !Number.isFinite(parsePrice(value))) restoredPrices.set(key, value);
        }
        if (saved.pendingPublish && /^[a-f0-9]{40}$/.test(saved.pendingPublish.commitSha) && /^[a-f0-9]{40}$/.test(saved.pendingPublish.menuSha)) {
          validateMenu(saved.pendingPublish.menu);
          restoredReceipt = clone(saved.pendingPublish);
        }
        for (const [path, image] of Object.entries(saved.images || {})) {
          if (/^images\/upload-[a-f0-9-]+\.jpg$/.test(path) && typeof image?.dataURL === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image.dataURL)) restoredImages[path] = { dataURL: image.dataURL };
        }
        // Adopt validated parts together; malformed cached data cannot poison the live baseline.
        menu = restoredMenu;
        baseline = restoredBaseline;
        baselineSha = typeof saved.baselineSha === 'string' ? saved.baselineSha : null;
        githubCheckedAt = Number.isFinite(saved.githubCheckedAt) ? saved.githubCheckedAt : 0;
        images = restoredImages;
        pendingPublish = restoredReceipt;
        for (const [key, value] of restoredPrices) rawPrices.set(key, value);
        recovered = true;
      } catch { notice('Kayıtlı taslak okunamadı. Yayındaki menü yükleniyor.', true); }
    }
    if (!recovered || (!isDirty() && !rawPrices.size && !pendingPublish)) {
      try {
        const response = await fetch(`${MENU_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Menü dosyası yüklenemedi. Sayfayı yenileyin veya GitHub\'a bağlanın.');
        const data = await response.json();
        validateMenu(data);
        const recentlyChecked = recovered && baselineSha && Date.now() - githubCheckedAt < 10 * 60 * 1000;
        if (recentlyChecked && !same(menu, data)) {
          notice('GitHub\'dan son alınan menü gösteriliyor. Yayındaki Pages sürümü farklı; yayın henüz güncellenmemiş olabilir. GitHub\'a bağlanarak depodaki son sürümü doğrulayın.');
        } else {
          const changed = recovered && !same(menu, data);
          menu = clone(data);
          baseline = clone(data);
          baselineSha = null;
          githubCheckedAt = 0;
          images = {};
          pendingPublish = null;
          if (changed) notice('Yayındaki menü yeniden yüklendi. GitHub\'a bağlanınca depodaki son sürüm de kontrol edilir.');
        }
      } catch (error) {
        if (!recovered) throw error;
        notice('Yayındaki menüye ulaşılamadı. Bu tarayıcıda saklanan son menü gösteriliyor; bağlantınız düzelince GitHub\'a bağlanıp son sürümü kontrol edin.', true);
      }
    }
    renderAll();
    if (missingPhotos().length) notice('Taslağın bazı fotoğraf verileri eksik. Ürünleri düzenleyip fotoğrafları yeniden yükleyin veya kaldırın. Eksik fotoğrafla önizleme ve kaydetme engellenir.', true);
    else if (recovered && (isDirty() || rawPrices.size)) notice('Önceki taslağınız ve yeni fotoğraflarınız geri yüklendi. Kaydetmeden önce fiyatları kontrol edip GitHub\'a bağlanın.');
  } catch (error) { handleError(error); $('row-count').textContent = 'Menü yüklenemedi'; }
  finally { setBusy(false); }
}

$('connect-form').addEventListener('submit', connect);
$('disconnect-button').addEventListener('click', () => { if (busy) return; token = ''; $('github-token').value = ''; updateStatus(); notice('GitHub bağlantısı kesildi. Taslağınız bu tarayıcıda duruyor.'); });
$('search').addEventListener('input', renderEditor);
$('category-filter').addEventListener('change', renderEditor);
$('reload-button').addEventListener('click', reloadRemote);
$('reset-button').addEventListener('click', resetDraft);
$('download-button').addEventListener('click', downloadBackup);
$('publish-button').addEventListener('click', publish);
$('preview-button').addEventListener('click', preview);
$('close-preview').addEventListener('click', () => $('preview-dialog').close());
$('preview-dialog').addEventListener('close', () => { $('preview-frame').src = 'about:blank'; try { sessionStorage.removeItem(PREVIEW_KEY); } catch { /* No credential is stored. */ } });
$('add-product').addEventListener('click', () => openProduct());
$('close-product').addEventListener('click', closeProduct);
$('cancel-product').addEventListener('click', closeProduct);
$('product-dialog').addEventListener('cancel', (event) => { event.preventDefault(); closeProduct(); });
$('product-form').addEventListener('submit', saveProduct);
$('photo-file').addEventListener('change', uploadPhoto);
$('product-image').addEventListener('input', () => { uploadGeneration += 1; uploadingPhoto = false; updatePhotoPreview(); updateStatus(); });
$('remove-photo').addEventListener('click', () => { uploadGeneration += 1; uploadingPhoto = false; modalPhoto = null; $('product-image').value = ''; $('photo-file').value = ''; $('photo-status').textContent = 'Fotoğraf kaldırıldı. Değişikliği taslağa uygulayabilirsiniz.'; updatePhotoPreview(); updateStatus(); });
$('bulk-form').addEventListener('submit', bulkUpdate);
window.addEventListener('beforeunload', (event) => { if (busy || (storageFailed && isDirty())) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', () => { token = ''; });
window.addEventListener('pageshow', updateStatus);
init();
