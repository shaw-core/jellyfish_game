import Phaser from 'phaser';
import { type DebugFlags, type Tuning } from '../config/tuning';
import { TILE, type LevelData } from '../level/level1';

export type SwimState = 'idle' | 'charge' | 'thrust' | 'recover' | 'glide';

export interface JellyfishInput {
  charging: boolean;
  turn: number;
  aimAngle: number | null;
  pulse: boolean;
}

/**
 * 主角水母。
 *
 * 物理是手写的，没走 Arcade Physics：水下手感的核心是阻力曲线 ——
 * 高速要衰减得快（阻力 ∝ v²），低速要几乎不衰减（保留漂移余韵）。
 * Arcade 的 drag 是线性模型，做不出这个差异。
 *
 * 渲染只用 idle / pulse 两个 Tag 的原始帧。charge / thrust / glide 的
 * 帧体积在 Tag 内部剧烈波动（见 README「资产问题」），直接播放会看到
 * 主角忽大忽小，所以改用程序化压扁/拉伸。调试开关可以切回原始帧。
 */
export class Jellyfish {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly velocity = new Phaser.Math.Vector2(0, 0);
  facing = -Math.PI / 2;

  state: SwimState = 'idle';
  charge = 0;
  health = 3;
  invuln = 0;

  /** Pulse 剩余时间与冷却 */
  pulseTimer = 0;
  pulseCooldown = 0;
  /** 本帧撞墙的强度（撞击前速度 / maxSpeed），供音效与震屏使用 */
  bumpStrength = 0;

  private stateTimer = 0;
  private currentAnim = '';

  constructor(scene: Phaser.Scene, x: number, y: number, private hasAnims: boolean) {
    this.sprite = scene.add.sprite(x, y, hasAnims ? 'jelly' : 'jelly-placeholder');
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setDepth(20);
  }

  get x(): number { return this.sprite.x; }
  get y(): number { return this.sprite.y; }
  get speed(): number { return this.velocity.length(); }
  get pulsing(): boolean { return this.pulseTimer > 0; }

  setPosition(x: number, y: number): void {
    this.sprite.setPosition(x, y);
    this.velocity.set(0, 0);
    this.state = 'idle';
    this.charge = 0;
  }

  update(dt: number, input: JellyfishInput, t: Tuning, flags: DebugFlags, level: LevelData): void {
    this.stateTimer += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.pulseTimer = Math.max(0, this.pulseTimer - dt);
    this.pulseCooldown = Math.max(0, this.pulseCooldown - dt);

    if (input.pulse && this.pulseCooldown <= 0) {
      this.pulseTimer = t.pulseDuration;
      this.pulseCooldown = t.pulseCooldown;
    }

    this.updateFacing(dt, input, t);
    this.updateChargeAndThrust(dt, input, t);
    this.integrate(dt, t);
    this.resolveCollision(t, level);
    this.render(t, flags);
  }

  private updateFacing(dt: number, input: JellyfishInput, t: Tuning): void {
    // 转向能力随速度下降 —— 这是"惯性游动"的来源，
    // 玩家必须提前规划路线，而不能随时变向
    const authority = 1 - t.turnLossAtSpeed * Phaser.Math.Clamp(this.speed / t.maxSpeed, 0, 1);
    const step = t.turnRate * authority * dt;

    if (input.aimAngle !== null) {
      this.facing = Phaser.Math.Angle.RotateTo(this.facing, input.aimAngle, step);
    } else if (input.turn !== 0) {
      this.facing = Phaser.Math.Angle.Wrap(this.facing + input.turn * step);
    }
  }

  private updateChargeAndThrust(dt: number, input: JellyfishInput, t: Tuning): void {
    if (this.state === 'thrust' || this.state === 'recover') {
      if (this.state === 'thrust' && this.stateTimer > 0.12) this.setState('recover');
      else if (this.state === 'recover' && this.stateTimer > t.recoverTime) {
        this.setState(this.speed > t.glideThreshold ? 'glide' : 'idle');
      }
      return;
    }

    if (input.charging) {
      if (this.state !== 'charge') this.setState('charge');
      this.charge = Phaser.Math.Clamp(this.charge + dt / t.chargeTime, 0, 1);
      return;
    }

    if (this.state === 'charge') {
      // easeOut：前段收益明显、后段递减，避免每次都必须蓄满才划算。
      // 指数取 2 时 50% 蓄力就能拿到 88% 距离，蓄满毫无意义，所以做成可调。
      const curve = 1 - Math.pow(1 - this.charge, t.chargeCurve);
      const power = Phaser.Math.Linear(t.thrustMin, t.thrustMax, curve);
      this.velocity.x += Math.cos(this.facing) * power;
      this.velocity.y += Math.sin(this.facing) * power;
      this.charge = 0;
      this.setState('thrust');
    }
  }

  private integrate(dt: number, t: Tuning): void {
    const speed = this.speed;
    if (speed > 0.001) {
      let drag = t.dragLinear * speed + t.dragQuadratic * speed * speed;
      if (this.state === 'charge') drag *= t.chargeDragMultiplier;
      const delta = Math.min(drag * dt, speed);
      this.velocity.scale((speed - delta) / speed);
    }

    this.velocity.y += t.sinkAccel * dt;

    const cur = currentAt(this.sprite.x, this.sprite.y, t);
    this.velocity.x += cur.x * dt;
    this.velocity.y += cur.y * dt;

    if (this.speed > t.maxSpeed) this.velocity.setLength(t.maxSpeed);

    this.sprite.x += this.velocity.x * dt;
    this.sprite.y += this.velocity.y * dt;
  }

  /** 圆 vs 图块网格，逐轴分离，避免斜向卡角 */
  private resolveCollision(t: Tuning, level: LevelData): void {
    this.bumpStrength = 0;
    const r = t.bodyRadius;
    const solid = (px: number, py: number): boolean => {
      const cx = Math.floor(px / TILE);
      const cy = Math.floor(py / TILE);
      if (cx < 0 || cy < 0 || cx >= level.width || cy >= level.height) return true;
      return level.solid[cy][cx];
    };

    const probe = (axis: 'x' | 'y', dir: number): boolean => {
      const ox = axis === 'x' ? dir * r : 0;
      const oy = axis === 'y' ? dir * r : 0;
      const perp = axis === 'x' ? r * 0.7 : r * 0.7;
      const p1x = this.sprite.x + ox + (axis === 'y' ? -perp : 0);
      const p1y = this.sprite.y + oy + (axis === 'x' ? -perp : 0);
      const p2x = this.sprite.x + ox + (axis === 'y' ? perp : 0);
      const p2y = this.sprite.y + oy + (axis === 'x' ? perp : 0);
      return solid(this.sprite.x + ox, this.sprite.y + oy) || solid(p1x, p1y) || solid(p2x, p2y);
    };

    for (const axis of ['x', 'y'] as const) {
      const v = axis === 'x' ? this.velocity.x : this.velocity.y;
      if (v === 0) continue;
      const dir = Math.sign(v);
      if (!probe(axis, dir)) continue;

      // 贴回格边，再按 wallBounce 保留一点反弹
      if (axis === 'x') {
        const edge = dir > 0
          ? Math.floor((this.sprite.x + r) / TILE) * TILE - r - 0.01
          : Math.ceil((this.sprite.x - r) / TILE) * TILE + r + 0.01;
        this.sprite.x = edge;
        this.bumpStrength = Math.max(this.bumpStrength, Math.abs(v) / t.maxSpeed);
        this.velocity.x = -v * t.wallBounce;
      } else {
        const edge = dir > 0
          ? Math.floor((this.sprite.y + r) / TILE) * TILE - r - 0.01
          : Math.ceil((this.sprite.y - r) / TILE) * TILE + r + 0.01;
        this.sprite.y = edge;
        this.bumpStrength = Math.max(this.bumpStrength, Math.abs(v) / t.maxSpeed);
        this.velocity.y = -v * t.wallBounce;
      }
    }
  }

  private render(t: Tuning, flags: DebugFlags): void {
    if (this.state === 'glide' && this.speed <= t.glideThreshold) this.setState('idle');
    else if (this.state === 'idle' && this.speed > t.glideThreshold) this.setState('glide');

    if (!this.hasAnims) {
      this.sprite.rotation = this.facing + Math.PI / 2;
      return;
    }

    if (flags.useRawMotionFrames) {
      // 原始帧：thrust / glide 是朝右画的，其余朝上
      const horizontal = this.state === 'thrust' || this.state === 'glide' || this.state === 'recover';
      this.playAnim(this.state);
      this.sprite.setScale(1, 1);
      this.sprite.rotation = horizontal ? this.facing : this.facing + Math.PI / 2;
      return;
    }

    // 程序化表现：底图始终用体积稳定的 idle / pulse
    this.playAnim(this.pulsing ? 'pulse' : 'idle');
    this.sprite.rotation = this.facing + Math.PI / 2;

    let sx = 1;
    let sy = 1;
    if (this.state === 'charge') {
      // 伞盖收拢：纵向压扁、横向补偿，保持视觉体积不变
      const k = Phaser.Math.Linear(1, 0.64, this.charge);
      sy = k; sx = 1 / k;
    } else if (this.state === 'thrust' || this.state === 'glide') {
      // 前进方向拉长，幅度跟速度走
      const k = 1 + 0.34 * Phaser.Math.Clamp(this.speed / t.maxSpeed, 0, 1);
      sy = k; sx = 1 / k;
    }
    this.sprite.setScale(sx, sy);
    this.sprite.setAlpha(this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0 ? 0.35 : 1);
  }

  private playAnim(key: string): void {
    if (this.currentAnim === key) return;
    this.currentAnim = key;
    this.sprite.play(key, true);
  }

  private setState(next: SwimState): void {
    if (this.state === next) return;
    this.state = next;
    this.stateTimer = 0;
  }

  hurt(t: Tuning): boolean {
    if (this.invuln > 0) return false;
    this.health -= 1;
    this.invuln = t.invulnTime;
    return true;
  }
}

/**
 * 暗流矢量场：两个错频正弦叠加，不是全场同向匀速 ——
 * 那样玩家只会觉得操作有偏移，感觉不到"流"。
 */
export function currentAt(x: number, y: number, t: Tuning): Phaser.Math.Vector2 {
  if (t.currentStrength === 0) return new Phaser.Math.Vector2(0, 0);
  const s = t.currentScale;
  const wobble = Math.sin(y / s + Math.cos(x / (s * 1.7))) * 0.6 + Math.sin(x / (s * 0.8)) * 0.4;
  const angle = Phaser.Math.DegToRad(t.currentAngle) + wobble;
  return new Phaser.Math.Vector2(
    Math.cos(angle) * t.currentStrength,
    Math.sin(angle) * t.currentStrength,
  );
}
