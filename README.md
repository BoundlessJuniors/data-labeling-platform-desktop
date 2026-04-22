# LabelGun – Masaüstü Görsel Veri Etiketleme Uygulaması

**LabelGun**, görüntü verileri üzerinde profesyonel düzeyde anotasyon (etiketleme) yapmak için geliştirilmiş, **Electron + Vue 3 + TypeScript + Tailwind CSS** tabanlı bir **masaüstü (desktop) uygulamasıdır**. SAM (Segment Anything Model) yapay zekâ entegrasyonu ile tek tıkla otomatik segmentasyon, Konva.js tabanlı yüksek performanslı canvas, SQLite yerel veritabanı ve çoklu anotasyon aracı desteği sunar.

---

## 📋 İçindekiler

- [Özellikler](#özellikler)
- [Ekran Görüntüsü Özetleri](#ekran-görüntüsü-özetleri)
- [Teknoloji Yığını](#teknoloji-yığını)
- [Mimari Genel Bakış](#mimari-genel-bakış)
- [Proje Yapısı](#proje-yapısı)
- [Veritabanı Şeması](#veritabanı-şeması)
- [IPC Kanalları](#ipc-kanalları)
- [Composable Mimarisi](#composable-mimarisi)
- [Klavye Kısayolları](#klavye-kısayolları)
- [Kurulum ve Çalıştırma](#kurulum-ve-çalıştırma)
- [Derleme (Build)](#derleme-build)
- [Kullanım Rehberi](#kullanım-rehberi)
- [Önerilen IDE Ayarları](#önerilen-ide-ayarları)

---

## 🚀 Özellikler

### 🖼️ Görüntü Üzerinde Etiketleme (5 Anotasyon Aracı)

| Araç             | Açıklama                                                        |
| ---------------- | --------------------------------------------------------------- |
| **Bounding Box** | Dikdörtgen çerçeve çizerek nesne sınırlama kutusu oluşturma     |
| **Polygon**      | Çokgen çizerek karmaşık şekilli nesneleri segmentleme           |
| **Polyline**     | Çoklu çizgi çekerek yol, sınır vb. doğrusal yapıları işaretleme |
| **Circle**       | Daire çizerek dairesel nesneleri etiketleme                     |
| **Keypoint**     | Tekil nokta işaretleyerek önemli konumları belirtme             |

### 🤖 SAM (Segment Anything Model) AI Entegrasyonu

- **Tek tıkla otomatik segmentasyon**: Görüntü üzerine tıkladığınızda SAM modeli ile otomatik polygon maskesi oluşturulur.
- **Model yönetimi**: SAM ViT-B ONNX modeli (encoder + decoder, ~120 MB) Hugging Face'ten otomatik indirilir.
- **İndirme ilerlemesi**: Encoder ve decoder dosyaları için gerçek zamanlı progress bar gösterimi.
- **Embedding cache**: Aynı görsele birden fazla tıklamada tekrar encoder çalıştırılmaz; embedding bellekte önbelleğe alınır.
- **ONNX Runtime**: `onnxruntime-node` ile yerel CPU üzerinde yüksek performanslı inferans.
- **Convex Hull**: SAM çıktısı olan maske verisi, convex hull algoritması ile polygon noktalarına dönüştürülür.
- **Akıllı çakışma kontrolü**: Var olan polygon anotasyonlarının içine tıklandığında yeni SAM isteği engellenir.

### 💾 Yerel Veritabanı (SQLite) ve Kalıcı Depolama

- **better-sqlite3** ile senkron, yüksek performanslı veritabanı.
- **WAL (Write-Ahead Logging)** modu ile eş zamanlı okuma/yazma optimizasyonu.
- **Dataset, media ve anotasyon** tabloları ile tam veri yönetimi.
- **Otomatik migrasyon**: Uygulama her çalıştığında eksik sütunlar (`status`, `annotation_seconds`, `folder_path`) otomatik eklenir.
- **Anotasyon kalıcılığı**: JSON formatında dışa aktarılan anotasyonlar, media bazında veritabanında saklanır.

### ⏱️ Otomatik Kaydetme (Auto-Save) ve Süre Takibi

- **1 dakikada bir otomatik kaydetme**: Tüm task'lerin anotasyonları ve çalışma süreleri otomatik olarak veritabanına yazılır. Kullanıcı tarafından bilerek silinmiş (boş) etiket listeleri de durumu tam yansıtmak amacıyla kaydedilir.
- **Save Draft butonu üzerinde progress halkası**: Otomatik kaydetmeye kalan süreyi görsel olarak gösterir.
- **Task bazlı zamanlayıcı**: Her görev (görsel) için ayrı çalışma süresi saniye cinsinden kaydedilir.
- **Global zamanlayıcı**: Toplam çalışma süresini header'da canlı olarak gösterir.
- **Kayıt başarı animasyonu**: "Auto saved" pill animasyonu ile görsel geri bildirim.

### ⏪ Undo / Redo Sistemi

- **Snapshot tabanlı geçmiş**: Tüm anotasyon dizisi JSON deep-clone ile saklanır.
- **Global undo/redo**: `Ctrl+Z` / `Ctrl+Y` ile tüm anotasyon değişikliklerini geri alma/yineleme.
- **Edit modu için yerel undo/redo**: Polygon/şekil düzenleme modunda ayrı bir geçmiş yönetimi; `Ctrl+Z`/`Ctrl+Y` sadece düzenlenen şekil üzerinde çalışır.
- **Transform sonrası otomatik kayıt**: Sürükleme veya boyutlandırma bittikten sonra geçmişe ekleme.

### 🔍 Zoom, Pan ve Canvas Kontrolü

- **Konva.js tabanlı canvas**: Yüksek performanslı 2D çizim kütüphanesi ile akıcı etkileşim.
- **Ctrl + Scroll ile zoom**: Fare tekerleği ile yakınlaştırma/uzaklaştırma (0.05x – 10x arası).
- **Sağ tık ile pan**: Sağ fare tuşu ile görseli kaydırma.
- **Zoom In / Zoom Out butonları**: Sabit %10 adımlarla yakınlaştırma/uzaklaştırma.
- **Fit to Screen**: Görüntüyü canvas boyutuna göre otomatik ölçekleme.
- **Reset View**: Mevcut task'in tüm anotasyonlarını sıfırlayarak yeniden başlatma.
- **Crosshair**: Fare pozisyonunu gösteren yatay ve dikey rehber çizgiler.
- **Koordinat göstergesi**: Sol alt köşede gerçek zamanlı `X, Y` piksel koordinatları.

### ☁️ Bulut Senkronizasyonu ve İş Akışı (Cloud Sync & Workflow)

- **Sözleşme (Contract) Tabanlı Çalışma**: Buluttan size atanan sözleşmeleri görüntüleyip, ilgili görevleri (görselleri) yerel makinenize indirebilirsiniz.
- **Kiralama (Lease) Mekanizması**: İndirilen görseller kiralama jetonu (lease token) ile korunur, böylece aynı görsel üzerinde başkasının da işlem yapması (race condition) önlenir. Süresi dolan görevler için özel "Recover" mekanizması mevcuttur.
- **Sürekli Oturum ve Cookie Yönetimi**: `tough-cookie` entegrasyonu ile oturum çerezleri lokalde tutulur, böylece uygulamanın her açılışında yeniden giriş yapmadan oturum otomatik sürdürülür (Bootstrap Session).
- **Akıllı Hata ve Sağlık Yönetimi (Contract Health)**: Arka planda çalışan sistem ile işlemler buluta senkronize edilir. HTTP hataları sınıflandırılır ve `CloudPanel` üzerinden kullanıcıya eksik indirme, süresi dolmuş görev veya çakışma (conflict) gibi detaylı sağlık verisi görselleştirilir.
- **Payload Hash Optimizasyonu ve Çakışma Yönetimi**: Anotasyon verilerinin SHA-256 hashleri oluşturularak duplicate submission engellenir. Eğer backend'de görev teslim edilmişse ancak lokalde daha yeni veriler varsa `task_already_submitted_conflict` durumu devreye girerek veri kaybı önlenir.
- **Kapsamlı Snapshot Modeli (Full Snapshot)**: İş akışı parçalı yamalar (incremental patch) yerine, sunucuya her daim bir görev/medyanın tüm güncel verilerini içeren tek, nihai bir "tam kopya (export)" gönderir.
- **Strict Tip Uyumluluğu ve API Normalizasyonu**: Backend servislerinden dönen karmaşık veri yapıları (HTTP response zarfları vs.) doğrudan masaüstüne yansıtılmaz. IPC Köprüsü (Main Process), bu yanıtları normalize ederek Renderer'ın saf, platform-native `({ ok: true, data: ... })` yapılarıyla güvenli çalışmasını sağlar.

### 📋 Görev Yönetimi (Task Management)

- **Dataset tabanlı görev sistemi**: Bir klasörden içe aktarılan tüm görseller, otomatik olarak birer Task olarak oluşturulur.
- **Görev durumları**: Her görev yerelde `Queued` → `In Progress` → `Completed` durumlarında izlenir.
- **Senkronizasyon Göstergeleri (Sync Badges)**: Sol paneldeki görev listesinde her görev için senkronizasyon sağlığı anlık olarak gösterilir (`Pending`, `Missing Export`, `Lease Expired`, `Failed`).
- **Görevler arası navigasyon**: Sol/Sağ ok tuşları veya Prev/Next butonlarıyla görevler arasında ileri/geri geçiş.
- **Anotasyon koruma ve Sıfır Sızıntı**: Görevler arasında geçiş yaparken mevcut anotasyon durumu (kullanıcı tüm etiketleri temizlemiş olsa dahi) bellek içi cache'te sıkı bir şekilde güvenceye alınır.
- **DB'den anotasyon geri yükleme**: Task yüklendiğinde görev önce cache'ten (boş bile olsa) okunur, eğer yoksa veritabanından kaydedilmiş anotasyonlar restore edilir.
- **Dataset izolasyonu**: Farklı dataset'ler arasında geçiş yapıldığında eski görevlerin anotasyonları tamamen temizlenir.
- **Submit Work**: Tüm görevler yerelde incelendikten sonra "Mark as Complete" ile tamamlanır. Buluta teslim ise Cloud Panel üzerinden `Submit Work` ile gerçekleştirilir.

### 🎨 Tema ve Görünüm

- **Light / Dark tema desteği**: Toggle butonu ile anında tema değiştirme.
- **Sistem temasına uyum**: İlk açılışta işletim sistemi teması otomatik algılanır.
- **localStorage kalıcılığı**: Tema tercihi tarayıcı kapansa da hatırlanır.
- **Anotasyon renk paleti**: Tüm şekiller tek bir ana renk (`#F97316` – Orange) ile çizilir; tip bazında dolgu opaklığı farklılaştırılır.
- **Ayarlanabilir çizgi kalınlığı**: Toolbar üzerinde 1–10 arası slider ile anotasyon kenar kalınlığı dinamik olarak değiştirilebilir.

### 🔔 Gelişmiş Geri Bildirim Sistemi (Feedback System)

- **Toast Bildirimleri (ToastHost)**: İşlem sonuçları, uyarılar ve arka plan process'leri için otomatik kapanan (auto-dismiss), modern anlık bildirimler.
- **Özel Diyaloglar (DialogHost)**: Native tarayıcı pencereleri (`alert`/`confirm`) yerine uygulamanın karanlık/aydınlık teması ile tam uyumlu, uygulamanın geri kalanıyla görsel bütünlük sağlayan modal iletişim kutuları.
- **Klavye İzolasyonu**: Diyaloglar etkinken arka plan klavye kısayollarını (ör. çizim veya undo/redo tetiklemeleri) donduran akıllı event listener (Capture Phase) yönetimi.
- **Güvenlik Politikası (XSS Koruması)**: Kullanıcıdan veya ağdan gelen veri içeren diyalog/toast mesajlarında `v-html` yerine güvenli metin interpolasyonu (`{{ }}`) kullanılarak **Cross-Site Scripting (XSS)** zafiyetleri önlenir.

### 🖥️ Özel Çerçevesiz Pencere (Custom Frameless Window)

- İşletim sistemi varsayılan başlık çubuğu yerine, tamamen özelleştirilmiş bir title bar.
- **Pencere kontrolleri**: Minimize, Maximize/Restore ve Close butonları.
- **Sürüklenebilir alan**: Title bar üzerinde pencere sürükleme (`-webkit-app-region: drag`).
- **Datasets butonu**: Ana title bar üzerinden dataset seçim ekranına hızlı dönüş.

### 🔀 Dataset İçe Aktarma ve Yönetimi

- **Klasör seçici**: Yerel dosya sisteminizden bir görsel klasörü seçerek dataset oluşturma.
- **Desteklenen formatlar**: `.jpg`, `.jpeg`, `.png`, `.bmp`, `.webp`.
- **Tekrar ekleme koruması**: Aynı klasör tekrar seçildiğinde yeni dataset oluşturulmasını engelleyerek mevcut dataset'e senkronize eder.
- **Dataset silme**: Cascade silme ile dataset, medya ve anotasyonlar birlikte temizlenir.
- **Özel `local://` protokolü**: Yerel dosyaları güvenli şekilde Chromium renderer'a sunmak için özel bir URL scheme kullanılır.

### 🏷️ Dinamik Etiket (Label) Mimarisi

- **Bulut ve Yerel İzolasyonu**: Dataset tabanlı etiket modellemesi. Sözleşme üzerinden indirilen görevlerde etiketler ve meta verileri buluttan gelir, yerel uygulamada veri bütünlüğünü korumak için **salt okunur** olarak kilitlenir.
- **Dinamik Yerel Etiketleme**: Kullanıcının kendi ortamından (Local Dataset) içe aktardığı görsellerde sistem etiket havuzunu izole tutar; kullanıcı serbestçe etiket ekleyebilir ve silebilir.
- **Zil Sesi (Safe Deletion) Koruması**: Veritabanı ve canvas üzerinde fiilen uygulanmış, halihazırda kullanılmakta olan anotasyon etiketlerinin silinmesi engellenir.
- **Hardcode Bağımsız**: Arayüzde kodlanmış sabit (ör. "Göz", "Kulak") sınıf listeleri tamamen kaldırılmış olup, SQLite ve Bulut meta veri kaynakları ile senkronize çalışır.

---

## 🏗️ Teknoloji Yığını

| Katman                 | Teknolojiler                                             |
| ---------------------- | -------------------------------------------------------- |
| **Desktop Framework**  | Electron 38 (Chromium + Node.js)                         |
| **Frontend Framework** | Vue 3 (Composition API, `<script setup>`)                |
| **Programlama Dili**   | TypeScript 5 (strict)                                    |
| **Build Sistemi**      | Vite 7 + electron-vite 4                                 |
| **Canvas Kütüphanesi** | Konva.js 9 + vue-konva 3                                 |
| **CSS Framework**      | Tailwind CSS 3 + PostCSS + Autoprefixer                  |
| **Veritabanı**         | SQLite (better-sqlite3 12)                               |
| **AI / ML Çıkarım**    | ONNX Runtime Node 1.23 (SAM ViT-B)                       |
| **Görüntü İşleme**     | Jimp 0.22 (resize, normalize, pixel access)              |
| **Ağ / Oturum**        | Axios + tough-cookie + axios-cookiejar-support           |
| **SVG İkonlar**        | vite-svg-loader 5 (SVG → Vue bileşeni)                   |
| **Kod Kalitesi**       | ESLint 9 + Prettier 3                                    |
| **Paketleme**          | electron-builder 25 (NSIS / DMG / AppImage / deb / snap) |

---

## 🧱 Mimari Genel Bakış

LabelGun üç ana Electron katmanından oluşur:

```
┌──────────────────────────────────────────────────────────┐
│                     RENDERER PROCESS                      │
│  Vue 3 + Konva.js + Tailwind CSS                         │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │  App.vue      │  │ LabelerView.vue│  │KonvaCanvas   │  │
│  │ (Dataset Mgmt)│  │ (Ana Labeler)  │  │(2D Canvas)   │  │
│  └──────────────┘  └────────────────┘  └──────────────┘  │
│  composables/ ─ useLabelerToolState, useLabelerSamManager, useTasks ...│  │
├──────────────────────────────────────────────────────────┤
│                   PRELOAD (Bridge)                         │
│  contextBridge → window.api { db, sam, dataset, window }  │
├──────────────────────────────────────────────────────────┤
│                     MAIN PROCESS                          │
│  ┌────────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ SQLite DB   │  │ SAM Model │  │ IPC Handlers        │  │
│  │ (better-    │  │ (ONNX     │  │ (dbIpc + samIpc)    │  │
│  │  sqlite3)   │  │  Runtime) │  │                      │  │
│  └────────────┘  └──────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Veri akışı:**

1. Renderer, `window.api.*` üzerinden IPC çağrıları yapar.
2. Preload, `ipcRenderer.invoke()` ile main process'e mesaj iletir.
3. Main process, `ipcMain.handle()` ile DB sorguları veya SAM çıkarımı yapar ve sonuçları döner.

---

## 📁 Proje Yapısı

```text
label_gun/
├── src/
│   ├── main/                          # Electron Main Process
│   │   ├── index.ts                   # Uygulama giriş noktası, pencere oluşturma,
│   │   │                              # local:// protocol, dataset folder picker
│   │   ├── api/                       # API istemcisi ve Bulut entegrasyonu (REST + IPC)
│   │   │   ├── apiClient.ts           # Axios tabanlı API istemcisi ve cookie yönetimi
│   │   │   ├── authIpc.ts             # Kimlik doğrulama işlemleri IPC köprüsü
│   │   │   └── cloudTasksIpc.ts       # Bulut görevleri, sözleşme verisi çekme işlemleri
│   │   ├── sync/
│   │   │   └── syncManager.ts         # Arka planda DB ile Cloud arasında anotasyon senkronizasyonu
│   │   ├── samModel.ts                # SAM AI modeli: indirme, embedding, inferans,
│   │   │                              # mask→polygon dönüşümü, convex hull
│   │   ├── db/
│   │   │   └── sqlite.ts              # SQLite bağlantısı, şema, migrasyon
│   │   ├── ipc/
│   │   │   ├── dbIpc.ts               # Veritabanı IPC handler'ları (CRUD)
│   │   │   └── samIpc.ts              # SAM model IPC handler'ları
│   │   ├── utils/
│   │   │   └── hashUtil.ts            # Veri bütünlüğü için hashing yardımcıları
│   │   └── workers/
│   │       └── samWorker.ts           # SAM modelini main thread'i engellemeden çalıştıran arka plan Worker'ı
│   │
│   ├── preload/                       # Electron Preload (Renderer ↔ Main köprüsü)
│   │   ├── index.ts                   # contextBridge – API'yi renderer'a açar
│   │   └── index.d.ts                 # TypeScript tip tanımları (window.api)
│   │
│   └── renderer/                      # Vue 3 Frontend (Renderer Process)
│       ├── index.html                 # Renderer HTML şablonu
│       └── src/
│           ├── main.ts                # Vue uygulaması giriş noktası + VueKonva plugin
│           ├── App.vue                # Kök bileşen: Dataset seçim ekranı + custom title bar
│           ├── env.d.ts               # Vite / SVG / Vue ortam tip tanımları
│           │
│           ├── views/
│           │   └── LabelerView.vue    # Ana etiketleme ekranı (orchestrator):
│           │                          # sidebar, toolbar, canvas, paneller arası
│           │                          # iletişimi yöneten merkezi bileşen.
│           │
│           ├── components/
│           │   ├── labeler/           # Labeler'a özel bileşenler
│           │   │   ├── TaskSidebar.vue      # Görev listesi ve navigasyon
│           │   │   ├── LabelerHeader.vue    # Başlık alanı, timer ve save kontrolleri
│           │   │   ├── LabelerToolbar.vue   # Araç seçimi, SAM ayarları, stroke slider
│           │   │   ├── CanvasWorkspace.vue  # Konva.js tabanlı ana çalışma alanı
│           │   │   ├── AnnotationsPanel.vue # Anotasyon listesi (sağ panel)
│           │   │   ├── LabelsPanel.vue      # Etiket listesi ve yönetimi
│           │   │   └── SamModelMenu.vue     # SAM model indirme ve yönetim modalı
│           │   ├── ui/
│           │   │   ├── DialogHost.vue # Global modal iletişim ve onay penceresi yöneticisi
│           │   │   └── ToastHost.vue  # Global anlık bildirim (toast) arayüzü
│           │   ├── CloudPanel.vue     # Bulut hesap giriş tabı, sözleşme ve görev listesi paneli
│           │   ├── KonvaCanvas.vue    # Konva.js tabanlı 2D canvas bileşeni (~1300 satır):
│           │   │                      # şekil çizimi, düzenleme, drag & drop,
│           │   │                      # zoom/pan, vertex düzenleme
│           │   └── Versions.vue       # Electron/Chrome/Node sürüm bilgisi
│           │
│           ├── composables/           # Vue 3 Composition API modülleri
│           │   ├── useAuth.ts                # Kimlik doğrulama state'leri ve login/logout işlemleri
│           │   ├── useCloud.ts               # Bulut veri iletişimi ve sözleşme durum reaktivitesi
│           │   ├── useFeedback.ts            # Global dialog ve toast bildirim yönetimi
│           │   ├── useDatasetLabeling.ts     # Dataset etiket yönetimi ve cloud/local izin izolasyonu
│           │   ├── useLabelerState.ts        # Merkezi reactive state yönetimi
│           │   │
│           │   │   # --- Etiketleme Ekranı Mantık Modülleri (Refactored) ---
│           │   ├── useLabelerToolState.ts    # Aktif araç, imleç ve toolbar seçim mantığı
│           │   ├── useLabelerEditSession.ts  # Şekil düzenleme, yerel undo/redo ve mod yönetimi
│           │   ├── useLabelerSamManager.ts   # SAM model lifecycle, indirme ve AI etkileşimi
│           │   ├── useLabelerTaskSession.ts  # Görev yükleme, navigasyon ve anotasyon cache
│           │   ├── useLabelerAutoSave.ts     # Zamanlayıcılar, auto-save döngüsü ve DB senkronu
│           │   │
│           │   ├── useLabelerActions.ts      # Kullanıcı aksiyonları (undo, redo, delete, submit)
│           │   ├── useHistory.ts             # Snapshot tabanlı global undo/redo
│           │   ├── useCanvasTransform.ts     # Zoom, pan, fit-to-screen
│           │   ├── useCanvasInteractions.ts  # Mouse event handler'ları (alt-seviye)
│           │   ├── useAnnotationsRenderer.ts  # Anotasyon render ve seçim mantığı
│           │   ├── useKeyboardShortcuts.ts   # Global klavye kısayolları
│           │   ├── useTasks.ts               # Görev listesi temel yönetimi
│           │   └── useTheme.ts               # Light/dark tema yönetimi
│           │
│           ├── types/
│           │   └── annotation.ts      # Tip tanımları: BBox, Polygon, Polyline,
│           │                          # Circle, Keypoint, Task, TaskStatus
│           │
│           ├── theme/
│           │   └── annotationPalette.ts # Anotasyon SVG stil tanımları (renk, kalınlık)
│           │
│           ├── utils/
│           │   ├── image.ts           # Asenkron görüntü yükleme
│           │   └── dom.ts             # SVG namespace, querySelectorAll helper
│           │
│           ├── styles/
│           │   ├── tailwind.css       # Tailwind base/components/utilities
│           │   ├── labeler-view.css   # Labeler view'a özel stiller
│           │   └── icons.css          # SVG ikon boyutlandırma
│           │
│           └── assets/
│               ├── base.css           # Temel CSS değişkenleri ve reset
│               ├── fonts.css          # Font tanımları
│               ├── main.css           # Uygulama genel stilleri
│               ├── fonts/             # Uygulama font dosyaları (Exo vb.)
│               ├── images/            # Statik uygulama görselleri
│               └── icons/custom/      # SVG ikon dosyaları (undo, redo, search vb.)
│
├── electron.vite.config.ts            # Vite yapılandırması (main/preload/renderer)
├── electron-builder.yml               # Electron Builder paketleme konfigürasyonu
├── tailwind.config.cjs                # Tailwind CSS yapılandırması
├── postcss.config.cjs                 # PostCSS (Tailwind + Autoprefixer)
├── tsconfig.json / .node.json / .web.json  # TypeScript yapılandırmaları
├── eslint.config.mjs                  # ESLint yapılandırması
├── package.json                       # Bağımlılıklar ve npm scriptleri
└── build/                             # Electron Builder build kaynakları
```

---

## 🗃️ Veritabanı Şeması

Uygulama yerel bir SQLite veritabanı kullanır (`%APPDATA%/label_gun/db/app.sqlite`):

### `datasets` Tablosu

| Sütun                | Tip           | Açıklama                           |
| -------------------- | ------------- | ---------------------------------- |
| `id`                 | TEXT (PK)     | Dataset benzersiz kimliği          |
| `name`               | TEXT          | Kullanıcıya görünen isim           |
| `folder_path`        | TEXT (UNIQUE) | Kaynak klasör yolu                 |
| `cloud_contract_id`  | TEXT          | Senkronize edilen bulut sözleşmesi |
| `label_source`       | TEXT          | Etiket Kaynağı (`cloud`/`local`)   |
| `annotation_format`  | TEXT          | Etiketleme formatı                 |
| `labeling_spec_json` | TEXT          | Yönergeler ve UI meta verileri     |
| `qc_mode`            | TEXT          | Kalite kontrol durumu              |
| `label_set_name`     | TEXT          | Etiket seti genel adı              |
| `label_set_version`  | INTEGER       | Etiket seti sürümü                 |
| `created_at`         | INTEGER       | Oluşturulma zamanı (Unix ms)       |

### `dataset_labels` Tablosu

Dataset'e özel dinamik etiket yapılandırmaları. Cloud dataset'lerinde salt okunurdur, Local dataset'lerinde kullanıcı tarafından yönetilebilir.

| Sütun                    | Tip       | Açıklama                                |
| ------------------------ | --------- | --------------------------------------- |
| `id`                     | TEXT (PK) | Etiket kimliği                          |
| `dataset_id`             | TEXT (FK) | Bağlı olduğu dataset                    |
| `name`                   | TEXT      | Etiket adı (ör. "Araç", "Yaya")         |
| `color`                  | TEXT      | Hex renk kodu (opsiyonel)               |
| `attributes_schema_json` | TEXT      | Alt özellik tanımları (JSON formatında) |
| `source`                 | TEXT      | Etiket kaynağı (`cloud` veya `local`)   |
| `created_at`             | INTEGER   | Oluşturulma tarihi                      |
| `updated_at`             | INTEGER   | Son güncellenme tarihi                  |

### `media_items` Tablosu

| Sütun                | Tip       | Açıklama                                    |
| -------------------- | --------- | ------------------------------------------- |
| `id`                 | TEXT (PK) | Görselin benzersiz kimliği (tam dosya yolu) |
| `dataset_id`         | TEXT (FK) | Bağlı olduğu dataset                        |
| `local_path`         | TEXT      | Dosyanın yerel yolu                         |
| `sha256`             | TEXT      | Dosya hash'i (opsiyonel)                    |
| `width`              | INTEGER   | Görsel genişliği (px)                       |
| `height`             | INTEGER   | Görsel yüksekliği (px)                      |
| `status`             | TEXT      | Durum: `in_progress` / `completed`          |
| `annotation_seconds` | INTEGER   | Bu görselde harcanan toplam süre (saniye)   |
| `cloud_task_id`      | TEXT      | Bulut görev kimliği (senkronizasyon için)   |
| `cloud_asset_id`     | TEXT      | Bulut görsel varlığı kimliği                |
| `contract_id`        | TEXT      | İlgili sözleşme ID                          |
| `cloud_asset_url`    | TEXT      | Varlık indirilirken kullanılan URL          |
| `sync_status`        | TEXT      | Senkronizasyon durumu                       |
| `download_status`    | TEXT      | Görsel indirme durumu                       |
| `last_error`         | TEXT      | Varsa son hata mesajı                       |
| `created_at`         | INTEGER   | Oluşturulma zamanı (Unix ms)                |
| `updated_at`         | INTEGER   | Son güncelleme zamanı (Unix ms)             |

### `annotations` Tablosu

| Sütun              | Tip       | Açıklama                                                        |
| ------------------ | --------- | --------------------------------------------------------------- |
| `id`               | TEXT (PK) | Anotasyon kimliği (dışa aktarımda `export:MEDIA_ID` / Snapshot) |
| `media_id`         | TEXT (FK) | Bağlı olduğu görsel                                             |
| `type`             | TEXT      | Tip: `bbox`, `polygon`, `keypoint`, `circle`, `export`          |
| `category`         | TEXT      | Kategori/sınıf adı                                              |
| `data_json`        | TEXT      | Anotasyon verisinin JSON formatı                                |
| `cloud_task_id`    | TEXT      | İlişkili bulut görevi ID                                        |
| `contract_id`      | TEXT      | İlişkili sözleşme ID                                            |
| `payload_json`     | TEXT      | API'ye gönderilecek JSON yükü                                   |
| `payload_hash`     | TEXT      | Gönderilecek verinin SHA-256 hash özeti                         |
| `last_synced_hash` | TEXT      | Başarıyla senkronize edilmiş son veri hash'i                    |
| `sync_status`      | TEXT      | Senkronizasyon durumu (pending_insert vb.)                      |
| `attempt_count`    | INTEGER   | Hata sonrası yeniden deneme sayısı                              |
| `last_error`       | TEXT      | Senkronizasyon hatası sınıflandırması                           |
| `updated_at`       | INTEGER   | Son güncelleme zamanı (Unix ms)                                 |

### `task_leases` Tablosu

Cloud sync işlemleri sırasında görevleri diğer labeler'lara karşı kilitlemek (race condition önlemek) için kullanılır.

| Sütun          | Tip       | Açıklama                                     |
| -------------- | --------- | -------------------------------------------- |
| `task_id`      | TEXT (PK) | Görev ID'si                                  |
| `contract_id`  | TEXT      | Sözleşme ID'si                               |
| `lease_token`  | TEXT      | Sunucudaki kilit için atanan güvenlik jetonu |
| `leased_until` | INTEGER   | Kiralama süresi bitişi                       |
| `created_at`   | INTEGER   | Oluşturulma tarihi                           |
| `updated_at`   | INTEGER   | Güncelleme tarihi                            |

---

## 📡 IPC Kanalları

### Veritabanı Kanalları (`dbIpc.ts`)

| Kanal                               | Yön    | Açıklama                                               |
| ----------------------------------- | ------ | ------------------------------------------------------ |
| `db:ping`                           | invoke | Bağlantı kontrolü                                      |
| `db:datasets:create`                | invoke | Yeni dataset oluşturma                                 |
| `db:datasets:list`                  | invoke | Tüm dataset'leri listeleme                             |
| `db:datasets:getByFolder`           | invoke | Klasör yoluna göre dataset sorgulama                   |
| `db:datasets:getLabelingContext`    | invoke | Dataset ve etiket ağacını toplu getirme                |
| `db:datasets:updateLabelingContext` | invoke | Dataset sözleşme meta verilerini güncelleme            |
| `db:datasets:delete`                | invoke | Dataset + ilişkili media + anotasyonları cascade silme |
| `db:datasetLabels:replaceAll`       | invoke | Bulut etiket listesini atomik yenileme                 |
| `db:datasetLabels:add`              | invoke | Local dataset'e etiket ekleme                          |
| `db:datasetLabels:delete`           | invoke | Local dataset'ten kullanımda olmayan etiketi silme     |
| `db:media:upsert`                   | invoke | Görsel ekleme veya güncelleme (UPSERT)                 |
| `db:media:listByDataset`            | invoke | Dataset'e ait görselleri listeleme                     |
| `db:media:setStatus`                | invoke | Görsel durumunu güncelleme                             |
| `db:media:setTime`                  | invoke | Görselde harcanan süreyi kaydetme                      |
| `db:annotations:saveExport`         | invoke | Dışa aktarılmış JSON anotasyonu kaydetme               |
| `db:annotations:getExport`          | invoke | Kaydedilmiş anotasyonu geri yükleme                    |

### SAM Model Kanalları (`samIpc.ts`)

| Kanal                   | Yön          | Açıklama                                             |
| ----------------------- | ------------ | ---------------------------------------------------- |
| `sam:status`            | invoke       | Mevcut model durumunu sorgulama                      |
| `sam:isInstalled`       | invoke       | Model dosyalarının indirilip indirilmediğini kontrol |
| `sam:download`          | invoke       | SAM modelini Hugging Face'ten indirme                |
| `sam:ensureReady`       | invoke       | ONNX session'larını hazırlama                        |
| `sam:run`               | invoke       | Verilen noktalarla SAM çıkarımı yapma                |
| `sam:download-progress` | send (event) | İndirme ilerlemesi bildirimi (encoder/decoder)       |

### Auth ve Cloud Kanalları (`authIpc.ts` / `cloudTasksIpc.ts`)

| Kanal                        | Yön    | Açıklama                                                      |
| ---------------------------- | ------ | ------------------------------------------------------------- |
| `auth:login`                 | invoke | Bulut hesabına giriş yapar ve doğrulanmış kullanıcıyı döner   |
| `auth:bootstrapSession`      | invoke | Var olan çerezleri (cookie) kullanarak oturumu yeniler/doğrular|
| `auth:logout`                | invoke | Bulut hesabından çıkış yapar ve yerel çerezleri temizler      |
| `cloud:fetchContracts`       | invoke | Kullanıcıya atanmış sözleşmeleri listeler                     |
| `cloud:downloadContractWork` | invoke | Kiralama (lease-batch) ve asset indirme akışını yürütür       |
| `cloud:syncNow`              | invoke | Arka planda bekleyen anotasyonları anında senkronize eder     |
| `cloud:getContractHealth`    | invoke | Sözleşme için detaylı senkronizasyon ve hata sağlığını hesaplar|
| `cloud:recoverExpiredTasks`  | invoke | Süresi dolmuş görevleri arşivleyip yeniden indirilmeye hazırlar|
| `cloud:resetContractLocalState`| invoke| Sözleşmeye ait tüm yerel verileri (DB ve dosya) güvenle siler |
| `cloud:submitContract`       | invoke | Görevleri API'ye teslim eder (önce sağlık kontrolü yapar)     |

### Pencere ve Sistem Kanalları

| Kanal                   | Yön    | Açıklama                                           |
| ----------------------- | ------ | -------------------------------------------------- |
| `window:minimize`       | invoke | Pencereyi küçültme                                 |
| `window:toggleMaximize` | invoke | Pencereyi büyütme/küçültme                         |
| `window:close`          | invoke | Pencereyi kapatma                                  |
| `dataset:pickFolder`    | invoke | Klasör seçme diyalogu açma + görselleri filtreleme |

---

## 🧩 Composable Mimarisi

| Composable               | Sorumluluk                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `useAuth`                | Kullanıcı oturum yönetimi (login, logout, otomatik session bootstrap, cookie entegrasyonu)                |
| `useCloud`               | Sözleşme çekme, indirme, sağlık takibi (health), süresi dolan görevleri kurtarma (recover) ve submit      |
| `useFeedback`            | Uygulama genelinde özel diyaloğ (onay/hata) ve toast bildirimlerinin reaktif yönetimi                     |
| `useDatasetLabeling`     | Dataset etiket havuzu yükleme, aktif etiket seçimi ve cloud(salt-okunur) / local(yönetilebilir) kontrolü  |

| `useLabelerState`        | Merkezi reaktif durum: anotasyonlar, seçim, çizim bayrakları, araç/etiket bilgisi, zoom/pan parametreleri |
| `useHistory`             | JSON snapshot ile undo/redo geçmişi yönetimi                                                              |
| `useCanvasTransform`     | Zoom (min 0.6x – max 10x), pan, fit-to-screen hesaplamaları                                               |
| `useCanvasInteractions`  | Mouse event handler'ları (alt seviye etkileşimler)                                                        |
| `useAnnotationsRenderer` | Konva.js anotasyon render, dışa aktarım (image-space), anotasyon seçimi ve silme                          |
| `useKeyboardShortcuts`   | `Ctrl+Z/Y`, `Ctrl+S`, `Del`, `Enter`, `Escape`, `←/→` ok tuşları                                          |
| `useTasks`               | Task listesi yönetimi, veritabanı senkronizasyonu (`initFromDb`), task arası navigasyon                   |
| `useLabelerActions`      | Kullanıcı aksiyonları: undo, redo, delete, draft kaydetme (deterministik payload ve hash), toplu submit   |
| `useTheme`               | Light/dark tema: OS algılama, localStorage kalıcılığı, CSS class toggle                                   |

| Etiketleme Ekranı Mantık Modülleri (Logic Extraction) | Sorumluluk |
| --- | --- |
| `useLabelerToolState` | Aktif araç yönetimi, imleç güncellemeleri ve toolbar etkileşimleri. |
| `useLabelerEditSession` | Polygon/şekil düzenleme modu state'i, yerel undo/redo geçmişi. |
| `useLabelerSamManager` | SAM modellerinin indirilmesi, durum takibi ve AI çıkarım koordinasyonu. |
| `useLabelerTaskSession` | Görevler arası geçiş, görüntü yükleme ve bellek içi anotasyon cache yönetimi. |
| `useLabelerAutoSave` | Global/Task bazlı sayaçlar, otomatik kayıt döngüsü ve DB persistency. |

---

## ⌨️ Klavye Kısayolları

| Kısayol                         | İşlem                                                     |
| ------------------------------- | --------------------------------------------------------- |
| `Ctrl + Z`                      | Geri al (Undo)                                            |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Yinele (Redo)                                             |
| `Ctrl + S`                      | Taslağı kaydet (Save Draft)                               |
| `Delete` / `Backspace`          | Seçili anotasyonu sil                                     |
| `Enter`                         | Polygon/polyline çizimini tamamla veya düzenlemeyi onayla |
| `Escape`                        | Çizimi iptal et / seçimi temizle / pan moduna geç         |
| `←` (Sol Ok)                    | Önceki göreve geç                                         |
| `→` (Sağ Ok)                    | Sonraki göreve geç                                        |
| `Ctrl + Scroll`                 | Fare pozisyonuna göre zoom in/out                         |
| `Sağ Tık + Sürükle`             | Görseli kaydırma (Pan)                                    |

---

## 🛠️ Kurulum ve Çalıştırma

### Gereksinimler

- **Node.js** ≥ 18 (native modüller için)
- **npm** ≥ 9
- **Python** 3.x ve **C++ Build Tools** (better-sqlite3 / onnxruntime-node derleme için)
  - Windows: `npm install -g windows-build-tools` veya Visual Studio Build Tools

### Kurulum

```bash
# Bağımlılıkları yükle
npm install
```

> `postinstall` script'i otomatik olarak `electron-builder install-app-deps` çalıştırarak native modülleri Electron'a uyumlu şekilde derler.

### Geliştirme Modunda Çalıştırma

```bash
npm run dev
```

Bu komut electron-vite dev sunucusunu başlatır ve uygulamayı HMR (Hot Module Replacement) desteğiyle açar.

### Diğer Scriptler

| Script              | Açıklama                          |
| ------------------- | --------------------------------- |
| `npm run dev`       | Geliştirme modu (HMR)             |
| `npm start`         | Üretim build'ini önizleme         |
| `npm run build`     | TypeScript kontrol + üretim build |
| `npm run typecheck` | Sadece TypeScript tip kontrolü    |
| `npm run lint`      | ESLint ile kod analizi            |
| `npm run format`    | Prettier ile kod biçimlendirme    |

---

## 📦 Derleme (Build)

```bash
# Windows (.exe NSIS installer)
npm run build:win

# macOS (.dmg)
npm run build:mac

# Linux (.AppImage, .snap, .deb)
npm run build:linux
```

Derleme çıktısı `out/` dizinindeki üretim build dosyalarını kullanarak `electron-builder` ile paketleme yapar.

---

## 📖 Kullanım Rehberi

### 1. Dataset İçe Aktarma

- Uygulama açıldığında **Dataset Selection** ekranı görünür.
- **Import Dataset** butonuna tıklayarak görsellerin bulunduğu klasörü seçin.
- Desteklenen formatlar: JPG, JPEG, PNG, BMP, WebP.
- Klasördeki tüm görseller otomatik olarak task listesine eklenir.

### 2. Etiketleme Araçlarını Kullanma

1. Sol paneldeki **Labels** bölümünden dinamik yüklenen etiketlerinizi seçin. Local dataset'lerde `+` butonu ile kendinize özel yeni etiketler ekleyebilir, çöpe tıklayarak kullanılmayanları silebilirsiniz. Cloud sözleşmelerinde ise projeye sağlanan etiket havuzu read-only (salt okunur) olarak güvence altına alınır.
2. Toolbar'dan bir araç seçin:
   - **Select**: Mevcut anotasyonları seçmek ve düzenlemek için.
   - **SAM**: Tek tıkla AI destekli otomatik segmentasyon.
   - **Shapes**: BBox, Polygon, Polyline, Circle veya Keypoint seçeneğinden birini kullanarak manuel anotasyon.
3. Canvas üzerine çizim yapın.

### 3. Anotasyon Düzenleme

- **Seçme**: Select modunda bir anotasyona tıklayın.
- **Taşıma**: Seçili anotasyonu sürükleyip bırakın.
- **Boyutlandırma**: BBox köşelerini veya daire yarıçapını sürükleyin.
- **Polygon düzenleme**: Bir polygon üzerine uzun basın → vertex'leri tek tek düzenleyebilirsiniz.
- **Silme**: Seçili anotasyonu `Delete` tuşu veya toolbar'daki silme butonu ile silin.

### 4. SAM ile Otomatik Segmentasyon

1. Toolbar'dan **SAM** aracını seçin.
2. İlk kullanımda model otomatik indirilir (~120 MB).
3. Etiketlemek istediğiniz nesneye tıklayın.
4. SAM, otomatik olarak bir polygon maskesi oluşturur.
5. Oluşan polygon üzerine uzun basarak düzenleyebilirsiniz.

### 5. Kaydetme ve Gönderme

- **Ctrl+S** veya **Save Draft**: Mevcut çalışmayı veritabanına kaydeder.
- **Submit Work**: Tüm görevleri "completed" olarak işaretler (tüm görevlerin incelenmiş olması gerekir).
- Uygulama her 1 dakikada bir otomatik kaydetme yapar.

---

## 💻 Önerilen IDE Ayarları

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

---

## 📄 Lisans

Bu proje bir üniversite bitirme projesi (BIL491) kapsamında geliştirilmektedir.
