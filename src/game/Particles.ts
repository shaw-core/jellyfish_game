import Phaser from 'phaser';
import { COLORS } from '../config/tuning';

type Kind = 'bubble' | 'mote' | 'silt' | 'spark' | 'intake';

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  /** 摆动相位，让气泡上浮时左右晃 */
  phase: number;
  /** intake 用：被吸向的目标 */
  targetX?: number;
  targetY?: number;
}

/**
 * 手写的粒子系统。
 *
 * 没用 Phaser 的 ParticleEmitter —— 这里要的几种行为（被吸向移动中的
 * 目标、气泡上浮时的正弦摆动、按相机视野补充的海雪）都得改每帧的运动，
 * 用发射器配置绕不过去，自己写反而更短也更好调。
 *
 * 全部粒子用一个 Graphics 一次画完，加法混合。数量控制在几百个以内，
 * 每帧重画的开销比维护几百个 GameObject 低。
 */
export class Particles {
  private items: Particle[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private moteTimer = 0;

  constructor(scene: Phaser.Scene, depth = 18) {
    this.gfx = scene.add.graphics().setDepth(depth);
    this.gfx.setBlendMode(Phaser.BlendModes.ADD);
  }

  private push(p: Particle): void {
    // 硬上限，防止长时间游玩后堆积
    if (this.items.length > 420) this.items.shift();
    this.items.push(p);
  }

  /* ---------------------------------------------------------------- */
  /* 发射                                                              */
  /* ---------------------------------------------------------------- */

  /** 喷射尾流：朝反方向喷一簇气泡，数量和速度跟蓄力量走 */
  thrust(x: number, y: number, facing: number, power: number): void {
    const n = 6 + Math.round(power * 14);
    for (let i = 0; i < n; i++) {
      const spread = (Math.random() - 0.5) * 0.9;
      const a = facing + Math.PI + spread;
      const speed = (40 + Math.random() * 130) * (0.5 + power);
      this.push({
        kind: 'bubble',
        x: x + Math.cos(a) * 8,
        y: y + Math.sin(a) * 8,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.5 + Math.random() * 0.7,
        maxLife: 1.2,
        size: 1 + Math.random() * 2.4,
        color: Math.random() < 0.3 ? COLORS.bone : COLORS.biolum,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  /** 蓄力吸入：周围的微粒被拽向伞盖，视觉上解释"能量在积蓄" */
  intake(x: number, y: number, amount: number): void {
    const a = Math.random() * Math.PI * 2;
    const r = 46 + Math.random() * 40;
    this.push({
      kind: 'intake',
      x: x + Math.cos(a) * r,
      y: y + Math.sin(a) * r,
      vx: 0,
      vy: 0,
      life: 0.55,
      maxLife: 0.55,
      size: 1 + Math.random() * 1.2 + amount,
      color: COLORS.biolumDim,
      phase: 0,
      targetX: x,
      targetY: y,
    });
  }

  /** 撞墙：一小撮沉积物被扬起来 */
  bump(x: number, y: number, strength: number): void {
    const n = 3 + Math.round(strength * 10);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 70 * strength;
      this.push({
        kind: 'silt',
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.6 + Math.random() * 0.8,
        maxLife: 1.4,
        size: 1 + Math.random() * 1.6,
        color: 0x5a4b86,
        phase: 0,
      });
    }
  }

  /** 电弧火花 */
  spark(x: number, y: number): void {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 120;
      this.push({
        kind: 'spark',
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.12 + Math.random() * 0.18,
        maxLife: 0.3,
        size: 1 + Math.random() * 1.4,
        color: COLORS.gold,
        phase: 0,
      });
    }
  }

  /** 脉冲冲击波：一圈向外扩散的亮点 */
  pulse(x: number, y: number, radius: number): void {
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.1;
      const speed = radius / 0.55;
      this.push({
        kind: 'bubble',
        x: x + Math.cos(a) * 12,
        y: y + Math.sin(a) * 12,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.55,
        maxLife: 0.55,
        size: 1.6 + Math.random() * 1.6,
        color: COLORS.biolum,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  /* ---------------------------------------------------------------- */

  /**
   * 海雪：按相机视野持续补充漂浮微粒。
   *
   * 这层的作用不是好看，是让"水"变成可见的介质 —— 没有它，
   * 玩家在空旷处移动时没有任何参照物，会觉得自己没在动。
   */
  private replenishMotes(dt: number, view: Phaser.Geom.Rectangle): void {
    this.moteTimer -= dt;
    if (this.moteTimer > 0) return;
    this.moteTimer = 0.06;

    const count = this.items.reduce((n, p) => n + (p.kind === 'mote' ? 1 : 0), 0);
    if (count > 90) return;

    for (let i = 0; i < 3; i++) {
      this.push({
        kind: 'mote',
        x: view.x + Math.random() * view.width,
        y: view.y + Math.random() * view.height,
        vx: (Math.random() - 0.5) * 6,
        vy: -2 - Math.random() * 6,
        life: 4 + Math.random() * 6,
        maxLife: 10,
        size: Math.random() < 0.75 ? 1 : 2,
        color: COLORS.slate,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  update(dt: number, view: Phaser.Geom.Rectangle, time: number): void {
    this.replenishMotes(dt, view);

    const g = this.gfx;
    g.clear();

    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }

      switch (p.kind) {
        case 'bubble':
          // 阻力拖住 + 浮力上浮 + 正弦摆动
          p.vx *= 1 - 2.6 * dt;
          p.vy = p.vy * (1 - 2.6 * dt) - 26 * dt;
          p.x += (p.vx + Math.sin(time / 220 + p.phase) * 9) * dt;
          p.y += p.vy * dt;
          break;

        case 'intake': {
          // 加速吸向目标，越近越快
          const dx = (p.targetX ?? p.x) - p.x;
          const dy = (p.targetY ?? p.y) - p.y;
          const d = Math.max(6, Math.hypot(dx, dy));
          const pull = 900 / d;
          p.vx += (dx / d) * pull * dt;
          p.vy += (dy / d) * pull * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        }

        case 'silt':
          p.vx *= 1 - 3.2 * dt;
          p.vy = p.vy * (1 - 3.2 * dt) + 14 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;

        case 'spark':
          p.vx *= 1 - 5 * dt;
          p.vy = p.vy * (1 - 5 * dt) + 60 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;

        case 'mote':
          p.x += (p.vx + Math.sin(time / 900 + p.phase) * 3) * dt;
          p.y += p.vy * dt;
          break;
      }

      // 视野外的粒子不画，但保留在数组里（相机会转回来）
      if (p.x < view.x - 40 || p.x > view.right + 40
        || p.y < view.y - 40 || p.y > view.bottom + 40) continue;

      const t = p.life / p.maxLife;
      const alpha = p.kind === 'mote'
        ? Math.min(0.5, t * 1.4) * 0.6
        : Math.min(1, t * 1.8);

      g.fillStyle(p.color, alpha);
      g.fillCircle(p.x, p.y, p.size * (0.4 + t * 0.6));
    }
  }

  /** 重生时清场，否则死亡瞬间的碎屑会跟着传送过去 */
  clearTransient(): void {
    this.items = this.items.filter((p) => p.kind === 'mote');
  }

  get count(): number {
    return this.items.length;
  }
}
