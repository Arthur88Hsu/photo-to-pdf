import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { stampHtml, stampModule } from '../scripts/stamp-version.mjs';

const SITE = new URL('../site/', import.meta.url);

test('HTML：本站的 CSS、JS 加上版本號，外部連結與圖示不變，頁尾填入版本', () => {
  const html = [
    '<link rel="icon" href="favicon.svg" />',
    '<link rel="stylesheet" href="css/style.css" />',
    '<script type="module" src="js/app.js"></script>',
    '<a href="https://github.com/x/y.js">x</a>',
    '<span id="app-version">dev</span>',
  ].join('\n');
  const { html: out, count } = stampHtml(html, 'abc1234');
  assert.equal(count, 2);
  assert.ok(out.includes('href="css/style.css?v=abc1234"'));
  assert.ok(out.includes('src="js/app.js?v=abc1234"'));
  assert.ok(out.includes('href="favicon.svg"'));
  assert.ok(out.includes('href="https://github.com/x/y.js"'));
  assert.ok(out.includes('<span id="app-version">abc1234</span>'));
});

test('JS：相對路徑的 import 加上版本號', () => {
  const source = "import { a } from './a.js';\nimport {\n  b,\n} from \"../lib/b.js\";\nconst url = './c.js';\n";
  const { source: out, count } = stampModule(source, 'v1');
  assert.equal(count, 2);
  assert.ok(out.includes("from './a.js?v=v1'"));
  assert.ok(out.includes('from "../lib/b.js?v=v1"'));
  assert.ok(out.includes("const url = './c.js'"));
});

test('重複執行不會疊加版本號', () => {
  const once = stampModule("import x from './x.js';", 'v1').source;
  assert.equal(stampModule(once, 'v1').source, once);
  const html = stampHtml('<script src="js/app.js"></script>', 'v1').html;
  assert.equal(stampHtml(html, 'v1').count, 0);
});

test('實際網站：index.html 的 CSS、JS 與每個模組的所有 import 都會加上版本號', () => {
  const html = readFileSync(new URL('index.html', SITE), 'utf8');
  const stamped = stampHtml(html, 'v1');
  assert.ok(stamped.html.includes('css/style.css?v=v1'));
  assert.ok(stamped.html.includes('js/app.js?v=v1'));
  assert.ok(stamped.html.includes('id="app-version">v1<'), '頁尾要有 id="app-version" 的版本欄位');

  for (const name of readdirSync(new URL('js/', SITE)).filter((file) => file.endsWith('.js'))) {
    const source = readFileSync(new URL(`js/${name}`, SITE), 'utf8');
    const imports = source.match(/\bfrom\s+['"]\.{1,2}\//g) ?? [];
    assert.equal(stampModule(source, 'v1').count, imports.length, `${name} 有 import 沒加到版本號`);
  }
});
