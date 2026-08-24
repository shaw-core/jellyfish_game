import Phaser from 'phaser';
import { COLORS } from '../config/tuning';

export interface LightSource {
  x: number;
  y: number;
  radius: number;
  /** 0–1，越低边缘越柔 */
  strength?: number;
}

/**
 * 黑暗覆盖层。
 *
 * Zone 1 的设定是"仅有水母自身光源"，所以整张地图盖一层深色，
 * 再用 erase 混合把光源位置挖空。用 RenderTexture 而不是 mask，
 * 是因为光源每帧都在动且数量不定，重建 mask 的开销比重画一次贵。
 */
export class Darkness {
  private rt: Phaser.GameObjects.RenderTexture;
  private brush: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, width: number, height: number) {
    this.rt = scene.add.renderTexture(0, 0, width, height);
    this.rt.setOrigin(0, 0).setDepth(30);

    this.brush = scene.add.image(0, 0, ensureBrush(scene)).setVisible(false);
  }

  setVisible(v: boolean): void {
    this.rt.setVisible(v);
  }

  redraw(lights: LightSource[]): void {
    this.rt.clear();
    this.rt.fill(COLORS.abyss, 0.94);

    for (const l of lights) {
      // 光笔贴图是 256px 的径向渐变，按半径缩放后 erase
      const scale = (l.radius * 2) / 256;
      this.brush.setScale(scale);
      this.brush.setAlpha(l.strength ?? 1);
      this.rt.erase(this.brush, l.x, l.y);
    }
  }

  destroy(): void {
    this.rt.destroy();
    this.brush.destroy();
  }
}

/** 生成一张 256×256 的径向渐变光笔，只做一次 */
function ensureBrush(scene: Phaser.Scene): string {
  const key = 'light-brush';
  if (scene.textures.exists(key)) return key;

  const size = 256;
  const canvas = scene.textures.createCanvas(key, size, size);
  const ctx = canvas!.getContext();
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // 中间全亮，到 60% 处开始快速衰减 —— 边缘太柔会让黑暗失去压迫感
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.92)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  canvas!.refresh();
  return key;
}
