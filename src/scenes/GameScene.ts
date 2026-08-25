import Phaser from 'phaser';
import { COLORS, DEFAULT_FLAGS, DEFAULT_TUNING, type DebugFlags, type Tuning } from '../config/tuning';
import { LEVEL1_RAW, TILE, parseLevel, type LevelData } from '../level/level1';
import { AutoTiler, type BlobTables } from '../game/AutoTiler';
import { Jellyfish, type JellyfishInput } from '../game/Jellyfish';
import { Drone } from '../game/Drone';
import { Conduit, Gate, Relay, Vent } from '../game/props';
import { Darkness, type LightSource } from '../game/Darkness';
import { Particles } from '../game/Particles';
import { CameraJuice } from '../game/CameraJuice';
import type { AssetStatus } from './BootScene';
import { audio } from '../audio/AudioSystem';

interface Manifest {
  blob47: BlobTables;
  damageFrames: { conduit_spark: number[] };
}

export class GameScene extends Phaser.Scene {
  tuning: Tuning = { ...DEFAULT_TUNING };
  flags: DebugFlags = { ...DEFAULT_FLAGS };

  private status!: AssetStatus;
  private level!: LevelData;
  private jelly!: Jellyfish;
  private drones: Drone[] = [];
  private conduits: Conduit[] = [];
  private vents: Vent[] = [];
  private relays: Relay[] = [];
  private gate!: Gate;
  private darkness!: Darkness;
  private coneGfx!: Phaser.GameObjects.Graphics;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private pulseFx!: Phaser.GameObjects.Sprite;
  private particles!: Particles;
  private juice!: CameraJuice;

  private checkpoint = { x: 0, y: 0 };
  private won = false;
  private pointerAim = false;
  private prevPulseKey = false;
  private prevState = '';
  private prevAlerted = false;
  private sparkCooldown = 0;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('game');
  }

  init(data: { status: AssetStatus }): void {
    this.status = data.status;
    // 必须显式清空：Scene 实例被复用，重玩一次这些数组会翻倍，
    // 敌人成倍出现、继电器数量对不上导致闸门永远开不了
    this.drones = [];
    this.conduits = [];
    this.vents = [];
    this.relays = [];
    this.won = false;
    this.pointerAim = false;
    this.prevPulseKey = false;
    this.prevState = '';
    this.prevAlerted = false;
    this.sparkCooldown = 0;
    this.lastCharge = 0;
    this.checkpoint = { x: 0, y: 0 };
    this.tuning = { ...DEFAULT_TUNING };
    this.flags = { ...DEFAULT_FLAGS };
  }

  create(): void {
    this.level = parseLevel(LEVEL1_RAW);
    const worldW = this.level.width * TILE;
    const worldH = this.level.height * TILE;

    this.cameras.main.setBackgroundColor(COLORS.abyss);

    // --- 地形 ---------------------------------------------------
    const manifest = this.cache.json.get('manifest') as Manifest | undefined;
    if (this.status.tileset && manifest) {
      const meta = this.cache.json.get('tiles-meta') as { frames: { filename: string }[] };
      const tiler = new AutoTiler(this.level, manifest.blob47, meta);
      tiler.build(this, 'tiles').setDepth(0);

      const audit = tiler.audit();
      if (audit.missing > 0) {
        console.warn(`[autotile] ${audit.missing}/${audit.total} 格没查到掩码`);
      }
    } else {
      this.drawFallbackTerrain();
    }

    // --- 实体 ---------------------------------------------------
    this.checkpoint = { ...this.level.spawn };
    this.jelly = new Jellyfish(this, this.level.spawn.x, this.level.spawn.y, this.status.jelly);

    for (const p of this.level.drones) {
      this.drones.push(new Drone(this, p.x, p.y, this.level, this.status.enemies));
    }
    const sparkFrames = manifest?.damageFrames?.conduit_spark ?? [19, 20, 21];
    for (const p of this.level.conduits) {
      // 电缆从顶板垂下来，所以锚在格子顶边而不是中心
      this.conduits.push(new Conduit(
        this, p.x, p.y - TILE / 2, sparkFrames, 16, this.status.enemies,
      ));
    }
    for (const p of this.level.vents) this.vents.push(new Vent(this, p.x, p.y, this.status.vent));
    for (const p of this.level.relays) this.relays.push(new Relay(this, p.x, p.y));
    this.gate = new Gate(this, this.level.gate, this.status.gate);

    // 闸门格并入碰撞网格；开门时再挖掉
    for (const c of this.level.gate) this.level.solid[c.y][c.x] = true;

    this.coneGfx = this.add.graphics().setDepth(11);
    this.debugGfx = this.add.graphics().setDepth(29);

    this.pulseFx = this.add.sprite(0, 0, 'pulsefx').setDepth(25).setVisible(false);

    this.particles = new Particles(this, 18);
    this.darkness = new Darkness(this, worldW, worldH);

    // --- 相机与输入 ---------------------------------------------
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.jelly.sprite, true, 0.09, 0.09);
    this.juice = new CameraJuice(this.cameras.main, 2);

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      left: kb.addKey(K.LEFT), right: kb.addKey(K.RIGHT),
      a: kb.addKey(K.A), d: kb.addKey(K.D),
      space: kb.addKey(K.SPACE), shift: kb.addKey(K.SHIFT),
      r: kb.addKey(K.R), m: kb.addKey(K.M),
    };
    kb.on('keydown-R', () => this.respawn());
    kb.on('keydown-M', () => this.setMuted(!audio.muted));
    this.input.on('pointermove', () => { this.pointerAim = true; });
    kb.on('keydown', (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) this.pointerAim = false;
    });

    this.scene.launch('hud');
    this.events.emit('objective', 0, this.relays.length);
  }

  override update(time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 30);
    if (this.won) return;

    const view = this.cameras.main.worldView;

    // 顿帧期间只推进表现层：粒子继续飘、相机继续收推镜，
    // 但物理和敌人全部冻住 —— 停顿感就是这么来的
    if (this.juice.frozen) {
      this.juice.update(dt, this.jelly.velocity, this.tuning.maxSpeed);
      this.particles.update(dt, view, time);
      return;
    }

    const input = this.readInput();
    const wasPulsing = this.jelly.pulsing;

    this.jelly.update(dt, input, this.tuning, this.flags, this.level);
    this.updateAudio(dt);

    // 喷口推力
    for (const v of this.vents) {
      const f = v.force(this.jelly.x, this.jelly.y, this.tuning);
      if (f !== 0) this.jelly.velocity.y += f * dt;
    }

    // Pulse 起爆的那一帧：点亮继电器
    if (this.jelly.pulsing && !wasPulsing) this.firePulse();
    this.pulseFx.setVisible(this.jelly.pulsing);
    if (this.jelly.pulsing) this.pulseFx.setPosition(this.jelly.x, this.jelly.y);

    // 敌人
    const lit = this.flags.lightsOn || this.jelly.pulsing
      || this.jelly.speed > this.tuning.glideThreshold;
    for (const d of this.drones) {
      d.update(dt, this.tuning, this.jelly, lit, this.level);
      if (Math.hypot(d.x - this.jelly.x, d.y - this.jelly.y) < 22 + this.tuning.bodyRadius) {
        this.damage();
      }
    }
    for (const c of this.conduits) {
      if (c.hits(this.jelly.x, this.jelly.y, this.tuning.bodyRadius)) this.damage();
    }

    for (const r of this.relays) r.update(time);

    this.updateParticles(dt, view, time);
    this.juice.update(dt, this.jelly.velocity, this.tuning.maxSpeed);

    this.drawCones();
    this.drawDebug();
    this.updateDarkness();
    this.checkGoal();
  }

  /* ---------------------------------------------------------------- */

  /**
   * 每帧的音频状态同步。
   *
   * 蓄力音是常驻振荡器，按状态开关；电弧和喷口按距离衰减 ——
   * 全场同响会让玩家分不清危险在哪边。
   */
  private updateAudio(dt: number): void {
    if (!audio.ready) return;
    audio.updateAmbient(dt);

    // 蓄力
    if (this.jelly.state === 'charge') {
      if (this.prevState !== 'charge') audio.startCharge();
      audio.updateCharge(this.jelly.charge);
    } else if (this.prevState === 'charge') {
      audio.stopCharge();
    }
    // 蓄力 -> 喷射：用上一帧的蓄力量决定音量
    if (this.jelly.state === 'thrust' && this.prevState !== 'thrust') {
      audio.thrust(this.lastCharge);
      this.particles.thrust(this.jelly.x, this.jelly.y, this.jelly.facing, this.lastCharge);
      this.juice.punch(this.lastCharge);
    }
    this.lastCharge = this.jelly.state === 'charge' ? this.jelly.charge : this.lastCharge;
    this.prevState = this.jelly.state;

    if (this.jelly.bumpStrength > 0) audio.bump(this.jelly.bumpStrength);

    // 喷口：取最近那个的接近度
    let ventProx = 0;
    for (const v of this.vents) {
      const d = Math.hypot(v.x - this.jelly.x, v.y - this.jelly.y);
      ventProx = Math.max(ventProx, 1 - Phaser.Math.Clamp(d / 340, 0, 1));
    }
    audio.setVentProximity(ventProx);

    // 电弧：只在放电帧触发，且按距离衰减
    this.sparkCooldown -= dt;
    if (this.sparkCooldown <= 0) {
      for (const c of this.conduits) {
        if (!c.live) continue;
        const d = Math.hypot(c.x - this.jelly.x, c.y - this.jelly.y);
        if (d < 420) {
          audio.spark(Phaser.Math.Clamp(d / 420, 0, 1));
          this.sparkCooldown = 0.14;
          break;
        }
      }
    }

    // 被发现的那一下
    const anyAlerted = this.drones.some((d) => d.mode === 'alert');
    if (anyAlerted && !this.prevAlerted) audio.alerted();
    this.prevAlerted = anyAlerted;
  }

  private lastCharge = 0;

  private updateParticles(dt: number, view: Phaser.Geom.Rectangle, time: number): void {
    // 蓄力时持续吸入微粒，蓄得越满吸得越急
    if (this.jelly.state === 'charge' && Math.random() < 0.6 + this.jelly.charge * 0.4) {
      this.particles.intake(this.jelly.x, this.jelly.y, this.jelly.charge);
    }

    if (this.jelly.bumpStrength > 0) {
      this.particles.bump(this.jelly.x, this.jelly.y, this.jelly.bumpStrength);
    }

    // 电弧火花：只在放电帧、且在视野内才发，避免看不见的地方白算
    for (const c of this.conduits) {
      if (!c.live) continue;
      if (c.x < view.x - 30 || c.x > view.right + 30) continue;
      if (Math.random() < 0.25) this.particles.spark(c.x, c.y);
    }

    this.particles.update(dt, view, time);
  }

  private readInput(): JellyfishInput {
    const turn =
      (this.keys.left.isDown || this.keys.a.isDown ? -1 : 0) +
      (this.keys.right.isDown || this.keys.d.isDown ? 1 : 0);

    let aimAngle: number | null = null;
    if (this.pointerAim && turn === 0) {
      const p = this.input.activePointer;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      const dx = w.x - this.jelly.x;
      const dy = w.y - this.jelly.y;
      if (dx * dx + dy * dy > 64) aimAngle = Math.atan2(dy, dx);
    }

    // Pulse 取边沿触发，长按不会连发
    const pulseDown = this.keys.shift.isDown || this.input.activePointer.rightButtonDown();
    const pulse = pulseDown && !this.prevPulseKey;
    this.prevPulseKey = pulseDown;

    return {
      charging: this.keys.space.isDown || this.input.activePointer.leftButtonDown(),
      turn,
      aimAngle,
      pulse,
    };
  }

  private firePulse(): void {
    if (this.status.jelly) this.pulseFx.play('pulse_fx');
    audio.pulse();
    this.particles.pulse(this.jelly.x, this.jelly.y, this.tuning.pulseRadius);
    this.juice.punch(0.35);
    let lit = 0;
    for (const r of this.relays) {
      if (r.tryActivate(this.jelly.x, this.jelly.y, this.tuning.pulseRadius)) audio.relayOn();
      if (r.active) lit++;
    }
    this.events.emit('objective', lit, this.relays.length);

    if (lit === this.relays.length && !this.gate.open) {
      this.gate.setOpen(this);
      audio.gateOpen();
      for (const c of this.level.gate) this.level.solid[c.y][c.x] = false;
      this.events.emit('toast', '闸门已开启 —— 前往东侧出口');
    }
  }

  private damage(): void {
    if (!this.jelly.hurt(this.tuning)) return;
    audio.hurt();
    // 顿帧比震屏更能传达"被打到了"，两个一起用
    this.juice.hitstop(0.11);
    this.particles.bump(this.jelly.x, this.jelly.y, 1);
    this.cameras.main.shake(180, 0.008);
    this.events.emit('health', this.jelly.health);
    if (this.jelly.health <= 0) this.respawn();
  }

  private respawn(): void {
    this.particles.clearTransient();
    this.juice.reset();
    this.jelly.setPosition(this.checkpoint.x, this.checkpoint.y);
    this.jelly.health = 3;
    this.jelly.invuln = this.tuning.invulnTime;
    this.jelly.playRespawn();
    this.events.emit('health', 3);
    this.cameras.main.flash(220, 11, 16, 38);
  }

  private checkGoal(): void {
    for (const cp of this.level.checkpoints) {
      if (Math.hypot(cp.x - this.jelly.x, cp.y - this.jelly.y) < 40) {
        if (this.checkpoint.x !== cp.x || this.checkpoint.y !== cp.y) {
          this.checkpoint = { ...cp };
          this.events.emit('toast', '检查点');
        }
      }
    }

    // 出口在闸门之下的进水闸厅 —— 守炉者让你往下走，出口就必须在下面
    if (this.gate.open && this.jelly.y > 34 * TILE) {
      this.won = true;
      this.scene.stop('hud');
      this.scene.start('ending', { status: this.status });
    }
  }

  private drawCones(): void {
    this.coneGfx.clear();
    for (const d of this.drones) d.drawCone(this.coneGfx, this.tuning);
  }

  private updateDarkness(): void {
    if (this.flags.lightsOn) {
      this.darkness.setVisible(false);
      return;
    }
    this.darkness.setVisible(true);

    const lights: LightSource[] = [
      {
        x: this.jelly.x,
        y: this.jelly.y,
        radius: this.jelly.pulsing ? this.tuning.pulseRadius : this.tuning.lightRadius,
      },
    ];
    for (const r of this.relays) {
      if (r.active) lights.push({ x: r.x, y: r.y, radius: 70, strength: 0.8 });
    }
    for (const v of this.vents) lights.push({ x: v.x, y: v.y - 40, radius: 90, strength: 0.7 });
    for (const c of this.conduits) {
      if (c.live) lights.push({ x: c.x, y: c.y, radius: 80, strength: 0.9 });
    }
    this.darkness.redraw(lights);
  }

  private drawDebug(): void {
    const g = this.debugGfx;
    g.clear();
    if (this.flags.showGrid) {
      const view = this.cameras.main.worldView;
      g.lineStyle(1, COLORS.slate, 0.45);
      for (let x = Math.floor(view.x / TILE) * TILE; x < view.right + TILE; x += TILE) {
        g.lineBetween(x, view.y, x, view.bottom);
      }
      for (let y = Math.floor(view.y / TILE) * TILE; y < view.bottom + TILE; y += TILE) {
        g.lineBetween(view.x, y, view.right, y);
      }
    }
    if (this.flags.showColliders) {
      g.lineStyle(1, COLORS.rust, 0.9);
      g.strokeCircle(this.jelly.x, this.jelly.y, this.tuning.bodyRadius);
      for (const d of this.drones) g.strokeCircle(d.x, d.y, 22);
    }
    if (this.flags.showVelocity) {
      g.lineStyle(1, COLORS.biolum, 0.85);
      g.lineBetween(
        this.jelly.x, this.jelly.y,
        this.jelly.x + this.jelly.velocity.x * 0.18,
        this.jelly.y + this.jelly.velocity.y * 0.18,
      );
    }
    if (this.jelly.state === 'charge') {
      g.lineStyle(1, COLORS.biolum, 0.25 + this.jelly.charge * 0.6);
      g.strokeCircle(this.jelly.x, this.jelly.y, 20 + this.jelly.charge * 16);
    }
  }

  /** 图块集缺失时的兜底地形，保证关卡仍然可读可玩 */
  private drawFallbackTerrain(): void {
    const g = this.add.graphics().setDepth(0);
    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const t = this.level.terrain[y][x];
        if (!t) continue;
        g.fillStyle(t === 'metal' ? 0x3a3d40 : 0x25355f, 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
        g.lineStyle(1, COLORS.abyss, 0.6);
        g.strokeRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }

  setMuted(m: boolean): void {
    audio.setMuted(m);
    this.events.emit('toast', m ? '静音' : '声音已开');
  }

  get readout() {
    return {
      state: this.jelly.state,
      speed: this.jelly.speed,
      charge: this.jelly.charge,
      health: this.jelly.health,
      relays: this.relays.filter((r) => r.active).length,
      totalRelays: this.relays.length,
      assets: this.status,
      muted: audio.muted,
      particles: this.particles.count,
    };
  }
}
