# LabelGun – Kullanım Kılavuzu

Bu dosya, **LabelGun masaüstü uygulamasının nasıl kullanılacağını** açıklar. Teknik mimari, veritabanı, IPC kanalları ve geliştirici odaklı bilgiler için ana dokümantasyon dosyasına bakabilirsiniz:

[README.md](./README.md)

---

## 📋 İçindekiler

- [Workspace Hub ve Dataset İçe Aktarma](#workspace-hub-ve-dataset-i̇çe-aktarma)
- [Etiketleme Araçlarını Kullanma](#etiketleme-araçlarını-kullanma)
- [Anotasyon Düzenleme](#anotasyon-düzenleme)
- [SAM ile Otomatik Segmentasyon](#sam-ile-otomatik-segmentasyon)
- [Bulut Oturumu ve Sözleşme Yönetimi](#bulut-oturumu-ve-sözleşme-yönetimi)
- [Kaydetme ve Yerel Teslim](#kaydetme-ve-yerel-teslim)
- [Local Dataset Dışa Aktarma (Export)](#local-dataset-dışa-aktarma-export)
- [Görev Yönetimi](#görev-yönetimi)
- [Klavye Kısayolları](#klavye-kısayolları)

---

## 📖 Workspace Hub ve Dataset İçe Aktarma

- Uygulama açıldığında **Workspace** ekranı üç sekme ile görünür:
  - **Datasets**
  - **Contracts**
  - **Profile**

- **Datasets** sekmesinde **Import Dataset** butonuna tıklayarak görsellerin bulunduğu klasörü seçin.

- Desteklenen formatlar:
  - JPG
  - JPEG
  - PNG
  - BMP
  - WebP

- Klasördeki tüm görseller otomatik olarak task listesine eklenir.

- Bir dataset kartındaki **Open Workspace** butonuna tıklayarak LabelerView ekranına geçilir.

---

## 🖼️ Etiketleme Araçlarını Kullanma

1. Sol paneldeki **Labels** bölümünden dinamik yüklenen etiketlerinizi seçin.

2. Local dataset'lerde `+` butonu ile kendinize özel yeni etiketler ekleyebilirsiniz.

3. Local dataset'lerde kullanılmayan etiketleri çöp ikonuna tıklayarak silebilirsiniz.

4. Cloud sözleşmelerinde projeye sağlanan etiket havuzu **read-only** yani salt okunur olarak güvence altına alınır.

5. Toolbar'dan bir araç seçin:

| Araç | Açıklama |
| ---- | -------- |
| **Select** | Mevcut anotasyonları seçmek ve düzenlemek için kullanılır. |
| **SAM** | Tek tıkla AI destekli otomatik segmentasyon yapar. |
| **Shapes** | BBox, Polygon, Polyline, Circle veya Keypoint araçlarını içerir. |

6. Canvas üzerine çizim yapın.

---

## ✏️ Anotasyon Düzenleme

- **Seçme:** Select modunda bir anotasyona tıklayın.

- **Taşıma:** Seçili anotasyonu sürükleyip bırakın.

- **Boyutlandırma:** BBox köşelerini veya daire yarıçapını sürükleyin.

- **Polygon düzenleme:** Bir polygon üzerine uzun basın. Ardından vertex noktalarını tek tek düzenleyebilirsiniz.

- **Silme:** Seçili anotasyonu `Delete` tuşu veya toolbar'daki silme butonu ile silebilirsiniz.

---

## 🤖 SAM ile Otomatik Segmentasyon

1. Toolbar'dan **SAM** aracını seçin.

2. İlk kullanımda model otomatik indirilir. Model boyutu yaklaşık 120 MB civarındadır.

3. Etiketlemek istediğiniz nesneye tıklayın.

4. SAM otomatik olarak bir polygon maskesi oluşturur.

5. Oluşan polygon üzerine uzun basarak düzenleme yapabilirsiniz.

### SAM Kullanım Notları

- Aynı görsel üzerinde tekrar tıklama yaptığınızda embedding cache kullanılır.
- Var olan polygon anotasyonlarının içine tıklandığında yeni SAM isteği engellenir.
- SAM çıktısı polygon formatına dönüştürülerek canvas üzerinde düzenlenebilir hale getirilir.

---

## ☁️ Bulut Oturumu ve Sözleşme Yönetimi

1. Workspace → **Profile** sekmesinde e-posta ve şifre ile giriş yapın.

2. Giriş başarılı olduğunda Workspace → **Contracts** sekmesinde size atanan sözleşmeler listelenir.

3. İlgili sözleşme kartında **Limit** değerini ayarlayın.

4. **Download** butonuna tıklayarak görevleri yerel makineye indirin.

5. İndirme tamamlandığında sözleşme altında **Contract Health** bölümü açılır.

6. Contract Health alanında şu tür durumlar gösterilebilir:
   - Eksik annotation
   - Pending sync
   - Lease expired
   - Missing export
   - Conflict
   - Failed sync

7. Tüm görevler tamamlandıktan ve senkronize edildikten sonra **Submit Work** ile sözleşmeyi buluta teslim edin.

8. Çıkış yapmak için Profile sekmesindeki **Sign Out** butonunu kullanın.

9. Çıkış sonrası Contracts sekmesi otomatik olarak temizlenir.

---

## 💾 Kaydetme ve Yerel Teslim

- **Ctrl + S** veya **Save Draft:** Mevcut çalışmayı veritabanına kaydeder.

- **Mark as Complete:** Görevi yerelde tamamlandı olarak işaretler.

- Uygulama her 1 dakikada bir otomatik kaydetme yapar.

- Arka planda her 30 saniyede bir `syncManager` bekleyen anotasyonları buluta göndermeyi dener.

- Kullanıcı tarafından bilerek silinmiş boş etiket listeleri de durumu tam yansıtmak amacıyla kaydedilir.

---

## 📦 Local Dataset Dışa Aktarma (Export)

- Local dataset'ler (sadece yerel bilgisayarınızda olan veri setleri) için etiketlenen görselleri dışa aktarabilirsiniz.
- Etiketleme ekranının sağ üst köşesinde bulunan **Export** dropdown menüsünden aşağıdaki formatlardan birini seçebilirsiniz:
  - **Export COCO**: `.coco.json` formatında tek bir dosya indirir.
  - **Export YOLO**: `.yolo.zip` formatında resimler, `labels/*.txt` ve `classes.txt` dosyalarını içeren bir arşiv indirir.
  - **Export VOC**: `.voc.zip` formatında Pascal VOC (XML) etiketlerini içeren bir arşiv indirir.

**Önemli Notlar:**
- Export almadan önce ekrandaki açık olan etiketlemelerin son hali otomatik olarak (snapshot) kaydedilir.
- Orijinal olarak polygon, polyline, keypoint veya circle olarak çizdiğiniz şekiller bu formatların (YOLO, VOC) çoğunda bounding box (BBox) olarak kısıtlanarak çıkarılır (Derived Bbox). Ancak orjinal şekil bilgisi ek metadata dosyalarıyla (`shape-metadata.json` gibi) dışa aktarılan dosyanın içinde saklanır.
- **Bulut Sözleşmeleri Export Edilemez**: Eğer çalıştığınız veri seti bir *Cloud Contract (Bulut Sözleşmesi)* üzerinden indirildiyse, masaüstü uygulamasında Export butonu gizlenecektir. Bu projelerde işiniz bittiğinde sonuçları **Submit Work** butonuyla merkeze gönderirsiniz; verilerin dışa aktarılması işlemi sözleşmeyi oluşturan müşterinin Web panelinden yapılır.

---

## 📋 Görev Yönetimi

- Bir klasörden içe aktarılan her görsel otomatik olarak bir task haline gelir.

- Görevler yerelde şu durumlarda izlenir:
  - `Queued`
  - `In Progress`
  - `Completed`

- Sol paneldeki görev listesinde her görev için senkronizasyon sağlığı gösterilir:
  - `Pending`
  - `Missing Export`
  - `Lease Expired`
  - `Failed`

- Sol/Sağ ok tuşları veya Prev/Next butonlarıyla görevler arasında geçiş yapılabilir.

- Görevler arasında geçiş yaparken mevcut anotasyon durumu bellek içi cache'te korunur.

- Task yüklendiğinde görev önce cache'ten okunur. Cache'te yoksa veritabanından kaydedilmiş anotasyonlar restore edilir.

- Farklı dataset'ler arasında geçiş yapıldığında eski görevlerin anotasyonları temizlenir.

- Tüm görevler yerelde incelendikten sonra **Mark as Complete** ile tamamlanır.

- Buluta teslim işlemi Workspace → Contracts sekmesindeki **Submit Work** üzerinden yapılır.

---

## ⌨️ Klavye Kısayolları

| Kısayol                         | İşlem                                                     |
| ------------------------------- | --------------------------------------------------------- |
| `Ctrl + Z`                      | Geri al Undo                                             |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Yinele Redo                                              |
| `Ctrl + S`                      | Taslağı kaydet Save Draft                                |
| `Delete` / `Backspace`          | Seçili anotasyonu sil                                    |
| `Enter`                         | Polygon/polyline çizimini tamamla veya düzenlemeyi onayla |
| `Escape`                        | Çizimi iptal et / seçimi temizle / pan moduna geç        |
| `←` Sol Ok                      | Önceki göreve geç                                        |
| `→` Sağ Ok                      | Sonraki göreve geç                                       |
| `Ctrl + Scroll`                 | Fare pozisyonuna göre zoom in/out                        |
| `Sağ Tık + Sürükle`             | Görseli kaydırma Pan                                     |

---

## 🔗 İlgili Dokümantasyon

Teknik detaylar, proje mimarisi, veritabanı şeması, IPC kanalları ve kurulum bilgileri için:

[README.md](./README.md)