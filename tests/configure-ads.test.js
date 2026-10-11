import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { ADS_CSP, adsTxt, applyAds, parseConfig, toggleAdsText } from '../scripts/configure-ads.mjs';

const SITE = new URL('../site/', import.meta.url);
const read = (name) => readFileSync(new URL(name, SITE), 'utf8');
const ID = 'ca-pub-1234567890123456';
const SLOT = '1234567890';

const SAMPLE = `<html>
  <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'none'" />
  </head>
  <body>
    <span data-ads-off>不使用廣告</span><span data-ads-on hidden>本站有廣告</span>
    <aside class="ad-slot" data-ad-unit hidden><ins class="adsbygoogle" data-ad-client="" data-ad-slot=""></ins></aside>
  </body>
</html>`;

test('設定檔：空白代表不放廣告，格式錯誤會讓部署失敗', () => {
  assert.deepEqual(parseConfig('{"publisherId":"","adSlot":""}'), { publisherId: '', adSlot: '' });
  assert.deepEqual(parseConfig(`{"publisherId":" ${ID} ","adSlot":"${SLOT}"}`), { publisherId: ID, adSlot: SLOT });
  assert.throws(() => parseConfig('{"publisherId":"pub-1234567890123456"}'), /publisherId/);
  assert.throws(() => parseConfig(`{"publisherId":"${ID}","adSlot":"12345"}`), /adSlot/);
  assert.throws(() => parseConfig(`{"adSlot":"${SLOT}"}`), /沒有 publisherId/);
  assert.throws(() => parseConfig('{'));
});

test('repo 裡的 adsense.json 是合法設定', () => {
  assert.doesNotThrow(() => parseConfig(readFileSync(new URL('../adsense.json', import.meta.url), 'utf8')));
});

test('沒有發布商 ID 時完全不改動網頁', () => {
  assert.equal(applyAds(SAMPLE, { publisherId: '', adSlot: '' }), SAMPLE);
});

test('只有發布商 ID（審核中）：載入 AdSense、放寬 CSP、切換說明文字，但不顯示廣告版位', () => {
  const html = applyAds(SAMPLE, { publisherId: ID, adSlot: '' });
  assert.ok(html.includes(`content="${ADS_CSP}"`));
  assert.ok(!html.includes("connect-src 'none'"));
  assert.ok(html.includes(`<meta name="google-adsense-account" content="${ID}" />`));
  assert.ok(html.includes(`adsbygoogle.js?client=${ID}" crossorigin="anonymous"></script>`));
  assert.ok(html.indexOf('adsbygoogle.js') < html.indexOf('</head>'), 'AdSense 程式要放在 <head> 裡');
  assert.ok(html.includes('<span data-ads-off hidden>不使用廣告</span>'));
  assert.ok(html.includes('<span data-ads-on>本站有廣告</span>'));
  assert.ok(html.includes('data-ad-unit hidden'));
  assert.ok(html.includes('data-ad-client="" data-ad-slot=""'));
});

test('有廣告單元 ID：顯示廣告版位並填入 ID', () => {
  const html = applyAds(SAMPLE, { publisherId: ID, adSlot: SLOT });
  assert.ok(html.includes('class="ad-slot" data-ad-unit>'));
  assert.ok(html.includes(`data-ad-client="${ID}" data-ad-slot="${SLOT}"`));
});

test('ads.txt 格式', () => {
  assert.equal(adsTxt(ID), 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
});

test('實際網站：工具頁有 CSP、廣告版位與說明文字的標記，套用廣告設定不會出錯', () => {
  const index = read('index.html');
  assert.equal(index.match(/http-equiv="Content-Security-Policy"/g).length, 1);
  assert.ok(index.includes("connect-src 'none'"), '沒放廣告時要維持禁止連網');
  assert.ok(index.includes('data-ad-unit hidden'));
  assert.ok(index.includes('data-ad-client="" data-ad-slot=""'));
  const html = applyAds(index, { publisherId: ID, adSlot: SLOT });
  assert.ok(!html.includes('data-ads-on hidden'), '廣告說明都要被顯示');
});

test('實際網站：所有 data-ads-on 都寫成「data-ads-on hidden」，切換才會生效', () => {
  for (const name of readdirSync(SITE).filter((file) => file.endsWith('.html'))) {
    const html = read(name);
    const total = html.match(/data-ads-on\b/g)?.length ?? 0;
    const hidden = html.match(/data-ads-on hidden\b/g)?.length ?? 0;
    assert.equal(hidden, total, `${name} 有 data-ads-on 沒有緊接著 hidden`);
    if (total) assert.ok(!toggleAdsText(html).includes('data-ads-on hidden'));
  }
});
