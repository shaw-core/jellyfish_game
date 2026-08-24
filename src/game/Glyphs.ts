import Phaser from 'phaser';

/**
 * 古代机械语言的 8 个词根。
 *
 * 正式贴图（美术需求 C-03）还没到，这里先程序画。用 Unicode 里那些
 * 数学符号顶替是最差的方案 —— Ark Pixel 根本不收录 ⊐⋔⌇ 这类字形，
 * 会退化成系统字体，而且它们本来就不该是"别人的字"。
 *
 * 设计原则沿用需求书：楔形文字 + 早期象形偏旁 + 电路逻辑门符号的融合。
 * 每个词根都在 16×16 的单位格里定义，画的时候整体缩放。
 *
 * 重要：这 8 个是玩家后面真的要学会读的，所以构成必须有规律 ——
 * 「熄灭」是「生命」加一道贯穿的斜线，「等待」是「连接」去掉中间那根线。
 * 玩家在 Zone 3 之前就该能自己猜出这层关系。
 */

export type GlyphId =
  | 'energy' | 'connect' | 'lock' | 'core'
  | 'ruin' | 'wait' | 'life' | 'extinguish';

export const GLYPH_MEANING: Record<GlyphId, string> = {
  energy: '能量 / 流动',
  connect: '连接 / 通行',
  lock: '锁闭 / 终止',
  core: '意识 / 核心',
  ruin: '崩解 / 沉降',
  wait: '等待',
  life: '生命',
  extinguish: '熄灭',
};

type Stroke =
  | { t: 'line'; pts: number[] }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: boolean }
  | { t: 'circle'; x: number; y: number; r: number; fill?: boolean };

const G: Record<GlyphId, Stroke[]> = {
  // 三条波折线 + 右向分叉箭头
  energy: [
    { t: 'line', pts: [2, 4, 6, 2, 10, 4] },
    { t: 'line', pts: [2, 8, 6, 6, 10, 8] },
    { t: 'line', pts: [2, 12, 6, 10, 10, 12] },
    { t: 'line', pts: [10, 4, 14, 8, 10, 12] },
  ],
  // 两个相互咬合的空心方环，中间一条发光短线穿透
  connect: [
    { t: 'rect', x: 2, y: 4, w: 6, h: 8 },
    { t: 'rect', x: 8, y: 4, w: 6, h: 8 },
    { t: 'line', pts: [5, 8, 11, 8] },
  ],
  // 实心正方形被斜向裂纹贯穿
  lock: [
    { t: 'rect', x: 3, y: 3, w: 10, h: 10, fill: true },
    { t: 'line', pts: [2, 14, 7, 8, 5, 6, 14, 2] },
  ],
  // 类似眼眸的同心圆，内部由多重正弦波填充
  core: [
    { t: 'circle', x: 8, y: 8, r: 6 },
    { t: 'circle', x: 8, y: 8, r: 3 },
    { t: 'line', pts: [5, 8, 6.5, 6.5, 8, 8, 9.5, 9.5, 11, 8] },
  ],
  // 向下汇聚的多重箭头 + 破碎齿轮轮廓
  ruin: [
    { t: 'line', pts: [3, 2, 8, 8, 13, 2] },
    { t: 'line', pts: [3, 7, 8, 13, 13, 7] },
    { t: 'line', pts: [6, 14, 8, 12, 10, 14] },
  ],
  // 「连接」去掉中间那根穿透线 —— 两个环还在，但没有通路
  wait: [
    { t: 'rect', x: 2, y: 4, w: 6, h: 8 },
    { t: 'rect', x: 8, y: 4, w: 6, h: 8 },
    { t: 'circle', x: 8, y: 8, r: 0.8, fill: true },
  ],
  // 一个核 + 向外辐射的短笔画
  life: [
    { t: 'circle', x: 8, y: 8, r: 3, fill: true },
    { t: 'line', pts: [8, 1, 8, 4] },
    { t: 'line', pts: [8, 12, 8, 15] },
    { t: 'line', pts: [1, 8, 4, 8] },
    { t: 'line', pts: [12, 8, 15, 8] },
    { t: 'line', pts: [3.5, 3.5, 5.5, 5.5] },
    { t: 'line', pts: [12.5, 12.5, 10.5, 10.5] },
  ],
  // 「生命」加一道贯穿的斜线
  extinguish: [
    { t: 'circle', x: 8, y: 8, r: 3 },
    { t: 'line', pts: [8, 1, 8, 4] },
    { t: 'line', pts: [1, 8, 4, 8] },
    { t: 'line', pts: [12, 8, 15, 8] },
    { t: 'line', pts: [2, 14, 14, 2] },
  ],
};

export const GLYPH_IDS = Object.keys(G) as GlyphId[];

/**
 * 正式贴图 ancient_glyphs_sheet 的帧号。
 * 前 8 帧是未激活态，后 8 帧是注入电流的激活态，顺序与 GLYPH_IDS 一致。
 */
export function glyphFrame(id: GlyphId, active: boolean): number {
  return GLYPH_IDS.indexOf(id) + (active ? 8 : 0);
}

/**
 * 把一个词根画到 Graphics 上。
 * x/y 是左上角，size 是边长（16 的整数倍最锐利）。
 */
export function drawGlyph(
  g: Phaser.GameObjects.Graphics,
  id: GlyphId,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha = 1,
): void {
  const k = size / 16;
  const px = (v: number) => x + v * k;
  const py = (v: number) => y + v * k;

  g.lineStyle(Math.max(1, Math.round(k)), color, alpha);
  g.fillStyle(color, alpha);

  for (const s of G[id]) {
    if (s.t === 'line') {
      g.beginPath();
      g.moveTo(px(s.pts[0]), py(s.pts[1]));
      for (let i = 2; i < s.pts.length; i += 2) g.lineTo(px(s.pts[i]), py(s.pts[i + 1]));
      g.strokePath();
    } else if (s.t === 'rect') {
      if (s.fill) g.fillRect(px(s.x), py(s.y), s.w * k, s.h * k);
      else g.strokeRect(px(s.x), py(s.y), s.w * k, s.h * k);
    } else {
      if (s.fill) g.fillCircle(px(s.x), py(s.y), s.r * k);
      else g.strokeCircle(px(s.x), py(s.y), s.r * k);
    }
  }
}

/** 画一整面碑文。返回用到的词根，方便上层记录玩家见过什么 */
export function drawGlyphWall(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  cols: number,
  rows: number,
  size: number,
  gap: number,
  color: number,
  alpha: number,
  seed = 7,
): GlyphId[] {
  const step = size + gap;
  const w = cols * step - gap;
  const h = rows * step - gap;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;

  // 固定序列，不用随机 —— 同一面墙每次进入都该长得一样
  const used: GlyphId[] = [];
  let s = seed;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const id = GLYPH_IDS[s % GLYPH_IDS.length];
      drawGlyph(g, id, x0 + c * step, y0 + r * step, size, color, alpha);
      used.push(id);
    }
  }
  return used;
}
