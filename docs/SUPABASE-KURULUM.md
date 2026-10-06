# İstatistikleri Supabase'e bağlama

Bu kurulum yalnızca ziyaret ve buton ölçümleri içindir. Fiyatlar ve ürün fotoğrafları mevcut GitHub sistemiyle kaydedilmeye devam eder. İstatistik ekranına işletmenin Supabase e-posta/şifre hesabıyla girilir; GitHub erişim anahtarı bu servise gönderilmez.

İşletme projesi `loopwgeevnowvycojcss` kimliğiyle oluşturuldu. Aşağıdaki servis, işletmeci hesabı ve site bağlantıları tamamlandıktan sonra veriler birikir. Önceki ziyaretler geriye dönük hesaplanamaz.

## 1. İşletme projesini açın

[Supabase Dashboard](https://supabase.com/dashboard) üzerinden **New project** seçin. Proje adı olarak `kurt-kebap-istatistik` kullanılabilir. Size uygun planı ve yakın bir bölgeyi seçin; veritabanı şifresini parola yöneticinizde saklayın. Şifreyi, servis anahtarını veya Supabase hesap parolanızı sohbete göndermeyin.

Proje hazır olunca iki açık yapılandırma bilgisini alın:

- **Project URL:** `https://PROJE_KIMLIGI.supabase.co`
- **Publishable key:** `sb_publishable_...` (ya da **Legacy anon key**)

Project URL ve publishable/anon anahtarı tarayıcıda kullanılabilir; paylaşılması gereken bilgiler bunlardır. **Secret key / service_role** anahtarı tarayıcıya, GitHub dosyasına veya sohbete konulmaz. [API anahtarları rehberi](https://supabase.com/docs/guides/api/api-keys)

## 2. Tabloları kurun

Projenin **SQL Editor** bölümünde yeni sorgu açın. Depodaki `supabase/migrations/202610060001_menu_analytics.sql` dosyasının **tamamını** yapıştırıp çalıştırın.

Dosya tekrar çalıştırılabilir; mevcut ziyaretleri veya yönetici listesini sıfırlamaz. Tablolar `private` şemasında, RLS açık olarak oluşturulur. `private` şemasını Data API'nin açık şemaları arasına eklemeyin. Müşteri tarayıcısı tabloları doğrudan okuyamaz veya değiştiremez.

## 3. Yalnızca işletme yöneticisini ekleyin

Supabase hesap girişiniz ile bu projenin uygulama kullanıcıları ayrıdır:

1. Projede **Authentication → Users → Add user / Create user** üzerinden kullanacağınız e-posta ve özel bir şifreyle uygulama kullanıcısı oluşturun. Elle oluştururken hesabı doğrulayın (**Auto Confirm User**, sunuluyorsa).
2. Oluşan kullanıcının **User UID** bilgisini kopyalayın.
3. SQL Editor'da aşağıdaki sorguda yer tutucuyu bu UID ile değiştirip çalıştırın:

```sql
insert into private.admins(user_id)
values ('BURAYA_AUTH_USER_UID'::uuid)
on conflict (user_id) do nothing;
```

4. Authentication ayarlarında **Allow new users to sign up** seçeneğini kapatın. E-posta/şifre ile giriş sağlayıcısı açık kalsın. Panelde herkese açık kayıt ekranı bulunmaz.

İstatistikler yalnızca bu listede bulunan kullanıcıya açılır. Başka bir kullanıcı başarıyla giriş yapsa bile rapor alamaz. Yetkiyi kaldırmak için UID'yi kullanarak `private.admins` satırını silin. [Supabase kullanıcı yönetimi](https://supabase.com/docs/guides/auth/managing-user-data)

## 4. Veri servisini yayınlayın

Servisin adı **`menu-analytics`** olmalıdır. Kod dosyaları:

- `supabase/functions/menu-analytics/index.ts`
- `supabase/functions/menu-analytics/validation.mjs`
- `supabase/config.toml`

Yerel dosyalardan Supabase CLI ile yayınlama yolu, depo klasöründe:

```powershell
npx supabase@latest login
npx supabase@latest functions deploy menu-analytics --project-ref PROJE_KIMLIGI
```

`PROJE_KIMLIGI` yerine Dashboard proje adresinde veya Project URL'de görülen gerçek kimliği yazın. Giriş işleminde açılan tarayıcıyla kendi Supabase hesabınızı kullanın; erişim belirtecinizi paylaşmayın. [CLI ile yayınlama](https://supabase.com/docs/guides/functions/deploy)

CLI kullanmadan Dashboard **Edge Functions** editöründe aynı adla yeni servis açılabilir; `index.ts` ve onun yanına `validation.mjs` dosyası birlikte eklenmelidir. [Dashboard ile oluşturma](https://supabase.com/docs/guides/functions/quickstart-dashboard)

**Yalnızca bu yeni `menu-analytics` servisi** için **Verify JWT** kapalı olmalıdır; depodaki `supabase/config.toml` bunu belirtir. Bu ayar müşteri ziyaret kaydının giriş gerektirmemesi içindir. Rapor isteği fonksiyonun içinde `auth.getUser(access_token)` ile doğrulanır ve `private.admins` kontrolünden geçer. Mevcut başka fonksiyonların JWT ayarını değiştirmeyin. [Fonksiyon yapılandırması](https://supabase.com/docs/guides/functions/function-configuration), [getUser ile doğrulama](https://supabase.com/docs/reference/javascript/auth-getuser)

Supabase, `SUPABASE_URL` ve sunucu anahtarını Edge Function'a otomatik verir. Bunları site dosyasına yazmayın. İstenirse **Edge Functions → Secrets** bölümünde rastgele uzun bir **`ANALYTICS_RATE_SALT`** tanımlanabilir; yoksa sunucu anahtarı IP özetinin gizli anahtarı olarak kullanılır. [Sunucu ortam değişkenleri](https://supabase.com/docs/guides/functions/secrets)

## 5. Siteye açık bağlantı bilgilerini ekleyin

`assets/analytics-config.js` dosyasındaki açık bağlantı bilgilerini doldurun:

```js
export const ANALYTICS_CONFIG = {
  url: 'https://PROJE_KIMLIGI.supabase.co',
  publishableKey: 'sb_publishable_BURAYA_GERCEK_ACIK_ANAHTAR',
};
```

Gerçek Project URL ve publishable anahtarı (ya da legacy anon anahtarı) kullanılmalıdır. Alanlar boş kaldığında veri toplama başlamaz. E-posta, kullanıcı parolası, service_role anahtarı ve GitHub erişim anahtarı bu dosyaya yazılmaz.

Müşteri kayıt ve rapor uç adresi:

```text
https://PROJE_KIMLIGI.supabase.co/functions/v1/menu-analytics
```

Yayın sonrası ortak QR sayfasını açın, bir sipariş platformuna tıklayın ve yönetim panelinin **İstatistikler** bağlantısından `istatistikler.html` ekranında işletme hesabınızla giriş yapın. Bugün raporunda kaydı kontrol edin. Bu kontrol dışında canlı menüye test fiyatı/fotoğrafı yazmak gerekmez.

## Ne ölçülür?

- Sayfa görüntülenmesi, menü açma ve online sipariş seçeneklerini açma.
- Trendyol Go, Migros Yemek, Yemeksepeti, Google yorum, Instagram ve telefon tıklamaları.
- Bugün, son 7 gün ve son 30 gün; takvim günleri **Europe/Istanbul** saatine göre hesaplanır.
- Dönemdeki tekil ziyaretçi sayısı tüm dönemde benzersiz tarayıcı kimliklerinin sayısıdır; günlük tekil sayılar birbirine eklenmez.

Tarayıcı kimliği, gerçek kişi sayısı değildir. Aynı kişinin başka cihazı veya temizlenmiş tarayıcı verileri yeni ziyaretçi sayılabilir. Reklam/izleme engelleyicileri, bağlantı hataları ve müşterinin ölçümü kapatması eksik kayıt oluşturabilir. Bir sipariş platformuna geçiş siparişin tamamlandığını göstermez.

## Veri sınırları ve bakım

Ziyaret tablolarında yalnızca rastgele olay/ziyaretçi/oturum UUID'leri, sabit olay adı, üç izinli sayfa yolu ve **sunucunun kayıt zamanı** tutulur. Ad, e-posta, telefon, tam adres, sorgu parametresi, cihaz parmak izi veya referrer toplanmaz. Yönetici e-postası ayrı Supabase Auth hesabında bulunur.

Ham IP uygulama tablosuna veya kodun loglarına yazılmaz. Yoğun istekleri sınırlamak için günlük gizli HMAC IP özeti ayrı geçici tabloda, 10 dakikalık kova başına en fazla **300 olay** için kullanılır. Kovalar 20 dakika sonra geçersizleşir; silme en fazla saatte bir, ilk sonraki kayıt veya yetkili rapor isteğinde yapılır. Site kullanılmıyorsa fiziksel silme sonraki isteğe kalır. Ziyaret olayları da aynı bakım adımında 90 günden eskiyse silinir. Supabase'in kendi ağ/servis logları platformun ayarlarına tabidir.

Varsayılan izinli tarayıcı adresi yalnızca `https://kurtkebap-yenisehir.github.io` olur. Yerel kontrol gerekirse **sunucu ortamında** `ALLOWED_ORIGINS` örneğin aşağıdaki gibi açıkça ayarlanır; kontrol sonrasında kaldırılır:

```text
https://kurtkebap-yenisehir.github.io,http://127.0.0.1:4173
```

CORS tarayıcı sınırıdır; komut satırından sahte Origin gönderilmesini tek başına engellemez. Bu nedenle kayıt boyutu 2048 baytla, alanlar sabit listelerle ve veritabanı kayıtları kalıcı hız sınırıyla korunur. Çok büyük dış trafik için Supabase kota ve fonksiyon kullanımını izleyin.

## Geliştirici: kısa doğrulama ve API sözleşmesi

Yerel alan/boyut/CORS doğrulaması ayrı paket kurmadan çalışır:

```powershell
node --test supabase/functions/menu-analytics/validation.test.mjs
```

Kayıt, `POST` JSON gövdesiyle `action: 'collect'`, `event_id`, `visitor_id`, `session_id`, `event_name`, `page` alanlarını alır. Başarılı yanıt `{ "ok": true }` olur. Aynı `event_id` ikinci kez sayılmaz. Rapor `POST { "action": "report", "days": 1|7|30 }` ve **Authorization: Bearer kullanıcının Supabase access_token değeri** ile çağrılır.

Rapor yanıtı:

```json
{
  "summary": { "visitors": 0, "sessions": 0, "page_views": 0, "button_clicks": 0 },
  "daily": [{ "date": "YYYY-MM-DD", "visitors": 0, "page_views": 0 }],
  "events": [{ "event_name": "page_view", "count": 0 }],
  "pages": [{ "page": "/", "page_views": 0 }],
  "updated_at": "ISO-8601",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD"
}
```

Gerçek yanıt her izinli olay/sayfa için satır ve seçilen tüm günler için sıfır dahil günlük satır döndürür. Yanıtlar önbelleğe alınmaz. Geçersiz gövde **400**, büyük gövde **413**, oturum yok/geçersiz **401**, yetkisiz sahip **403**, kayıt hız sınırı **429**, yapılandırma veya veri servisi sorunu **503** döndürür. Tablolar ve `analytics_record` / `analytics_report` RPC'leri anonim veya giriş yapmış tarayıcıdan doğrudan erişilebilir değildir.
