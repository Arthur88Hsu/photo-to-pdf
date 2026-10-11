# photo-to-pdf｜證件照轉 PDF

透過拍攝證件照片，將身分證、健保卡、行照、駕照等台灣證件轉換為 PDF 檔（A4 大小），且可輸入文字添加浮水印。
本專案為純前端網頁，透過 GitHub Pages 部署，使用 GitHub Actions 自動部署。

網站網址：<https://arthur88hsu.github.io/photo-to-pdf/>（完成下方「部署」設定後才會生效）

## 功能

- **多種證件**：身分證、健保卡、駕照、行照、存摺（只需封面），以及可自訂尺寸的其他證件；證件可放正面、反面
- **拍照或從相簿選擇**：手機上每一面都有「拍照」（直接開啟後鏡頭）與「從相簿選擇」兩個按鈕；桌機可選檔或把照片拖進格子
- **自動拉正**：自動偵測證件邊緣，也可手動拖曳四個角（附放大鏡）；斜拍的照片會做透視校正，並可旋轉
- **實際尺寸排版**：依證件實際大小排到 A4（可放大 150%／200%），正反面可左右並排或上下排列，放不下自動換頁
- **浮水印**：自訂文字、常用範本、自動加日期，可調顏色、不透明度、大小、角度、範圍（只蓋證件或整頁）
- **防竄改**：浮水印直接合成在影像上，無法從 PDF 中單獨刪除
- **輸出**：黑白輸出、三種畫質；手機上可直接「分享」到 LINE、Email 等 App

## 隱私

- 所有處理都在瀏覽器中完成，**照片不會上傳到任何伺服器**
- 不使用任何第三方函式庫或 CDN；PDF 產生、透視校正、邊緣偵測都是專案內自行實作，零相依套件
- **未啟用廣告時**：網頁設定了 Content-Security-Policy `connect-src 'none'`，瀏覽器會直接阻擋這個網頁發出任何網路連線，也沒有任何追蹤或分析服務
- **啟用 Google AdSense 後**（見下方「廣告」）：工具頁會載入 Google 的廣告程式，安全設定只保留不影響廣告的部分（`object-src`、`base-uri`、`form-action`），頁面上的說明文字與[隱私權政策](site/privacy.html)會自動改成有廣告的版本。照片仍然不會被本站上傳或提供給任何人

## 專案結構

```
site/                      網站本體（GitHub Pages 只發布這個資料夾）
├── index.html             工具頁
├── privacy.html           隱私權政策
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
scripts/
├── configure-ads.mjs      部署時依 adsense.json 設定 Google AdSense
└── stamp-version.mjs      部署時為 CSS、JS 網址加上版本號（避免快取到舊檔）
adsense.json               AdSense 發布商 ID 與廣告單元 ID（空白＝不放廣告）
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
- **Deploy to GitHub Pages**：依 `adsense.json` 設定廣告、替 CSS、JS 網址加上這次的版本號（例如 `app.js?v=df37eaa`），再只把 `site/` 資料夾打包上傳並部署；權限只開 `pages: write` 與 `id-token: write`。
- **concurrency**：同一時間只會有一個部署在跑，進行中的部署不會被中斷。

### 常見問題

- **`Get Pages site failed`**：Pages 尚未啟用，或 Source 不是 GitHub Actions（見上方步驟 1）。
- **`Branch "xxx" is not allowed to deploy to github-pages due to environment protection rules`**：
  `github-pages` 環境預設只允許 `main` 部署；若要從其他分支部署，到 **Settings → Environments → github-pages** 調整。
- **`Unable to resolve action`**：表示指定的 action 版本不存在，把該行的版本號改回前一版（例如 `@v5` 改 `@v4`）即可。
- **部署成功但網頁沒更新**：瀏覽器可能還在用快取的舊網頁，重新整理即可。頁尾會顯示目前載入的版本（commit 前 7 碼），可以和最新的 commit 對照。
- **更新後畫面錯亂、按鈕沒反應**：新版網頁搭配到快取中的舊版 JS／CSS 才會這樣。部署時已自動在網址加上版本號避免這個問題；若仍發生，關掉分頁重新開啟即可。

## 廣告：Google AdSense ＋ 自訂網域

AdSense 只接受頂層網域，`ads.txt` 也必須放在網域根目錄，所以要先替網站綁定自訂網域。

### 1. 綁定自訂網域

1. 向任一網域商購買網域（例如 `example.com` 或 `example.tw`）。
2. 在網域商的 DNS 設定新增下列紀錄：

   | 類型 | 名稱 | 值 |
   | --- | --- | --- |
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `arthur88hsu.github.io` |

3. 到 repo 的 **Settings → Pages → Custom domain** 輸入網域（例如 `example.com`）並按 **Save**，等 DNS 檢查通過後勾選 **Enforce HTTPS**。
   使用 GitHub Actions 部署時不需要 `CNAME` 檔案。

完成後網站會在 `https://example.com/`，`ads.txt` 會在 `https://example.com/ads.txt`。

### 2. 申請 AdSense

1. 到 <https://adsense.google.com> 用自訂網域申請，取得發布商 ID（`ca-pub-` 加 16 位數字）。
2. 把 ID 填進 `adsense.json` 的 `publisherId`，push 到 `main`。部署時會自動加上網站驗證程式碼與 `ads.txt`。
3. 回到 AdSense 確認網站並送出審核，通常需要幾天到 2～4 週。審核期間不要移除網站重新申請，會拖慢審核。

### 3. 審核通過後放上廣告

1. 在 AdSense 的 **廣告 → 依廣告單元 → 多媒體廣告** 建立一個「回應式」廣告單元，複製程式碼中的 `data-ad-slot`（10 位數字）。
2. 填進 `adsense.json` 的 `adSlot`，push 到 `main`，工具頁「版面設定」下方就會出現廣告。

```json
{
  "publisherId": "ca-pub-1234567890123456",
  "adSlot": "1234567890"
}
```

> 注意：不要點擊自己網站的廣告，也不要請別人點擊，否則 AdSense 帳號可能被停權。收益累積到 100 美元才會付款。

## 證件尺寸

| 證件 | 預設尺寸 |
| --- | --- |
| 身分證、健保卡、駕照 | 85.6 × 54 mm（ISO/IEC 7810 ID-1 標準卡片） |
| 汽車行照 | 145 × 100 mm |
| 機車行照 | 93 × 67 mm |
| 存摺（只有封面） | 140 × 90 mm |

行照、存摺沒有公開的官方規格（存摺各銀行也略有不同），以上為參考值。若與手上的證件不符，可在該證件的尺寸選單選「自訂尺寸」，輸入實際量測的長寬。

## 瀏覽器支援

支援近期版本的 Chrome、Edge、Safari（iOS 15.4 以上）、Firefox。
