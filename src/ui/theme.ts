/**
 * 文字样式。
 *
 * 用的是 Ark Pixel Font（OFL 1.1），已子集化到只含游戏实际用到的字，
 * 534KB → 26KB。加了新文案要重跑 `python tools/subset_font.py`，
 * 否则漏掉的字会退化成系统字体 —— 不会崩，但一眼看得出来。
 *
 * 两条像素字体的硬规矩：
 *
 * 1. **字号只能用设计尺寸的整数倍**（12 / 24 / 36）。用 11px 或 13px
 *    会让字形落在非整数像素上，糊得比系统字体还难看。
 * 2. **resolution 要跟着设备像素比取整**。高分屏上画布是按 CSS 像素算的，
 *    不设 resolution 的话浏览器会把 12px 的字拉成 24 设备像素再插值；
 *    取整之后正好是 2 倍整数缩放，像素字体在整数倍下依然锐利。
 */

const RATIO = Math.max(1, Math.round(
  typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
));

export const FONT_FAMILY = '"ArkPixel", ui-monospace, "SF Mono", Menlo, monospace';

export const FONT = {
  fontFamily: FONT_FAMILY,
  resolution: RATIO,
} as const;

/** 只有这三档。别的字号会糊 */
export const SIZE = {
  small: '12px',
  body: '12px',
  heading: '24px',
  title: '36px',
} as const;

export const TEXT_COLOR = {
  biolum: '#70FFE0',
  biolumDim: '#31D6C8',
  bone: '#DFFFF7',
  muted: '#59636B',
  faint: '#25355F',
  rust: '#D8792D',
} as const;

/** 等字体真正可用之后再启动游戏，否则首帧会用系统字体量错宽度 */
export async function waitForFont(timeoutMs = 3000): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const load = Promise.all([
    document.fonts.load('12px ArkPixel'),
    document.fonts.load('24px ArkPixel'),
  ]).then(() => undefined);
  const timeout = new Promise<void>((r) => setTimeout(r, timeoutMs));
  await Promise.race([load, timeout]);
}
