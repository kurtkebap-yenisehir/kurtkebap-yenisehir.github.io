# Kurt Kebap Yenişehir — QR Menü

Müşteri adresi: https://kurtkebap-yenisehir.github.io/

Yönetim paneli: https://kurtkebap-yenisehir.github.io/admin.html

Bu depo işletme adresindeki tasarımı yayınlar. Güncel ürünler, fiyatlar ve yüklenen fotoğraflar `emrekrt221-ship-it/qr_menu` deposunda tutulur; müşteri menüsü onları doğrudan mevcut GitHub Pages yayınından okur. Böylece mevcut erişim anahtarı ve eski yönetim paneli kullanılmaya devam eder. Bu depodaki `menu.json` ve `images/` dosyaları ilk kurulum kopyasıdır; fiyat ve fotoğraf değişikliklerini yönetim panelinden yapın. Veri adresi `assets/shared.js` içindeki `DATA_BASE_URL` ile tanımlanır.

Eski müşteri adresi yeni işletme adresine yönlendirilir. Eski yönetim panelindeki taslak önizleme çalışmaya devam eder. Bu depoda GitHub Pages kaynağı **main → /(root)** olmalıdır.

Telefonda ve bilgisayarda çalışan kategori filtreli, aranabilir bir menü ve GitHub üzerinden ürün yönetimi. Mevcut `menu.json` ürünleri ve `images/` fotoğrafları korunur. Menü ve fiyat yönetimi için sunucu veya veritabanı gerekmez; ziyaret istatistikleri ayrı Supabase servisiyle çalışır.

- Müşteri menüsü: `index.html`
- İşletme yönetimi: `admin.html`
- Ürünler: `menu.json`

## Günlük kullanım

1. Yayındaki adresin sonuna `/admin.html` ekleyin.
2. Ürün satırına doğrudan yeni fiyatı yazın. Türkçe ondalık sayı kabul edilir: `250` veya `250,50`. Kategori ve aramayla ürünü bulun.
3. “Fotoğraf ve detayları düzenle” ile ürün adını, açıklamayı, kategoriyi veya fotoğrafı değiştirin. “Yeni ürün” ile mevcut veya yeni kategoriye ürün ekleyin.
4. “Göster” seçimini kaldırınca ürün müşteri menüsünde gizlenir. Ürün yönetim panelinde kalır.
5. “Toplu fiyat güncelle” ile tüm ürünlere veya bir kategoriye yüzde/TL farkı uygulayın ya da aynı fiyatı atayın. Eksi değer indirimdir. İşlem, gizli ürünleri de kapsar ve uygulanmadan önce onay ister.
6. “Önizle” taslağı müşteri görünümünde açar.
7. GitHub'a bağlanıp “GitHub'a kaydet” düğmesine basın. Menü ve yeni fotoğraflar aynı Git commit içinde kaydedilir. GitHub Pages yayınının güncellenmesi birkaç dakika sürebilir.

## GitHub erişim anahtarı

Yönetim ekranı statik bir sayfadır; GitHub'a kaydetme yetkisi erişim anahtarıyla sağlanır. Sayfaya erişen bir kişi kendi tarayıcısında taslak hazırlayabilir, ancak depoya yazma yetkisi olmadan yayını değiştiremez.

1. [GitHub fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) oluşturun.
2. Resource owner olarak `emrekrt221-ship-it` seçin.
3. Repository access alanında **Only select repositories → qr_menu** seçin.
4. Repository permissions altında yalnızca **Contents → Read and write** verin; varsayılan Metadata izni GitHub tarafından eklenir.
5. Kısa bir son kullanma süresi belirleyin. Anahtarı oluşturup yönetim sayfasındaki parola alanına yapıştırın.

Anahtar tarayıcının yerel veya oturum depolamasına yazılmaz; yalnızca açık sekmenin belleğinde tutulur. Bağlantı kurulduğunda giriş alanı temizlenir. Sayfadan ayrılınca yeniden bağlanmak gerekir. Anahtarı `menu.json`, JavaScript dosyaları, Git commit veya sohbet mesajına koymayın. Depo kuralları doğrudan `main` güncellemesini engelliyorsa yönetim sayfası bunu bildirecektir.

API işlemleri [GitHub Git database](https://docs.github.com/en/rest/git) uçlarıyla blob → tree → commit → ref sırasını kullanır. Son branch güncellemesi `force: false` ile yapılır. Menü başlangıç sürümüne göre değişmişse üzerine yazılmaz. İnternet kesintisi sırasında alınamayan kaydetme yanıtları menü SHA'sıyla tekrar doğrulanır; doğrulanamayan taslak sonraki bağlantıda yeniden kontrol edilir.

## Fotoğraflar ve taslaklar

- Telefon veya bilgisayardan **JPG, PNG veya WebP**, en fazla **15 MB**, seçilebilir. Fotoğraf en uzun kenarı 1600 piksel olacak şekilde küçültülüp JPEG olarak hazırlanır. Saydam alanlar beyaz zemine çevrilir.
- Yeni fotoğraflar benzersiz `images/upload-….jpg` adıyla yüklenir. Orijinal fotoğraflar silinmez veya üzerine yazılmaz. Kullanılmayan eski yüklemeler depoda kalabilir.
- Alternatif olarak mevcut bir `images/fotograf.jpg` yolu veya HTTPS fotoğraf adresi girilebilir. Dış fotoğraf adresleri, sağlayıcının erişimine bağlıdır.
- Taslak, başlangıç menüsü ve henüz yüklenmemiş fotoğraflar aynı tarayıcıda yerel olarak saklanır. Başka bir telefon veya tarayıcı taslağı otomatik görmez.
- Çok sayıda fotoğraf tarayıcının depolama kotasını doldurabilir. Ekran bu durumu bildirir. Sekmeyi kapatmadan kaydedin veya JSON yedeğini indirin; daha küçük fotoğraflar kullanın.
- Geçersiz fiyatlar taslakta korunur ve önizleme/kaydetme düzeltme yapılana kadar engellenir. Eksik fotoğraf verisi varsa ilgili fotoğrafı yeniden seçin veya kaldırın.
- “JSON yedeğini indir”, fotoğraf eklenmemiş taslakta normal menü JSON'u indirir. Henüz yüklenmemiş fotoğraflar varsa `menu`, `pendingImages` ve başlangıç bilgilerini içeren fotoğraflı bir yedek indirir. Fotoğraflı yedek dosyası doğrudan `menu.json` yerine kullanılmaz; yeni fotoğrafların verisini koruyan bir kurtarma dosyasıdır.
- “Taslağı sıfırla” son yüklenen başlangıç menüsüne döner. “GitHub'daki son menüyü al” depodaki güncel sürümü yükler. Kaydedilmemiş çalışmalar varsa iki işlem de silmeden önce onay ister.

## Yayınlama

GitHub Pages ayarlarında **Deploy from a branch → main → /(root)** kullanılır. `assets/shared.js` içindeki `BRANCH` ve `REPOSITORY` yönetim panelinin yazdığı merkezi veri deposunu belirtir; işletme adresine geçişte mevcut anahtarı korumak için değiştirilmez. Eski QR kod müşteri menüsünün önceki adresine yöneliyorsa yönlendirme sayesinde yeniden basılması gerekmez. Yeni QR kod için `https://kurtkebap-yenisehir.github.io/` kullanılır.

Ürün yönetimi yalnızca menü verisi ve yeni fotoğrafları yazar; tasarım kodunu değiştirmez. Yönetim ekranındaki başarı mesajı GitHub commit kaydını doğrular, Pages dağıtımının bittiğini doğrulamaz.

## Ziyaret ve buton istatistikleri

Yönetim ekranındaki **İstatistikler** bağlantısı `istatistikler.html` bölümünü açar. Bu bölüm işletme için tanımlanan Supabase uygulama kullanıcısının e-posta ve şifresiyle çalışır. Supabase hesabına giriş ile istatistik uygulamasına giriş ayrı hesaplardır. GitHub erişim anahtarı fiyat ve fotoğraf yayını içindir; istatistik servisine gönderilmez.

Bugün, son 7 gün ve son 30 gün için tekil tarayıcılar, ziyaret oturumları, sayfa görüntülenmeleri ve buton etkileşimleri gösterilir. Menü, sipariş seçenekleri, üç sipariş platformu, Google yorum, Instagram ve telefon ayrı ölçülür. Tekil tarayıcılar kesin kişi sayısı değildir; sipariş bağlantısına tıklama tamamlanan sipariş sayısı değildir.

Supabase projesini bağlamak için [kurulum rehberini](docs/SUPABASE-KURULUM.md) izleyin. `assets/analytics-config.js` içindeki Project URL ve publishable/anon anahtarı boşken ölçüm tamamen pasiftir. Servis ve yönetici hesabı kurulmadan bu alanları etkinleştirmeyin. Secret/service_role anahtarı site dosyalarına konmaz.

Müşteri sayfalarında yalnızca istatistik izni verildikten sonra rastgele tarayıcı kimliği oluşturulur ve kayıt gönderilir. İzin geri alınabilir; önizleme, yerel geliştirme ve tarayıcının izleme karşıtı tercihlerinde ölçüm yapılmaz. Rapor oturumu yalnızca açık sekmenin belleğinde tutulur. Yeni fonksiyon rapor erişimini Supabase oturumu ve işletmeci listesiyle doğrular.

Yeni istatistik kodunun kısa kontrolleri: `npm run test:analytics`. Mevcut menü ve fiyat testleri ayrıca çalıştırılabilir.

## Yerel önizleme

Node.js kuruluysa depo klasöründe:

```powershell
npm install
npm run dev
```

Ardından `http://127.0.0.1:4173/` ve `http://127.0.0.1:4173/admin.html` adreslerini açın. JavaScript modülleri ve `fetch` nedeniyle dosyaları doğrudan `file://` üzerinden çalıştırmayın. Yayınlama için GitHub bağlantısı gerekir.

## Doğrulama

```powershell
npm test
npx playwright install chromium
npm run test:browser
```

Birim testleri fiyat biçimleri, Türkçe arama, görsel yolları ve mevcut 47 ürünü doğrular. Tarayıcı testleri müşteri menüsü, mobil yerleşim, fotoğraf yükleme, taslak kurtarma, fiyat doğrulama ve eşzamanlı GitHub değişikliklerini kontrol eder. Testlerde GitHub istekleri taklit edilir; gerçek depoya test verisi yazılmaz.
