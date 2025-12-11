# label_gun

An Electron application with Vue and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

# LabelGun – Masaüstü Veri Etiketleme Aracı

LabelGun, Electron + Vue 3 + TypeScript + Tailwind ile geliştirilmiş bir **masaüstü veri etiketleme (image annotation) uygulamasıdır**.  
Amaç, görseller üzerinde farklı şekillerle (bbox, polygon, polyline, daire, keypoint vb.) etiketleme yapmayı, bu etiketleri yönetmeyi ve JSON formatında dışa aktarmayı sağlayan modern ve genişletilebilir bir arayüz sunmaktır.

---

## Özellikler

- 🖼️ **Görüntü Üzerinde Etiketleme**
  - Bounding box (dikdörtgen)
  - Polygon
  - Polyline
  - Circle
  - Keypoint (işaret noktası)

- 📋 **Görev Yönetimi (Tasks)**
  - Birden fazla görev (task) desteği
  - Görevler arası ileri/geri geçiş (`Prev / Next`)
  - Her görev için ayrı görüntü yükleme

- 🧾 **Annotation Yönetimi**
  - Sağ panelde tüm anotasyonların listelenmesi
  - Listeden anotasyon seçme
  - Seçilen anotasyonu silme
  - Her anotasyon için tip (bbox, polygon vb.) ve label bilgisi

- ⏪ **Undo / Redo**
  - Annotation değişiklikleri için geçmiş (history) tutma
  - `Undo` ve `Redo` butonları / klavye kısayolları (Ctrl+Z, Ctrl+Y)

- 🔍 **Zoom & Pan**
  - Fare tekerleği ve butonlarla yakınlaştırma/uzaklaştırma
  - Görseli sürükleyerek kaydırma (pan)
  - Ekrana sığdırma (`Fit to Screen`)
  - Görünümü sıfırlama (`Reset View`)

- 🎨 **Tema Altyapısı**
  - Light / Dark tema desteği (CSS ve theme composable hazır)
  - Sistem temasına (OS dark/light) otomatik uyum altyapısı

- 💾 **JSON Dışa Aktarım (Şu An İçin Konsola)**
  - Mevcut tüm anotasyonları JSON olarak üretme
  - Şimdilik tarayıcı konsoluna yazma (F12 ile görüntülenebilir)

---

## Teknoloji Yığını

- **Electron** (main & preload süreçleri)
- **Vue 3** (Composition API ile)
- **TypeScript**
- **Vite** & **electron-vite**
- **Tailwind CSS**
- **vite-svg-loader** (SVG ikonları Vue bileşeni olarak kullanmak için)
- **ESLint** & **Prettier** (kod kalitesi ve biçimlendirme)

---

## Proje Yapısı

Basitleştirilmiş klasör yapısı:

```text
.
├─ src
│  ├─ main/                # Electron main process
│  │  └─ index.ts
│  ├─ preload/             # Preload script (window.electron köprüsü)
│  │  ├─ index.ts
│  │  └─ index.d.ts
│  └─ renderer/
│     ├─ index.html        # Renderer için HTML şablon
│     └─ src/
│        ├─ main.ts        # Vue uygulaması giriş noktası
│        ├─ App.vue        # Kök Vue bileşeni
│        ├─ env.d.ts
│        ├─ views/
│        │  └─ LabelerView.vue
│        ├─ components/
│        │  └─ Versions.vue
│        ├─ composables/
│        │  ├─ useAnnotationsRenderer.ts
│        │  ├─ useCanvasInteractions.ts
│        │  ├─ useCanvasTransform.ts
│        │  ├─ useHistory.ts
│        │  ├─ useKeyboardShortcuts.ts
│        │  ├─ useLabelerState.ts
│        │  ├─ useTasks.ts
│        │  └─ useTheme.ts
│        ├─ types/
│        │  └─ annotation.ts
│        ├─ utils/
│        │  ├─ image.ts
│        │  └─ dom.ts
│        ├─ styles/
│        │  ├─ icons.css
│        │  ├─ labeler-view.css
│        │  └─ tailwind.css
│        └─ assets/
│           ├─ base.css
│           ├─ main.css
│           ├─ wavy-lines.svg
│           ├─ icons/custom/*.svg
│           ├─ icons/material/...
│           ├─ images/road.jpg
│           └─ electron.svg
├─ electron.vite.config.ts
├─ tailwind.config.cjs
├─ postcss.config.cjs
├─ tsconfig.json
├─ tsconfig.node.json
├─ tsconfig.web.json
├─ eslint.config.mjs
├─ electron-builder.yml
├─ dev-app-update.yml
└─ package.json
```
