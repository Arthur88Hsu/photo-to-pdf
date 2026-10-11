// 證件種類與尺寸（單位：mm）。
// 身分證、健保卡、駕照為 ISO/IEC 7810 ID-1 卡片尺寸（與信用卡相同）。
// 行照、存摺沒有公開的官方規格（存摺各銀行也略有不同），以下為參考值；
// 若與手上的證件不同，可在畫面上選「自訂尺寸」。

export const SIZE_PRESETS = [
  { id: 'card', label: '標準卡片', widthMm: 85.6, heightMm: 54, radiusMm: 3.18 },
  { id: 'car', label: '汽車行照', widthMm: 145, heightMm: 100, radiusMm: 0 },
  { id: 'scooter', label: '機車行照', widthMm: 93, heightMm: 67, radiusMm: 0 },
  { id: 'passbook', label: '存摺', widthMm: 140, heightMm: 90, radiusMm: 0 },
];

const BOTH_SIDES = ['正面', '反面'];

export const DOC_TYPES = [
  { id: 'id-card', label: '身分證', icon: 'i-id', preset: 'card', sides: BOTH_SIDES },
  { id: 'nhi-card', label: '健保卡', icon: 'i-health', preset: 'card', sides: BOTH_SIDES },
  { id: 'driver-license', label: '駕照', icon: 'i-license', preset: 'card', sides: BOTH_SIDES },
  { id: 'vehicle-license', label: '行照', icon: 'i-car', preset: 'car', sides: BOTH_SIDES },
  // 存摺只需要封面（有戶名、帳號的那一面），不用反面
  { id: 'passbook', label: '存摺', icon: 'i-bank', preset: 'passbook', sides: ['封面'] },
  { id: 'other', label: '其他證件', icon: 'i-doc', preset: 'card', sides: BOTH_SIDES },
];

/** 自訂尺寸允許的範圍（mm） */
export const CUSTOM_SIZE_LIMITS = { min: 20, max: 297 };

export function findPreset(id) {
  return SIZE_PRESETS.find((preset) => preset.id === id);
}
