// 部署前為網站的 CSS、JS 網址加上版本號（cache busting）。
// GitHub Pages 會讓瀏覽器快取檔案 10 分鐘；更新後若新版 HTML 搭配到快取中的舊版 JS／CSS，
// 畫面會錯亂、按鈕也可能沒有反應。加上 ?v=版本 之後，每次部署的網址都不同，就不會混用舊檔。
//
// 用法：node scripts/stamp-version.mjs <網站資料夾> <版本>
// GitHub Actions 部署時會自動執行；本機開發不需要。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** HTML：本站的 .css／.js 加上版本號，並把頁尾的版本換成實際版本 */
export function stampHtml(html, version) {
  let count = 0;
  const stamped = html
    .replace(/((?:href|src)=")((?!https?:|\/\/)[^"?]+\.(?:css|js))(")/g, (_, before, url, after) => {
      count++;
      return `${before}${url}?v=${version}${after}`;
    })
    .replace(/(id="app-version">)[^<]*(<)/, `$1${version}$2`);
  return { html: stamped, count };
}

/** JS 模組：相對路徑的 import 加上版本號，讓每個模組都抓到同一版 */
export function stampModule(source, version) {
  let count = 0;
  const stamped = source.replace(/(\bfrom\s+['"])(\.{1,2}\/[^'"?]+\.js)(['"])/g, (_, before, url, after) => {
    count++;
    return `${before}${url}?v=${version}${after}`;
  });
  return { source: stamped, count };
}

function main(dir, version) {
  if (!dir || !version || !/^[\w.-]+$/.test(version)) {
    console.error('用法：node scripts/stamp-version.mjs <網站資料夾> <版本>');
    process.exit(1);
  }
  let resources = 0;
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.html'))) {
    const file = path.join(dir, name);
    const html = stampHtml(readFileSync(file, 'utf8'), version);
    writeFileSync(file, html.html);
    resources += html.count;
  }
  if (resources === 0) throw new Error('HTML 裡找不到要加版本號的 CSS／JS');

  let imports = 0;
  const jsDir = path.join(dir, 'js');
  for (const name of readdirSync(jsDir).filter((file) => file.endsWith('.js'))) {
    const file = path.join(jsDir, name);
    const result = stampModule(readFileSync(file, 'utf8'), version);
    writeFileSync(file, result.source);
    imports += result.count;
  }
  console.log(`版本 ${version}：HTML ${resources} 個資源、JS ${imports} 個 import 已加上版本號`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2], process.argv[3]);
}
