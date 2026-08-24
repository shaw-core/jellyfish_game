import Phaser from 'phaser';
import { COLORS, type Tuning } from '../config/tuning';
import { TILE } from '../level/level1';

/* ------------------------------------------------------------------ */
/* 漏电线缆 —— 只在放电帧造成伤害                                       */
/* ------------------------------------------------------------------ */

export class Conduit {
  readonly sprite: Phaser.GameObjects.Sprite;

  /**
   * 放电帧由 tools/fix_assets.py 按金色电弧像素自动检测得到（0-based 19–21）。
   * R3 的 engine_manifest 只声明了喷口的伤害帧，电缆的漏了。
   */
  constructor(
    scene: Phaser.Scene,
    public x: number,
    public y: number,
    private damageFrames: number[],
    private tagStart: number,
    hasAnims: boolean,
  ) {
    this.sprite = scene.add.sprite(x, y, hasAnims ? 'enemies' : 'conduit-placeholder');
    this.sprite.setDepth(14);
    // 顶边对齐：断线是挂着的，不是浮在水里的
    this.sprite.setOrigin(0.5, 0);
    if (hasAnims) this.sprite.play('conduit_spark');
  }

  get live(): boolean {
    const idx = this.sprite.anims?.currentFrame?.index;
    if (idx === undefined) return false;
    // Phaser 的 frame index 从 1 开始，且是 Tag 内的相对序号
    return this.damageFrames.includes(this.tagStart + idx - 1);
  }

  hits(px: number, py: number, r: number): boolean {
    // 判定区跟着贴图往下挪半格，对齐实际垂下来的那截线
    return this.live && Math.hypot(px - this.x, py - (this.y + 20)) < 20 + r;
  }
}

/* ------------------------------------------------------------------ */
/* 地热排气口 —— 向上的推力区                                           */
/* ------------------------------------------------------------------ */

export class Vent {
  readonly sprite: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, public x: number, public y: number, hasAnims: boolean) {
    this.sprite = scene.add.sprite(x, y - 24, hasAnims ? 'vent' : 'vent-placeholder');
    this.sprite.setDepth(12);
    this.sprite.setOrigin(0.5, 1);
    if (hasAnims) this.sprite.play('thermal_vent');
  }

  /** 返回本帧施加给目标的加速度 */
  force(px: number, py: number, t: Tuning): number {
    const dx = Math.abs(px - this.x);
    const dy = this.y - py;
    if (dx > t.ventWidth || dy < -TILE || dy > t.ventHeight) return 0;
    // 越靠近喷口越强，边缘处衰减到 0
    const falloff = 1 - Phaser.Math.Clamp(dy / t.ventHeight, 0, 1);
    const lateral = 1 - Phaser.Math.Clamp(dx / t.ventWidth, 0, 1);
    return -t.ventForce * falloff * lateral;
  }
}

/* ------------------------------------------------------------------ */
/* 光敏继电器 —— 被 Pulse 照到即激活                                     */
/* ------------------------------------------------------------------ */

export class Relay {
  active = false;
  private glow: Phaser.GameObjects.Arc;
  private ring: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, public x: number, public y: number) {
    this.ring = scene.add.circle(x, y, 11).setStrokeStyle(2, COLORS.relayOff).setDepth(13);
    this.glow = scene.add.circle(x, y, 5, COLORS.relayOff).setDepth(13);
  }

  /** Pulse 命中判定：必须在爆发半径内 */
  tryActivate(px: number, py: number, radius: number): boolean {
    if (this.active) return false;
    if (Math.hypot(px - this.x, py - this.y) > radius) return false;
    this.active = true;
    this.ring.setStrokeStyle(2, COLORS.relayOn);
    this.glow.setFillStyle(COLORS.relayOn);
    return true;
  }

  update(time: number): void {
    const pulse = this.active ? 1 : 0.45 + Math.sin(time / 420) * 0.25;
    this.glow.setScale(pulse);
    this.ring.setAlpha(this.active ? 1 : 0.55);
  }
}

/* ------------------------------------------------------------------ */
/* 水压闸门                                                            */
/* ------------------------------------------------------------------ */

export class Gate {
  open = false;
  private sprite: Phaser.GameObjects.Sprite;

  constructor(
    scene: Phaser.Scene,
    private cells: { x: number; y: number }[],
    private hasFrames: boolean,
  ) {
    // 闸门贴图是 64×64，正好覆盖 2×2 格 —— 关卡里也按 2×2 挖的洞，
    // 所以整扇门只用一个 sprite，不要每格一张（那样会看到四个门）
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2 * TILE;
    const cy = (Math.min(...ys) + Math.max(...ys) + 1) / 2 * TILE;

    this.sprite = scene.add.sprite(cx, cy, hasFrames ? 'gate' : '__DEFAULT');
    this.sprite.setDepth(13);
    if (hasFrames) this.sprite.setFrame('pressure_gate_000_open.aseprite');
    else this.sprite.setDisplaySize(TILE * 2, TILE * 2).setTint(0x8b4513);
  }

  /** 关闭时闸门格视为实心 */
  blocks(cx: number, cy: number): boolean {
    return !this.open && this.cells.some((c) => c.x === cx && c.y === cy);
  }

  setOpen(scene: Phaser.Scene): void {
    if (this.open) return;
    this.open = true;
    if (!this.hasFrames) {
      scene.tweens.add({ targets: this.sprite, alpha: 0.1, duration: 500 });
      return;
    }
    this.sprite.play('gate_open');
  }
}
