/**
 * 全局可调参数。
 *
 * 单位：距离 = 游戏内像素（未经相机 zoom）；时间 = 秒；角度 = 弧度。
 */

export interface Tuning {
  chargeTime: number;
  thrustMin: number;
  thrustMax: number;
  /** 蓄力收益曲线指数：power = lerp(min, max, 1-(1-c)^n)。1 = 线性，越大越"蓄满不划算" */
  chargeCurve: number;
  recoverTime: number;

  dragLinear: number;
  dragQuadratic: number;
  chargeDragMultiplier: number;

  sinkAccel: number;
  maxSpeed: number;

  turnRate: number;
  turnLossAtSpeed: number;

  currentStrength: number;
  currentAngle: number;
  currentScale: number;

  glideThreshold: number;

  /** 碰撞半径。第三批的主角实测伞盖宽 45px（帧 64×64），取 14 略小于半宽 */
  bodyRadius: number;
  /** 撞墙后保留的速度比例 */
  wallBounce: number;

  /** 常态视野半径（黑暗中能看见的范围） */
  lightRadius: number;
  /** Pulse 爆发时的视野半径 */
  pulseRadius: number;
  pulseDuration: number;
  pulseCooldown: number;

  /** 地热喷口的上推加速度与作用范围 */
  ventForce: number;
  ventWidth: number;
  ventHeight: number;

  /** 机械眼视锥长度与半角 */
  droneConeLength: number;
  droneConeHalfAngle: number;
  dronePatrolSpeed: number;
  droneChaseSpeed: number;
  /** 失去目标后保持警觉的时间 */
  droneAlertMemory: number;

  /** 受伤后的无敌时间 */
  invulnTime: number;
}

export const DEFAULT_TUNING: Tuning = {
  chargeTime: 0.55,
  thrustMin: 60,
  thrustMax: 420,
  chargeCurve: 1.3,
  recoverTime: 0.22,

  dragLinear: 0.9,
  dragQuadratic: 0.0055,
  chargeDragMultiplier: 2.4,

  sinkAccel: 26,
  maxSpeed: 520,

  turnRate: 3.4,
  turnLossAtSpeed: 0.72,

  currentStrength: 12,
  currentAngle: 12,
  currentScale: 260,

  glideThreshold: 42,

  bodyRadius: 14,
  wallBounce: 0.28,

  lightRadius: 108,
  pulseRadius: 260,
  pulseDuration: 0.9,
  pulseCooldown: 2.2,

  ventForce: 620,
  ventWidth: 44,
  ventHeight: 200,

  droneConeLength: 168,
  droneConeHalfAngle: 0.36,
  dronePatrolSpeed: 34,
  droneChaseSpeed: 88,
  droneAlertMemory: 2.4,

  invulnTime: 1.4,
};

export interface DebugFlags {
  /** 用原始 charge / thrust / glide 帧，而不是程序化变形（默认关，原因见 README） */
  useRawMotionFrames: boolean;
  showGrid: boolean;
  showColliders: boolean;
  showVelocity: boolean;
  /** 关闭黑暗，方便看全图 */
  lightsOn: boolean;
}

export const DEFAULT_FLAGS: DebugFlags = {
  useRawMotionFrames: false,
  showGrid: false,
  showColliders: false,
  showVelocity: false,
  lightsOn: false,
};

export const COLORS = {
  abyss: 0x0b1026,
  deep: 0x1b2a4a,
  slate: 0x25355f,
  biolum: 0x70ffe0,
  biolumDim: 0x31d6c8,
  rust: 0xd8792d,
  alert: 0xff3344,
  alertPurple: 0xc75bff,
  gold: 0xffd700,
  bone: 0xdffff7,
  relayOff: 0x59636b,
  relayOn: 0x4faf7a,
} as const;
