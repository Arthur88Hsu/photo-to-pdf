// 部署時依 adsense.json 設定 Google AdSense 廣告。
//
// 沒有填發布商 ID：完全不改動網站，維持「禁止任何網路連線」的安全設定、不載入任何廣告程式。
// 填了發布商 ID：
//   - index.html 載入 AdSense 程式並加上網站驗證用的 meta
//   - 放寬 index.html 的安全設定（CSP），讓廣告程式能運作
//   - 所有頁面把「不使用廣告／追蹤」的文字換成廣告說明（data-ads-off → data-ads-on）
//   - 產生 ads.txt
// 再填了廣告單元 ID（adSlot）：顯示工具頁的廣告版位。
//
// 用法：node scripts/configure-ads.mjs <網站資料夾> <設定檔>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ADSENSE_SCRIPT = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

// Google 官方只支援以 nonce 為基礎的 CSP，需要伺服器每次回應時產生亂數，GitHub Pages 這種靜態網站做不到；
// 自己列網域白名單又會隨 Google 調整而失效、在不知不覺中擋掉廣告。
// 所以廣告模式只保留不會影響廣告的防護：禁止外掛物件、禁止竄改 <base>、禁止表單送出。
export const ADS_CSP = "object-src 'none'; base-uri 'none'; form-action 'none'";

/** 讀取並檢查設定；格式錯誤時直接丟出錯誤，讓部署失敗而不是放上壞掉的廣告 */
export function parseConfig(text) {
  const { publisherId = '', adSlot = '' } = JSON.parse(text);
  const id = String(publisherId).trim();
  const slot = String(adSlot).trim();
  if (id && !/^ca-pub-\d{16}$/.test(id)) {
    throw new Error(`adsense.json 的 publisherId 格式不對：「${id}」，應為 ca-pub- 加 16 位數字`);
  }
  if (slot && !/^\d{10}$/.test(slot)) {
    throw new Error(`adsense.json 的 adSlot 格式不對：「${slot}」，應為 10 位數字`);
  }
  if (slot && !id) throw new Error('adsense.json 有 adSlot 但沒有 publisherId');
  return { publisherId: id, adSlot: slot };
}

function replaceOnce(html, pattern, replacement, what) {
  if (!pattern.test(html)) throw new Error(`HTML 裡找不到${what}`);
  return html.replace(pattern, replacement);
}

/** 顯示有廣告時的說明文字（data-ads-on），隱藏沒廣告時的（data-ads-off） */
export function toggleAdsText(html) {
  return html
    .replace(/\sdata-ads-on hidden(?=[\s/>])/g, ' data-ads-on')
    .replace(/\sdata-ads-off(?=[\s/>])/g, ' data-ads-off hidden');
}

/** 工具頁：放寬 CSP、載入 AdSense、切換說明文字，有廣告單元 ID 時顯示廣告版位 */
export function applyAds(html, { publisherId, adSlot }) {
  if (!publisherId) return html;
  let out = replaceOnce(
    html,
    /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/,
    `$1${ADS_CSP}$2`,
    ' CSP 設定',
  );
  out = replaceOnce(
    out,
    /(\n\s*)<\/head>/,
    `$1  <meta name="google-adsense-account" content="${publisherId}" />` +
      `$1  <script async src="${ADSENSE_SCRIPT}?client=${publisherId}" crossorigin="anonymous"></script>` +
      '$1</head>',
    ' </head>',
  );
  out = toggleAdsText(out);
  if (adSlot) {
    out = replaceOnce(out, /\sdata-ad-unit hidden(?=[\s/>])/, ' data-ad-unit', '廣告版位（data-ad-unit）');
    out = replaceOnce(
      out,
      /data-ad-client="" data-ad-slot=""/,
      `data-ad-client="${publisherId}" data-ad-slot="${adSlot}"`,
      '廣告單元（<ins class="adsbygoogle">）',
    );
  }
  return out;
}

/** ads.txt 內容：宣告 Google 是本站授權的廣告銷售者 */
export function adsTxt(publisherId) {
  return `google.com, ${publisherId.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`;
}

function main(dir, configPath) {
  if (!dir || !configPath) {
    console.error('用法：node scripts/configure-ads.mjs <網站資料夾> <設定檔>');
    process.exit(1);
  }
  const config = parseConfig(readFileSync(configPath, 'utf8'));
  if (!config.publisherId) {
    console.log('adsense.json 沒有設定 publisherId：不放廣告，維持禁止連網的安全設定');
    return;
  }
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.html'))) {
    const file = path.join(dir, name);
    const html = readFileSync(file, 'utf8');
    writeFileSync(file, name === 'index.html' ? applyAds(html, config) : toggleAdsText(html));
  }
  writeFileSync(path.join(dir, 'ads.txt'), adsTxt(config.publisherId));
  console.log(
    `已設定 AdSense（${config.publisherId}）` +
      (config.adSlot ? `，廣告單元 ${config.adSlot}` : '，尚未設定廣告單元：只放驗證用的程式碼'),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2], process.argv[3]);
}
