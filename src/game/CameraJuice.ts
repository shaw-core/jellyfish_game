import Phaser from 'phaser';

/**
 * 相机手感。
 *
 * 三件事：跟着速度提前看、喷射时轻微推镜、受击时顿帧。
 *
 * 顿帧（hitstop）是这三个里最容易被低估的 —— 撞上危险物时把游戏冻住
 * 十几帧，玩家对"我被打到了"的感知会强烈得多，而画面上什么都不用加。
 * 它不能靠 Phaser 的 timeScale 实现，因为那会连带停掉相机的缓动和补间，
 * 反而看不出停顿，所以这里由 GameScene 主动跳过逻辑更新。
 */
export class CameraJuice {
  private baseZoom: number;
  private zoomPunch = 0;
  private freezeTimer = 0;
  private lookX = 0;
  private lookY = 0;

  constructor(private cam: Phaser.Cameras.Scene2D.Camera, baseZoom: number) {
    this.baseZoom = baseZoom;
    cam.setZoom(baseZoom);
  }

  /** 冻结指定秒数；返回值供 GameScene 判断是否跳过本帧逻辑 */
  hitstop(seconds: number): void {
    this.freezeTimer = Math.max(this.freezeTimer, seconds);
  }

  get frozen(): boolean {
    return this.freezeTimer > 0;
  }

  /** 喷射推镜，power 0–1 */
  punch(power: number): void {
    this.zoomPunch = Math.max(this.zoomPunch, 0.05 + power * 0.07);
  }

  update(dt: number, velocity: { x: number; y: number }, maxSpeed: number): void {
    if (this.freezeTimer > 0) {
      this.freezeTimer -= dt;
      return;
    }

    // 提前量：朝运动方向偏移视野中心，高速时能多看见前方一点。
    // 用 setFollowOffset 而不是直接挪 scrollX，才不会和 startFollow 的
    // 缓动打架。注意符号 —— followOffset 是相机相对目标的偏移，
    // 想"往前看"要取负。
    const ratio = Phaser.Math.Clamp(Math.hypot(velocity.x, velocity.y) / maxSpeed, 0, 1);
    const targetX = -(velocity.x / maxSpeed) * 70 * ratio;
    const targetY = -(velocity.y / maxSpeed) * 50 * ratio;

    // 自己做平滑，避免高速抖动
    this.lookX = Phaser.Math.Linear(this.lookX, targetX, 1 - Math.pow(0.001, dt));
    this.lookY = Phaser.Math.Linear(this.lookY, targetY, 1 - Math.pow(0.001, dt));
    this.cam.setFollowOffset(this.lookX, this.lookY);

    // 推镜衰减
    if (this.zoomPunch > 0.0005) {
      this.zoomPunch *= Math.pow(0.02, dt);
    } else {
      this.zoomPunch = 0;
    }
    this.cam.setZoom(this.baseZoom * (1 + this.zoomPunch));
  }

  reset(): void {
    this.zoomPunch = 0;
    this.freezeTimer = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.cam.setFollowOffset(0, 0);
    this.cam.setZoom(this.baseZoom);
  }
}
