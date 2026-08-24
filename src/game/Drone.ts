import Phaser from 'phaser';
import { COLORS, type Tuning } from '../config/tuning';
import { TILE, type LevelData } from '../level/level1';

type DroneMode = 'patrol' | 'alert';

/**
 * 巡逻机械眼。
 *
 * 视锥不是贴图 —— R3 交付的视锥被 48px 帧边界硬切，有效长度只有 21px，
 * 末端是一条垂直切线，引擎没法按巡逻范围调长度。视锥本身只是单色 50%
 * 棋盘格抖动的三角形，程序生成反而更准，也顺便解决了长度可调的问题。
 */
export class Drone {
  readonly sprite: Phaser.GameObjects.Sprite;
  mode: DroneMode = 'patrol';

  private dir = 1;
  private alertTimer = 0;
  private bobPhase = Math.random() * Math.PI * 2;
  private minX: number;
  private maxX: number;

  constructor(
    scene: Phaser.Scene,
    public x: number,
    public y: number,
    level: LevelData,
    hasAnims: boolean,
  ) {
    this.sprite = scene.add.sprite(x, y, hasAnims ? 'enemies' : 'drone-placeholder');
    this.sprite.setDepth(15);
    if (hasAnims) this.sprite.play('sentry_patrol');

    // 巡逻范围 = 当前所在水平通道的可走区间，最多向两侧各延伸 6 格
    const cy = Math.floor(y / TILE);
    const cx = Math.floor(x / TILE);
    let lo = cx;
    let hi = cx;
    while (lo > 1 && !level.solid[cy][lo - 1] && cx - lo < 6) lo--;
    while (hi < level.width - 2 && !level.solid[cy][hi + 1] && hi - cx < 6) hi++;
    this.minX = lo * TILE + TILE / 2;
    this.maxX = hi * TILE + TILE / 2;
  }

  /** 视锥朝向：始终朝着移动方向 */
  get coneAngle(): number {
    return this.dir > 0 ? 0 : Math.PI;
  }

  update(dt: number, t: Tuning, target: { x: number; y: number }, visible: boolean, level: LevelData): void {
    const sees = visible && this.canSee(target, t, level);

    if (sees) {
      this.mode = 'alert';
      this.alertTimer = t.droneAlertMemory;
    } else if (this.alertTimer > 0) {
      this.alertTimer -= dt;
      if (this.alertTimer <= 0) this.mode = 'patrol';
    }

    const speed = this.mode === 'alert' ? t.droneChaseSpeed : t.dronePatrolSpeed;

    if (this.mode === 'alert' && sees) {
      // 警觉时朝目标水平移动，但不离开自己的通道
      this.dir = Math.sign(target.x - this.x) || this.dir;
      this.x += this.dir * speed * dt;
    } else {
      this.x += this.dir * speed * dt;
      if (this.x < this.minX) { this.x = this.minX; this.dir = 1; }
      if (this.x > this.maxX) { this.x = this.maxX; this.dir = -1; }
    }
    this.x = Phaser.Math.Clamp(this.x, this.minX, this.maxX);

    this.bobPhase += dt * 2.2;
    const bob = Math.sin(this.bobPhase) * 2;

    this.sprite.setPosition(Math.round(this.x), Math.round(this.y + bob));
    this.sprite.setFlipX(this.dir < 0);

    const wantAnim = this.mode === 'alert' ? 'sentry_alert' : 'sentry_patrol';
    if (this.sprite.anims?.currentAnim?.key !== wantAnim && this.sprite.anims) {
      this.sprite.play(wantAnim, true);
    }
    // 补偿：警觉帧本体只有巡逻帧的 43% 面积（R4 单 P-04），
    // 不补偿的话切状态时机器人会明显缩水
    this.sprite.setScale(this.mode === 'alert' ? 1.35 : 1);
  }

  private canSee(target: { x: number; y: number }, t: Tuning, level: LevelData): boolean {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > t.droneConeLength) return false;

    const delta = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - this.coneAngle));
    if (delta > t.droneConeHalfAngle) return false;

    return !lineBlocked(this.x, this.y, target.x, target.y, level);
  }

  drawCone(g: Phaser.GameObjects.Graphics, t: Tuning): void {
    const color = this.mode === 'alert' ? COLORS.alertPurple : COLORS.alert;
    const a = this.coneAngle;
    const half = t.droneConeHalfAngle;
    const len = t.droneConeLength;

    g.fillStyle(color, this.mode === 'alert' ? 0.3 : 0.19);
    g.beginPath();
    g.moveTo(this.x, this.y);
    for (let i = -1; i <= 1; i += 0.1) {
      g.lineTo(this.x + Math.cos(a + half * i) * len, this.y + Math.sin(a + half * i) * len);
    }
    g.closePath();
    g.fillPath();
  }
}

/** DDA 网格射线：任一格实心即视线被挡 */
export function lineBlocked(
  x0: number, y0: number, x1: number, y1: number, level: LevelData,
): boolean {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE / 2));
  for (let i = 1; i <= steps; i++) {
    const px = Phaser.Math.Linear(x0, x1, i / steps);
    const py = Phaser.Math.Linear(y0, y1, i / steps);
    const cx = Math.floor(px / TILE);
    const cy = Math.floor(py / TILE);
    if (cx < 0 || cy < 0 || cx >= level.width || cy >= level.height) return true;
    if (level.solid[cy][cx]) return true;
  }
  return false;
}
