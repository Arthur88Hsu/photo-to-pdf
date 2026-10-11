import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPdf, mmToPt, pdfDate, pdfTextString } from '../site/js/pdf.js';

const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

function fakeJpeg(length, seed) {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = (i * 31 + seed) % 256;
  return bytes;
}

test('產生的 PDF 結構正確（交互參照表的位移都指向對應物件）', () => {
  const pages = [
    { jpeg: fakeJpeg(1000, 1), width: 1654, height: 2339 },
    { jpeg: fakeJpeg(777, 2), width: 1654, height: 2339 },
  ];
  const bytes = buildPdf(pages, { widthPt: mmToPt(210), heightPt: mmToPt(297), title: '身分證影本' });
  const text = latin1(bytes);

  assert.ok(text.startsWith('%PDF-1.4\n'));
  assert.ok(text.endsWith('%%EOF\n'));

  const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
  assert.ok(text.startsWith('xref\n', startxref));

  const xref = text.slice(startxref).split('\n');
  const [, count] = xref[1].split(' ').map(Number);
  assert.equal(count, 3 + pages.length * 3 + 1);
  for (let id = 1; id < count; id++) {
    const entry = xref[2 + id];
    assert.match(entry, /^\d{10} 00000 n $/);
    assert.ok(text.startsWith(`${id} 0 obj\n`, Number(entry.slice(0, 10))), `物件 ${id} 位移錯誤`);
  }

  assert.match(text, /\/Type \/Pages \/Kids \[4 0 R 7 0 R\] \/Count 2/);
  assert.match(text, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.match(text, /\/Size 10 \/Root 1 0 R \/Info 3 0 R/);
});

test('JPEG 原封不動地嵌入，/Length 與實際長度相符', () => {
  const jpeg = fakeJpeg(512, 7);
  const bytes = buildPdf([{ jpeg, width: 10, height: 20 }], { widthPt: 100, heightPt: 200 });
  const text = latin1(bytes);
  const match = text.match(/\/Width 10 \/Height 20 .*\/Filter \/DCTDecode \/Length (\d+) >>\nstream\n/);
  assert.ok(match);
  assert.equal(Number(match[1]), jpeg.length);
  const start = match.index + match[0].length;
  assert.deepEqual(bytes.slice(start, start + jpeg.length), jpeg);
  assert.ok(text.startsWith('\nendstream', start + jpeg.length));
});

test('內容串流把影像畫滿整頁', () => {
  const bytes = buildPdf([{ jpeg: fakeJpeg(10, 0), width: 1, height: 1 }], { widthPt: 595.2756, heightPt: 841.8898 });
  const text = latin1(bytes);
  const content = 'q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
  assert.ok(text.includes(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
});

test('沒有頁面時丟出錯誤', () => {
  assert.throws(() => buildPdf([], { widthPt: 1, heightPt: 1 }));
});

test('pdfTextString 以 UTF-16BE 表示中文', () => {
  assert.equal(pdfTextString('證件'), '<FEFF8B494EF6>');
  assert.equal(pdfTextString('A'), '<FEFF0041>');
});

test('pdfDate 格式', () => {
  assert.match(pdfDate(new Date(2026, 9, 11, 14, 30, 5)), /^D:20261011143005[+-]\d{2}'\d{2}'$/);
});

test('mmToPt', () => {
  assert.ok(Math.abs(mmToPt(210) - 595.2756) < 1e-3);
  assert.ok(Math.abs(mmToPt(25.4) - 72) < 1e-9);
});
