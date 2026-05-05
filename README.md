# LabelGun – Masaüstü Görsel Veri Etiketleme Uygulaması

**LabelGun**, görüntü verileri üzerinde profesyonel düzeyde anotasyon (etiketleme) yapmak için geliştirilmiş, **Electron + Vue 3 + TypeScript + Tailwind CSS** tabanlı bir **masaüstü (desktop) uygulamasıdır**. SAM (Segment Anything Model) yapay zekâ entegrasyonu ile tek tıkla otomatik segmentasyon, Konva.js tabanlı yüksek performanslı canvas, SQLite yerel veritabanı ve çoklu anotasyon aracı desteği sunar.

---

## 📋 İçindekiler

- [Özellikler](#özellikler)
- [Teknoloji Yığını](#teknoloji-yığını)
- [Mimari Genel Bakış](#mimari-genel-bakış)
- [Proje Yapısı](#proje-yapısı)
- [Veritabanı Şeması](#veritabanı-şeması)
- [IPC Kanalları](#ipc-kanalları)
- [Composable Mimarisi](#composable-mimarisi)
- [Kurulum ve Çalıştırma](#kurulum-ve-çalıştırma)
- [Derleme Build](#derleme-build)
- [Kullanım Kılavuzu](#kullanım-kılavuzu)
- [Önerilen IDE Ayarları](#önerilen-ide-ayarları)
- [Lisans](#lisans)

---

## 🚀 Özellikler

### 🖼️ Görüntü Üzerinde Etiketleme

LabelGun, görüntü verileri üzerinde farklı anotasyon tipleriyle çalışmayı destekler:

| Araç             | Açıklama                                                        |
| ---------------- | --------------------------------------------------------------- |
| **Bounding Box** | Dikdörtgen çerçeve çizerek nesne sınırlama kutusu oluşturma     |
| **Polygon**      | Çokgen çizerek karmaşık şekilli nesneleri segmentleme           |
| **Polyline**     | Çoklu çizgi çekerek yol, sınır vb. doğrusal yapıları işaretleme |
| **Circle**       | Daire çizerek dairesel nesneleri etiketleme                     |
| **Keypoint**     | Tekil nokta işaretleyerek önemli konumları belirtme             |

### 🤖 SAM Segment Anything Model AI Entegrasyonu

- Tek tıkla otomatik segmentasyon desteği.
- SAM ViT-B ONNX modeli encoder + decoder dosyalarının otomatik indirilmesi.
- Encoder ve decoder dosyaları için gerçek zamanlı indirme ilerlemesi gösterimi.
- `onnxruntime-node` ile yerel ortamda inferans.
- Aynı görsel üzerinde tekrar tekrar encoder çalıştırılmasını önleyen bellek içi (in-memory) embedding cache yapısı.
- Var olan polygon anotasyonlarının içine tıklandığında gereksiz SAM isteğinin engellenmesi.
- **Akıllı Prefetch Stratejisi:** Gelişmiş bir arka plan kuyruk sistemi ile kullanıcının aktif görseline ek olarak, 1 önceki ve 2 sonraki görsel için otomatik embedding hesaplaması yapılır.
- **In-flight Deduplication:** Aynı görsel için hem arka plan prefetch işlemi hem de kullanıcının tıklaması denk gelirse, gereksiz çift hesaplamayı önlemek için aktif işlem (promise) yeniden kullanılır. Bu durum tekrarlanan encoder iş yükünü azaltır ve uygulamanın tepkiselliğini artırır.
- **Polygon Optimizasyonu (RDP):** SAM maskesi kapalı bir çokgen (polygon) olarak Ramer-Douglas-Peucker algoritması ile basitleştirilir. Yakın noktalar temizlenir ve maksimum 120 nokta sınırı uygulanır. Bu iyileştirme canvas performansını artırır ve export boyutunu düşürür.
- **Hata Toleranslı Kuyruk Yönetimi:** Okunamayan veya eksik görsellerin prefetch kuyruğunu tıkamasını önlemek için görevler en fazla 2 kez denenir (MAX_PREFETCH_JOB_ATTEMPTS), ardından başarısız görevler düşürülür.
- **IPC Serileştirme Koruması:** SAM noktaları ve etiketleri, Electron IPC üzerinden gönderilmeden önce Vue/Konva reaktif yapılarından arındırılıp yalın (plain) objelere dönüştürülerek serileştirme hataları önlenir.

### 💾 Yerel Veritabanı SQLite ve Kalıcı Depolama

- `better-sqlite3` ile senkron ve yüksek performanslı yerel veritabanı.
- WAL Write-Ahead Logging modu ile okuma/yazma optimizasyonu.
- Dataset, media ve anotasyon tabloları ile yerel veri yönetimi.
- Uygulama açılışında eksik sütunlar için otomatik migrasyon desteği.
- Anotasyonların JSON formatında media bazında saklanması.

### ⏱️ Otomatik Kaydetme ve Süre Takibi

- 1 dakikada bir otomatik kaydetme.
- Save Draft butonu üzerinde otomatik kaydetmeye kalan süreyi gösteren progress halkası.
- Task bazlı çalışma süresi takibi.
- Global çalışma süresi takibi.
- Kayıt sonrası görsel geri bildirim.

### ⏪ Undo / Redo Sistemi

- JSON snapshot tabanlı geçmiş yönetimi.
- Global `Ctrl + Z` / `Ctrl + Y` desteği.
- Edit modu için ayrı undo/redo geçmişi.
- Transform sonrası geçmişe otomatik kayıt.

### 🔍 Zoom, Pan ve Canvas Kontrolü

- Konva.js tabanlı yüksek performanslı canvas.
- `Ctrl + Scroll` ile zoom.
- Sağ tık ile pan.
- Zoom In / Zoom Out butonları.
- Fit to Screen desteği.
- Reset View işlemi.
- Crosshair ve koordinat göstergesi.

### ☁️ Bulut Senkronizasyonu ve İş Akışı

- Sözleşme Contract tabanlı çalışma.
- Kiralama Lease mekanizması.
- Cookie tabanlı sürekli oturum yönetimi.
- Contract Health üzerinden sağlık ve hata durumu takibi.
- Payload hash ile duplicate submission engelleme.
- Full snapshot modeli ile eksiksiz görev teslimi.
- IPC seviyesinde API response normalizasyonu.
- Datasets / Contracts / Profile sekmelerinden oluşan Workspace mimarisi.
- `active`, `overdue` ve `revision_requested` durumundaki sözleşmeler için çalışma desteği.
- Revizyon istenen sözleşmelerde yeniden senkronizasyon akışı.
- Eş zamanlı sync koruması.
- Health yüklenmeden Submit Work aksiyonunun kilitlenmesi.

### 📋 Görev Yönetimi

- Dataset tabanlı task sistemi.
- Yerel görev durumları: `Queued`, `In Progress`, `Completed`.
- Görev bazlı sync badge gösterimi.
- Önceki/sonraki görev navigasyonu.
- Anotasyon cache koruması.
- Veritabanından anotasyon geri yükleme.
- Dataset izolasyonu.
- Yerel tamamlama ve cloud submit akışlarının ayrılması.

### 🎨 Tema ve Görünüm

- Light / Dark tema desteği.
- Sistem temasını otomatik algılama.
- `localStorage` ile tema tercihi kalıcılığı.
- Merkezi anotasyon renk paleti.
- Dinamik stroke width ayarı.

### 🔔 Gelişmiş Geri Bildirim Sistemi

- Toast bildirimleri.
- Özel modal diyaloglar.
- Native `alert` / `confirm` yerine tema uyumlu özel diyalog sistemi.
- Diyalog açıkken arka plan klavye kısayollarının izole edilmesi.
- XSS riskine karşı güvenli metin interpolasyonu.

### 🖥️ Özel Çerçevesiz Pencere

- Custom frameless title bar.
- Minimize, Maximize/Restore ve Close butonları.
- Sürüklenebilir title bar alanı.
- Workspace modalına hızlı dönüş butonu.

### 🔀 Dataset İçe Aktarma ve Yönetimi

- Yerel klasör seçici.
- `.jpg`, `.jpeg`, `.png`, `.bmp`, `.webp` desteği.
- Aynı klasörün tekrar eklenmesini engelleyen kontrol.
- Dataset silme sırasında cascade temizlik.
- Yerel dosyalar için özel `local://` protokolü.

### 📦 Local Dataset Dışa Aktarma (Export)

- Local dataset projeleri için masaüstünden direkt dışa aktarma (export) imkânı.
- Desteklenen formatlar: **COCO JSON**, **YOLO ZIP** (shape-metadata.json destekli) ve **Pascal VOC ZIP** (XML).
- Multi-shape desteği (BBox, Polygon, Polyline, Keypoint, Circle).
- Derived Bounding Box mekanizması: Tüm şekillerin (polygon vb.) resim sınırlarına (image bounds) göre otomatik sınırlanıp (clamp) geçerli bbox formatına indirgenmesi.
- **Bulut Güvenliği Koruması**: Sadece local datasetlerde export yapılabilir. `cloud` tabanlı projelerde export tamamen (UI ve IPC düzeyinde) engellenir. İş verenin web panelinden alınması gerektiği vurgulanır.

### 🏷️ Dinamik Etiket Label Mimarisi

- Cloud ve local dataset etiketlerinin ayrıştırılması.
- Cloud sözleşmelerinde read-only etiket havuzu.
- Local datasetlerde kullanıcı tarafından yönetilebilir etiketler.
- Kullanımda olan etiketlerin güvenli şekilde silinmesinin engellenmesi.
- Hardcode sınıf listesinden bağımsız dinamik yapı.

---

## 🛡️ Kararlılık, Güvenlik ve Senkronizasyon İyileştirmeleri

LabelGun üzerinde yapılan son geliştirmelerle uygulamanın güvenliği, veri tutarlılığı ve bulut senkronizasyon akışı güçlendirilmiştir.

Bu kapsamda:

- Anotasyon listesindeki potansiyel XSS riski giderilmiş, kullanıcıdan veya ağdan gelen metinlerin güvenli şekilde render edilmesi sağlanmıştır.
- Yerel görev tamamlama sırasında aktif anotasyonların SQLite veritabanına eksiksiz kaydedilmesi güvence altına alınmıştır.
- Local dataset ve cloud task senaryoları için `sync_status` yönetimi ayrıştırılmıştır.
- `revision_requested` durumundaki sözleşmeler için yeniden indirme ve yeniden senkronizasyon akışı iyileştirilmiştir.
- `active`, `overdue` ve `revision_requested` durumundaki sözleşmeler çalışılabilir kabul edilecek şekilde desteklenmiştir.
- `syncManager` eş zamanlı çalışmaya karşı güvenli hale getirilmiş, aynı anda birden fazla sync döngüsü başlatılması engellenmiştir.
- Submit Work işlemi, Contract Health verisi yüklenmeden veya sözleşme gönderime hazır olmadan çalışmayacak şekilde güçlendirilmiştir.
- Native `alert` / `confirm` kullanımları yerine tema uyumlu toast ve dialog sistemi kullanılmaya başlanmıştır.
- Sözleşme durumları için merkezi formatlama ve rozet renklendirme yapısı eklenmiştir.

**SAM Performans ve Stabilite Güncellemeleri:**
- Model değişikliği sırasında "in-flight" (henüz tamamlanmamış) encoder görevleri ve cache temizlenerek eski modele ait embedding kirliliğinin önüne geçilmiştir.
- Eksik veya okunamayan dosyaların arka plan prefetch kuyruğunu sürekli meşgul etmesini önleyen retry limit (maksimum 2 deneme) mekanizması eklenmiştir.
- SAM inferans işlemi sırasında oluşan "object could not be cloned" IPC serileştirme hataları düzeltilmiştir.

Tüm bu iyileştirmeler `npm run typecheck` komutu ile doğrulanmıştır.

## 🏗️ Teknoloji Yığını

| Katman                 | Teknolojiler                                             |
| ---------------------- | -------------------------------------------------------- |
| **Desktop Framework**  | Electron 38 Chromium + Node.js                           |
| **Frontend Framework** | Vue 3 Composition API, `<script setup>`                  |
| **Programlama Dili**   | TypeScript 5 strict                                      |
| **Build Sistemi**      | Vite 7 + electron-vite 4                                 |
| **Canvas Kütüphanesi** | Konva.js 9 + vue-konva 3                                 |
| **CSS Framework**      | Tailwind CSS 3 + PostCSS + Autoprefixer                  |
| **Veritabanı**         | SQLite better-sqlite3 12                                 |
| **AI / ML Çıkarım**    | ONNX Runtime Node 1.23 SAM ViT-B                         |
| **Görüntü İşleme**     | Jimp 0.22 resize, normalize, pixel access                |
| **Ağ / Oturum**        | Axios + tough-cookie + axios-cookiejar-support           |
| **SVG İkonlar**        | vite-svg-loader 5 SVG → Vue bileşeni                     |
| **Kod Kalitesi**       | ESLint 9 + Prettier 3                                    |
| **Paketleme**          | electron-builder 25 NSIS / DMG / AppImage / deb / snap   |

---

## 🧱 Mimari Genel Bakış

LabelGun üç ana Electron katmanından oluşur:

```text
┌─────────────────────────────────────────────────────────────────┐
│                       RENDERER PROCESS                           │
│  Vue 3 + Konva.js + Tailwind CSS                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  App.vue  Workspace Hub — 3-Tab Modal                    │   │
│  │  ┌─────────────┐  ┌──────────────────┐  ┌────────────┐  │   │
│  │  │ Datasets Tab │  │ Contracts Tab     │  │Profile Tab │  │   │
│  │  │ local mgmt   │  │ ContractsPanel.vue│  │ProfilePanel│  │   │
│  │  └─────────────┘  └──────────────────┘  └────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │  LabelerView.vue      │  │  KonvaCanvas.vue             │    │
│  │  Ana Etiketleme       │  │  2D Canvas – Konva.js        │    │
│  └──────────────────────┘  └──────────────────────────────┘    │
│                                                                  │
│  composables/ — useAuth, useCloud, useLabelerToolState,          │
│                  useLabelerSamManager, useTasks                 │
├─────────────────────────────────────────────────────────────────┤
│                   PRELOAD Bridge                                │
│  contextBridge → window.api { db, sam, dataset, cloud, auth,     │
│                               window }                          │
├─────────────────────────────────────────────────────────────────┤
│                     MAIN PROCESS                                │
│  ┌────────────┐  ┌──────────┐  ┌──────────────────────────┐   │
│  │ SQLite DB   │  │ SAM Model │  │ IPC Handlers             │   │
│  │ better-     │  │ ONNX      │  │ dbIpc + samIpc +          │   │
│  │ sqlite3     │  │ Runtime   │  │ authIpc + cloudTasksIpc   │   │
│  └────────────┘  └──────────┘  └──────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────┐                          │
│  │  syncManager.ts                  │                          │
│  │  30s interval — pending_insert   │                          │
│  │  → POST /tasks/:id/submit        │                          │
│  └──────────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

**Veri akışı:**

1. Renderer, `window.api.*` üzerinden IPC çağrıları yapar.
2. Preload, `ipcRenderer.invoke()` ile main process'e mesaj iletir.
3. Main process, `ipcMain.handle()` ile DB sorguları veya SAM çıkarımı yapar ve sonuçları döner. Ana süreç (main process) ayrıca SAM decoder oturumunu, bellek içi embedding cache yönetimini, in-flight deduplication mantığını ve arka plan prefetch kuyruğunu koordine ederken, ağır encoder işlemleri worker iş parçacığına (thread) devredilir.

---

## 📁 Proje Yapısı

```text
label_gun/
├── src/
│   ├── main/                          # Electron Main Process
│   │   ├── index.ts                   # Uygulama giriş noktası, pencere oluşturma,
│   │   │                              # local:// protocol, dataset folder picker
│   │   ├── api/                       # API istemcisi ve Bulut entegrasyonu REST + IPC
│   │   │   ├── apiClient.ts           # Axios tabanlı API istemcisi ve cookie yönetimi
│   │   │   ├── authIpc.ts             # Kimlik doğrulama işlemleri IPC köprüsü
│   │   │   └── cloudTasksIpc.ts       # Bulut görevleri, sözleşme verisi çekme işlemleri
│   │   ├── sync/
│   │   │   └── syncManager.ts         # Arka planda DB ile Cloud arasında anotasyon senkronizasyonu
│   │   ├── export/                    # Local Dataset dışa aktarma (export) işlemleri
│   │   │   ├── cocoLocal.export.ts    # COCO JSON format export algoritması
│   │   │   ├── localExport.helpers.ts # Ortak validation, geometri (derived bbox) vb. yardımcılar
│   │   │   ├── localExport.types.ts   # Tip ve veri yapıları tanımlamaları
│   │   │   ├── vocLocal.export.ts     # Pascal VOC (XML ZIP) format export algoritması
│   │   │   └── yoloLocal.export.ts    # YOLO (TXT ZIP) format export algoritması
│   │   ├── samModel.ts                # SAM Decoder, bellek içi embedding cache, in-flight
│   │   │                              # deduplication, prefetch kuyruğu ve RDP polygon optimizasyonu
│   │   ├── db/
│   │   │   └── sqlite.ts              # SQLite bağlantısı, şema, migrasyon
│   │   ├── ipc/
│   │   │   ├── dbIpc.ts               # Veritabanı IPC handler'ları CRUD
│   │   │   ├── exportIpc.ts           # Local Dataset export IPC (cloud korumalı)
│   │   │   └── samIpc.ts              # SAM model IPC handler'ları
│   │   ├── utils/
│   │   │   └── hashUtil.ts            # Veri bütünlüğü için hashing yardımcıları
│   │   └── workers/
│   │       └── samWorker.ts           # SAM Encoder modelini main thread'i engellemeden çalıştıran Worker
│   │
│   ├── preload/                       # Electron Preload Renderer ↔ Main köprüsü
│   │   ├── index.ts                   # contextBridge – API'yi renderer'a açar
│   │   └── index.d.ts                 # TypeScript tip tanımları window.api
│   │
│   └── renderer/                      # Vue 3 Frontend Renderer Process
│       ├── index.html                 # Renderer HTML şablonu
│       └── src/
│           ├── main.ts                # Vue uygulaması giriş noktası + VueKonva plugin
│           ├── App.vue                # Kök bileşen: Workspace Hub 3-Tab modal,
│           │                          # custom title bar, bootstrapSession + fetchContracts
│           ├── env.d.ts               # Vite / SVG / Vue ortam tip tanımları
│           │
│           ├── views/
│           │   └── LabelerView.vue    # Ana etiketleme ekranı orchestrator
│           │
│           ├── components/
│           │   ├── labeler/
│           │   │   ├── TaskSidebar.vue
│           │   │   ├── LabelerHeader.vue
│           │   │   ├── LabelerToolbar.vue
│           │   │   ├── CanvasWorkspace.vue
│           │   │   ├── AnnotationsPanel.vue
│           │   │   ├── LabelsPanel.vue
│           │   │   └── SamModelMenu.vue
│           │   ├── ui/
│           │   │   ├── DialogHost.vue
│           │   │   └── ToastHost.vue
│           │   ├── ContractsPanel.vue
│           │   ├── ProfilePanel.vue
│           │   ├── CloudPanel.vue
│           │   ├── KonvaCanvas.vue
│           │   └── Versions.vue
│           │
│           ├── composables/
│           │   ├── useAuth.ts
│           │   ├── useCloud.ts
│           │   ├── useFeedback.ts
│           │   ├── useDatasetLabeling.ts
│           │   ├── useLabelerState.ts
│           │   ├── useLabelerToolState.ts
│           │   ├── useLabelerEditSession.ts
│           │   ├── useLabelerSamManager.ts
│           │   ├── useLabelerTaskSession.ts
│           │   ├── useLabelerAutoSave.ts
│           │   ├── useLabelerActions.ts
│           │   ├── useHistory.ts
│           │   ├── useCanvasTransform.ts
│           │   ├── useCanvasInteractions.ts
│           │   ├── useAnnotationsRenderer.ts
│           │   ├── useKeyboardShortcuts.ts
│           │   ├── useTasks.ts
│           │   └── useTheme.ts
│           │
│           ├── types/
│           │   └── annotation.ts
│           │
│           ├── theme/
│           │   └── annotationPalette.ts
│           │
│           ├── utils/
│           │   ├── image.ts
│           │   └── dom.ts
│           │
│           ├── styles/
│           │   ├── tailwind.css
│           │   ├── labeler-view.css
│           │   └── icons.css
│           │
│           └── assets/
│               ├── base.css
│               ├── fonts.css
│               ├── main.css
│               ├── fonts/
│               ├── images/
│               └── icons/custom/
│
├── electron.vite.config.ts
├── electron-builder.yml
├── tailwind.config.cjs
├── postcss.config.cjs
├── tsconfig.json / .node.json / .web.json
├── eslint.config.mjs
├── package.json
└── build/
```

---

## 🗃️ Veritabanı Şeması

Uygulama yerel bir SQLite veritabanı kullanır:

```text
%APPDATA%/label_gun/db/app.sqlite
```

### `datasets` Tablosu

| Sütun                | Tip           | Açıklama                           |
| -------------------- | ------------- | ---------------------------------- |
| `id`                 | TEXT PK       | Dataset benzersiz kimliği          |
| `name`               | TEXT          | Kullanıcıya görünen isim           |
| `folder_path`        | TEXT UNIQUE   | Kaynak klasör yolu                 |
| `cloud_contract_id`  | TEXT          | Senkronize edilen bulut sözleşmesi |
| `label_source`       | TEXT          | Etiket Kaynağı `cloud` / `local`   |
| `annotation_format`  | TEXT          | Etiketleme formatı                 |
| `labeling_spec_json` | TEXT          | Yönergeler ve UI meta verileri     |
| `qc_mode`            | TEXT          | Kalite kontrol durumu              |
| `label_set_name`     | TEXT          | Etiket seti genel adı              |
| `label_set_version`  | INTEGER       | Etiket seti sürümü                 |
| `created_at`         | INTEGER       | Oluşturulma zamanı Unix ms         |

### `dataset_labels` Tablosu

Dataset'e özel dinamik etiket yapılandırmaları. Cloud dataset'lerinde salt okunurdur, Local dataset'lerinde kullanıcı tarafından yönetilebilir.

| Sütun                    | Tip       | Açıklama                                |
| ------------------------ | --------- | --------------------------------------- |
| `id`                     | TEXT PK   | Etiket kimliği                          |
| `dataset_id`             | TEXT FK   | Bağlı olduğu dataset                    |
| `name`                   | TEXT      | Etiket adı                              |
| `color`                  | TEXT      | Hex renk kodu                           |
| `attributes_schema_json` | TEXT      | Alt özellik tanımları JSON formatında   |
| `source`                 | TEXT      | Etiket kaynağı `cloud` veya `local`     |
| `created_at`             | INTEGER   | Oluşturulma tarihi                      |
| `updated_at`             | INTEGER   | Son güncellenme tarihi                  |

### `media_items` Tablosu

| Sütun                | Tip       | Açıklama                                    |
| -------------------- | --------- | ------------------------------------------- |
| `id`                 | TEXT PK   | Görselin benzersiz kimliği                  |
| `dataset_id`         | TEXT FK   | Bağlı olduğu dataset                        |
| `local_path`         | TEXT      | Dosyanın yerel yolu                         |
| `sha256`             | TEXT      | Dosya hash'i                                |
| `width`              | INTEGER   | Görsel genişliği px                         |
| `height`             | INTEGER   | Görsel yüksekliği px                        |
| `status`             | TEXT      | Durum: `in_progress` / `completed`          |
| `annotation_seconds` | INTEGER   | Bu görselde harcanan toplam süre            |
| `cloud_task_id`      | TEXT      | Bulut görev kimliği                         |
| `cloud_asset_id`     | TEXT      | Bulut görsel varlığı kimliği                |
| `contract_id`        | TEXT      | İlgili sözleşme ID                          |
| `cloud_asset_url`    | TEXT      | Varlık indirilirken kullanılan URL          |
| `sync_status`        | TEXT      | Senkronizasyon durumu                       |
| `download_status`    | TEXT      | Görsel indirme durumu                       |
| `last_error`         | TEXT      | Son hata mesajı                             |
| `created_at`         | INTEGER   | Oluşturulma zamanı Unix ms                  |
| `updated_at`         | INTEGER   | Son güncelleme zamanı Unix ms               |

### `annotations` Tablosu

| Sütun              | Tip       | Açıklama                                                        |
| ------------------ | --------- | --------------------------------------------------------------- |
| `id`               | TEXT PK   | Anotasyon kimliği                                               |
| `media_id`         | TEXT FK   | Bağlı olduğu görsel                                             |
| `type`             | TEXT      | Tip: `bbox`, `polygon`, `keypoint`, `circle`, `export`          |
| `category`         | TEXT      | Kategori/sınıf adı                                              |
| `data_json`        | TEXT      | Anotasyon verisinin JSON formatı                                |
| `cloud_task_id`    | TEXT      | İlişkili bulut görevi ID                                        |
| `contract_id`      | TEXT      | İlişkili sözleşme ID                                            |
| `payload_json`     | TEXT      | API'ye gönderilecek JSON yükü                                   |
| `payload_hash`     | TEXT      | Gönderilecek verinin SHA-256 hash özeti                         |
| `last_synced_hash` | TEXT      | Başarıyla senkronize edilmiş son veri hash'i                    |
| `sync_status`      | TEXT      | Senkronizasyon durumu                                           |
| `attempt_count`    | INTEGER   | Yeniden deneme sayısı                                           |
| `last_error`       | TEXT      | Senkronizasyon hatası                                           |
| `updated_at`       | INTEGER   | Son güncelleme zamanı Unix ms                                   |

### `task_leases` Tablosu

Cloud sync işlemleri sırasında görevleri diğer labeler'lara karşı kilitlemek için kullanılır.

| Sütun          | Tip       | Açıklama                                     |
| -------------- | --------- | -------------------------------------------- |
| `task_id`      | TEXT PK   | Görev ID'si                                  |
| `contract_id`  | TEXT      | Sözleşme ID'si                               |
| `lease_token`  | TEXT      | Sunucudaki kilit için atanan güvenlik jetonu |
| `leased_until` | INTEGER   | Kiralama süresi bitişi                       |
| `created_at`   | INTEGER   | Oluşturulma tarihi                           |
| `updated_at`   | INTEGER   | Güncelleme tarihi                            |

---

## 📡 IPC Kanalları

### Veritabanı Kanalları `dbIpc.ts`

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
| `db:media:upsert`                   | invoke | Görsel ekleme veya güncelleme UPSERT                   |
| `db:media:listByDataset`            | invoke | Dataset'e ait görselleri listeleme                     |
| `db:media:setStatus`                | invoke | Görsel durumunu güncelleme                             |
| `db:media:setTime`                  | invoke | Görselde harcanan süreyi kaydetme                      |
| `db:annotations:saveExport`         | invoke | Dışa aktarılmış JSON anotasyonu kaydetme               |
| `db:annotations:getExport`          | invoke | Kaydedilmiş anotasyonu geri yükleme                    |

### Local Export Kanalları `exportIpc.ts`

| Kanal                   | Yön          | Açıklama                                             |
| ----------------------- | ------------ | ---------------------------------------------------- |
| `export:localDataset`   | invoke       | Local dataset'i (COCO, YOLO, VOC) olarak dışa aktarır|

### SAM Model Kanalları `samIpc.ts`

| Kanal                   | Yön          | Açıklama                                             |
| ----------------------- | ------------ | ---------------------------------------------------- |
| `sam:status`            | invoke       | Mevcut model durumunu sorgulama                      |
| `sam:isInstalled`       | invoke       | Model dosyalarının indirilip indirilmediğini kontrol |
| `sam:download`          | invoke       | SAM modelini Hugging Face'ten indirme                |
| `sam:ensureReady`       | invoke       | ONNX session'larını hazırlama                        |
| `sam:run`               | invoke       | Verilen noktalarla SAM çıkarımı yapma                |
| `sam:download-progress` | send event   | İndirme ilerlemesi bildirimi                         |

### Auth ve Cloud Kanalları `authIpc.ts` / `cloudTasksIpc.ts`

| Kanal                         | Yön    | Açıklama                                                       |
| ----------------------------- | ------ | -------------------------------------------------------------- |
| `auth:login`                  | invoke | Bulut hesabına giriş yapar ve doğrulanmış kullanıcıyı döner    |
| `auth:bootstrapSession`       | invoke | Var olan cookie'leri kullanarak oturumu yeniler/doğrular       |
| `auth:logout`                 | invoke | Bulut hesabından çıkış yapar ve yerel cookie'leri temizler     |
| `cloud:fetchContracts`        | invoke | Kullanıcıya atanmış sözleşmeleri listeler                      |
| `cloud:downloadContractWork`  | invoke | Kiralama lease-batch ve asset indirme akışını yürütür          |
| `cloud:syncNow`               | invoke | Bekleyen anotasyonları anında senkronize eder                  |
| `cloud:getContractHealth`     | invoke | Sözleşme için senkronizasyon ve hata sağlığını hesaplar        |
| `cloud:recoverExpiredTasks`   | invoke | Süresi dolmuş görevleri yeniden indirilmeye hazırlar           |
| `cloud:resetContractLocalState` | invoke | Sözleşmeye ait yerel verileri DB ve dosyadan siler             |
| `cloud:submitContract`        | invoke | Görevleri API'ye teslim eder                                   |

### Pencere ve Sistem Kanalları

| Kanal                   | Yön    | Açıklama                                           |
| ----------------------- | ------ | -------------------------------------------------- |
| `window:minimize`       | invoke | Pencereyi küçültme                                 |
| `window:toggleMaximize` | invoke | Pencereyi büyütme/küçültme                         |
| `window:close`          | invoke | Pencereyi kapatma                                  |
| `dataset:pickFolder`    | invoke | Klasör seçme diyalogu açma + görselleri filtreleme |

---

## 🧩 Composable Mimarisi

| Composable               | Sorumluluk |
| ------------------------ | ---------- |
| `useAuth`                | Singleton kullanıcı oturum yönetimi. Login, logout, bootstrapSession ve cookie entegrasyonu sağlar. |
| `useCloud`               | Singleton cloud state yönetimi. Sözleşme çekme, indirme, sağlık takibi, recover, submit ve reset işlemlerini yönetir. |
| `useFeedback`            | Uygulama genelinde özel diyalog ve toast bildirimlerini yönetir. |
| `useDatasetLabeling`     | Dataset etiket havuzu yükleme, aktif etiket seçimi ve cloud/local izin izolasyonunu yönetir. |
| `useLabelerState`        | Merkezi reaktif durum yönetimini sağlar. |
| `useHistory`             | JSON snapshot ile undo/redo geçmişini yönetir. |
| `useCanvasTransform`     | Zoom, pan ve fit-to-screen hesaplamalarını yönetir. |
| `useCanvasInteractions`  | Mouse event handler'larını yönetir. |
| `useAnnotationsRenderer` | Konva.js anotasyon render, dışa aktarım, seçim ve silme işlemlerini yönetir. |
| `useKeyboardShortcuts`   | Global klavye kısayollarını yönetir. |
| `useTasks`               | Task listesi ve task arası navigasyonu yönetir. |
| `useLabelerActions`      | Undo, redo, delete, draft kaydetme ve toplu submit aksiyonlarını yönetir. |
| `useTheme`               | Light/dark tema yönetimini sağlar. |

| Etiketleme Ekranı Mantık Modülleri | Sorumluluk |
| ---------------------------------- | ---------- |
| `useLabelerToolState` | Aktif araç yönetimi, imleç güncellemeleri ve toolbar etkileşimleri. |
| `useLabelerEditSession` | Polygon/şekil düzenleme modu state'i ve yerel undo/redo geçmişi. |
| `useLabelerSamManager` | SAM modellerinin indirilmesi, durum takibi ve AI çıkarım koordinasyonu. |
| `useLabelerTaskSession` | Görevler arası geçiş, görüntü yükleme ve bellek içi anotasyon cache yönetimi. |
| `useLabelerAutoSave` | Global/task bazlı sayaçlar, otomatik kayıt döngüsü ve DB persistency. |

---

## 🛠️ Kurulum ve Çalıştırma

### Gereksinimler

- Node.js ≥ 18
- npm ≥ 9
- Python 3.x
- C++ Build Tools

Windows için Visual Studio Build Tools kurulumu gerekebilir.

### Kurulum

```bash
npm install
```

`postinstall` script'i otomatik olarak `electron-builder install-app-deps` çalıştırarak native modülleri Electron'a uyumlu şekilde derler.

### Geliştirme Modunda Çalıştırma

```bash
npm run dev
```

Bu komut electron-vite dev sunucusunu başlatır ve uygulamayı HMR Hot Module Replacement desteğiyle açar.

### Diğer Scriptler

| Script              | Açıklama                          |
| ------------------- | --------------------------------- |
| `npm run dev`       | Geliştirme modu HMR               |
| `npm start`         | Üretim build'ini önizleme         |
| `npm run build`     | TypeScript kontrol + üretim build |
| `npm run typecheck` | Sadece TypeScript tip kontrolü    |
| `npm run lint`      | ESLint ile kod analizi            |
| `npm run format`    | Prettier ile kod biçimlendirme    |

---

## 📦 Derleme Build

```bash
# Windows .exe NSIS installer
npm run build:win

# macOS .dmg
npm run build:mac

# Linux .AppImage, .snap, .deb
npm run build:linux
```

Derleme çıktısı `out/` dizinindeki üretim build dosyalarını kullanarak `electron-builder` ile paketleme yapar.

---

## 📖 Kullanım Kılavuzu

Uygulamanın kullanım adımları ayrı bir dosyada açıklanmıştır:

[LabelGun Kullanım Kılavuzu](./USAGE.md)

---

## 💻 Önerilen IDE Ayarları

- VSCode
- ESLint eklentisi
- Prettier eklentisi
- Volar eklentisi

---

## 📄 Lisans

Bu proje bir üniversite bitirme projesi BIL491 kapsamında geliştirilmektedir.