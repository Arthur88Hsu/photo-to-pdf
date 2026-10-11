# photo-to-pdf｜證件照轉 PDF

透過拍攝證件照片，將身分證、健保卡、行照、駕照等台灣證件轉換為 PDF 檔（A4 大小），且可輸入文字添加浮水印。
本專案為純前端網頁，透過 GitHub Pages 部署，使用 GitHub Actions 自動部署。

網站網址：<https://arthur88hsu.github.io/photo-to-pdf/>（完成下方「部署」設定後才會生效）

## 功能

- **多種證件**：身分證、健保卡、駕照、行照，以及可自訂尺寸的其他證件；每份證件可放正面、反面
- **拍照或選檔**：手機可直接開相機拍照，桌機可選檔或把照片拖進格子
- **自動拉正**：自動偵測證件邊緣，也可手動拖曳四個角（附放大鏡）；斜拍的照片會做透視校正，並可旋轉
- **實際尺寸排版**：依證件實際大小排到 A4（可放大 150%／200%），正反面可左右並排或上下排列，放不下自動換頁
- **浮水印**：自訂文字、常用範本、自動加日期，可調顏色、不透明度、大小、角度、範圍（只蓋證件或整頁）
- **防竄改**：浮水印直接合成在影像上，無法從 PDF 中單獨刪除
- **輸出**：黑白輸出、三種畫質；手機上可直接「分享」到 LINE、Email 等 App

## 隱私

- 所有處理都在瀏覽器中完成，**照片不會上傳到任何伺服器**
- 網頁設定了 Content-Security-Policy `connect-src 'none'`，瀏覽器會直接阻擋這個網頁發出任何網路連線
- 不使用任何第三方函式庫、CDN、追蹤或分析服務；PDF 產生、透視校正、邊緣偵測都是專案內自行實作，零相依套件

## 專案結構

```
site/                      網站本體（GitHub Pages 只發布這個資料夾）
├── index.html
├── favicon.svg
├── css/style.css
└── js/
    ├── app.js             主程式：狀態、畫面、事件
    ├── cropper.js         裁切編輯器：拖曳四角、旋轉、放大鏡
    ├── detect.js          自動偵測證件邊緣
    ├── geometry.js        透視轉換（homography）與影像拉正
    ├── layout.js          A4 版面配置
    ├── render.js          合成頁面、浮水印、黑白
    ├── pdf.js             極簡 PDF 產生器（JPEG 直接嵌入）
    ├── image.js           照片讀取與畫布工具
    ├── documents.js       證件種類與尺寸
    └── format.js          日期、浮水印文字、檔名
tests/                     單元測試（Node.js 內建 test runner）
.github/workflows/pages.yml  GitHub Actions：測試 → 部署
```

## 本機開發

沒有建置步驟，也不需要安裝任何套件。因為使用 ES modules，需透過本機伺服器開啟（直接點兩下 `index.html` 無法執行）：

```bash
npm start
# 或
python3 -m http.server 8000 --directory site
```

接著開啟 <http://localhost:8000>。

執行單元測試（需要 Node.js 20 以上）：

```bash
npm test
```

> 「分享」按鈕需要 HTTPS 環境才會出現；部署到 GitHub Pages 後就是 HTTPS，可直接用手機開網址測試。

## 部署：GitHub Pages ＋ GitHub Actions

### 一次性設定

1. 到 repo 的 **Settings → Pages → Build and deployment → Source**，選擇 **GitHub Actions**。
   - 沒有這一步，workflow 會在 `Setup Pages` 失敗並顯示 `Get Pages site failed ... Not Found`。
2. 把程式合併到 `main` 分支（push 或合併 Pull Request），就會自動觸發 workflow。
3. 到 **Actions** 分頁查看，`Unit tests` 與 `Deploy to GitHub Pages` 都打勾就完成。
   網址會顯示在 workflow 的 deploy 步驟，以及 **Settings → Pages** 頁面上方。

之後每次 push 到 `main` 都會自動測試並重新部署，不需要再做任何設定。

### workflow 做了什麼（`.github/workflows/pages.yml`）

| 觸發方式 | 單元測試 | 部署 |
| --- | :---: | :---: |
| push 到 `main` | ✅ | ✅ |
| 對 `main` 開 Pull Request | ✅ | — |
| 手動執行（Actions → Run workflow） | ✅ | ✅（在 `main` 上執行時） |

- **Unit tests**：以 Node.js 執行 `npm test`；測試失敗就不會部署。
- **Deploy to GitHub Pages**：只把 `site/` 資料夾打包上傳並部署；權限只開 `pages: write` 與 `id-token: write`。
- **concurrency**：同一時間只會有一個部署在跑，進行中的部署不會被中斷。

### 常見問題

- **`Get Pages site failed`**：Pages 尚未啟用，或 Source 不是 GitHub Actions（見上方步驟 1）。
- **`Branch "xxx" is not allowed to deploy to github-pages due to environment protection rules`**：
  `github-pages` 環境預設只允許 `main` 部署；若要從其他分支部署，到 **Settings → Environments → github-pages** 調整。
- **`Unable to resolve action`**：表示指定的 action 版本不存在，把該行的版本號改回前一版（例如 `@v5` 改 `@v4`）即可。
- **部署成功但網頁沒更新**：GitHub Pages 有約 10 分鐘快取，重新整理（或強制重新整理）即可。

## 證件尺寸

| 證件 | 預設尺寸 |
| --- | --- |
| 身分證、健保卡、駕照 | 85.6 × 54 mm（ISO/IEC 7810 ID-1 標準卡片） |
| 汽車行照 | 145 × 100 mm |
| 機車行照 | 93 × 67 mm |

行照沒有公開的官方規格，以上為參考值。若與手上的證件不符，可在該證件的尺寸選單選「自訂尺寸」，輸入實際量測的長寬。

## 瀏覽器支援

支援近期版本的 Chrome、Edge、Safari（iOS 15.4 以上）、Firefox。
