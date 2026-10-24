# Tvijo DSHREM — bir görevden denetlenmiş sonuca

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo, paylaşılan bir geliştirme iş akışı etrafında bir tarayıcı çalışma alanını, bir VS Code eklentisini ve terminal araçlarını bir araya getirir. Görevi tanımlayın, çalıştırma ana bilgisayarını ve izinlerini seçin, değişiklikleri inceleyin ve sonucu kabul etmek için kullanılan kanıtları saklayın. Bu kılavuz ürünü tanıtır; CLI için deponun teknik README dosyası ve komut referansı yetkili kaynak olmaya devam eder.

## Tercih ettiğiniz çalışma alanıyla başlayın

[DSHREM](https://dsh.tvijo.com/) adresini açın, [VS Code eklentisi ve terminal talimatlarını](https://dsh.tvijo.com/download) alın veya [ayarların açıklamasını](https://dsh.tvijo.com/knowledge/settings-explained) okuyun. Hizmetin desteklenen hesap akışı üzerinden oturum açın. Sağlayıcı API anahtarlarını asla paylaşılan bir isteme, herkese açık bir soruna veya depoya yapıştırmayın.

Node.js CLI, Node 22 veya daha yenisini gerektirir. Yerel bir kopyadan:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

Komut `dshrem` olarak da kullanılabilir. Bu uzak sohbet CLI'sı, önerilen araçları çalıştırmadan gösterir. Yerel düzenleme ve komut yürütme, VS Code Agent'a veya açıkça yapılandırılmış bir ana bilgisayar çalışma zamanına aittir; bunların izinleri ayrıdır. Bkz. [CLI yardımı](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Seçenekleri anlayın

**Önce kanıt**, desteklenen olguları varsayımlardan ayırır. **Planla ve denetle**, kısa bir plan ister ve sonucu isteğe göre denetler. **Yanıtı gözden geçir**, bir taslağı sorgular; ayrı bir gözden geçiren açıkça atanmadıkça bu bir öz denetimdir. Bu yöntemlerin hiçbiri doğruluğu veya daha düşük token kullanımını garanti etmez.

Görev ön ayarları, yeniden kullanılabilir talimatlar ve denetim listeleri ekler. Ek model belleği oluşturmazlar. Daha büyük bir bağlam koleksiyonu yine de hizmetin ve modelin istek sınırlarına sığmalıdır. Gelişmiş denetleyici, Python ve durum yolları, seçilen eklenti ana bilgisayarını ifade eder; Remote SSH'ta bu, uzak sunucudur.

## İşe yaradığında bir ekiple çalışın

Bir AGENTROY ekibi, bir koordinatöre, uygulayıcılara ve gözden geçirenlere farklı sorumluluklar atar. Ana bilgisayar ilkeleri, DSHREM ds41f ve hesap tabanlı Codex veya Claude araçlarını, isteğe bağlı mimari incelemeyle birlikte talep edebilir. Kullanılabilirlik, yüklü çalışma zamanına, hesap erişimine ve seçilen ilkeye bağlıdır. Eksik bir abonelik sessizce ücretli bir API çağrısına dönüşmemelidir.

Üç ila altı rol bir organizasyon tercihidir, kalite formülü değildir. Gözden geçirenlerin tam yapıt sürümüne ve test kanıtlarına ihtiyacı vardır. Modeller aynı fikirde olsa bile ciddi bir başarısız denetim kabulü engeller. [Ajan ekipleri ve görünür maliyetler](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs) yazısını okuyun.

## Belirsizliği gizlemeden devam edin

Sunucu tarafında ayrılmış bir tmux oturumu, bir dizüstü bilgisayar veya telefon bağlantısı kestikten sonra devam edebilir. Kapalı bir yerel bilgisayarda çalışma devam edemez. Sunucu arızası, bellek baskısı ve depolama kaybı yine de kurtarma gerektirir. Kaydedilmiş görev kimliğine yeniden bağlanın ve daha fazla işe başlamadan önce son onaylanmış olayını inceleyin. Sonucu bilinmeyen ücretli bir isteği körü körüne tekrarlamayın. Bkz. [bağlantı kopmaları ve kurtarma](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Maliyetleri ve verileri görünür tutun

Kabul edilen teklifi, görev üst sınırını, ayrılan tutarı ve kullanım makbuzunu inceleyin. %8 hizmet ek ücreti, ayrıca açıklanan ücretlerden önce USD1.00 sağlayıcı kullanımını USD1.08'e çevirir; bu bir örnektir, fiyat teklifi değildir. Abonelik kotaları, sağlayıcı ücretleri ve sunucu kaynakları farklı sınırlardır. Ek bütçe açık bir tercih gerektirir.

Yerel CLI kimlik bilgisi dosyaları yalnızca sahibinin erişebildiği izinleri kullanır. Bu izinler şifreleme veya yedekleme değildir. Bilgi yükleme açıktır; özel dosyalar asla herkese açık bir devir bağlantısına girmemelidir. [İstem devirleri](https://dsh.tvijo.com/knowledge/prompt-handoffs), incelenmiş bir görevin başka bir araca nasıl kopyalanacağını açıklar.

Bu deponun paketi şu anda `UNLICENSED` olarak işaretlidir; yayımlanması yeniden kullanım hakları vermez. Yeniden dağıtmadan önce güncel paket meta verilerine ve lisans bildirimine bakın. Çeviriler, DSHREM ile oluşturulan ve yapısal tutarlılık açısından denetlenen tanıtım kılavuzlarıdır; teknik tutarsızlıklarda İngilizce sürüm referanstır.
