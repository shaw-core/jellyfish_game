import Phaser from 'phaser';
import { COLORS, DEFAULT_FLAGS, DEFAULT_TUNING, type DebugFlags, type Tuning } from '../config/tuning';
import { Jellyfish, type JellyfishInput } from '../game/Jellyfish';
import { Particles } from '../game/Particles';
import { CameraJuice } from '../game/CameraJuice';
import { Darkness, type LightSource } from '../game/Darkness';
import { Conduit } from '../game/props';
import { Dialogue } from '../ui/Dialogue';
import { guardCreate } from '../ui/fatal';
import { FONT, SIZE } from '../ui/theme';
import { audio } from '../audio/AudioSystem';
import { TILE, type LevelData } from '../level/level1';
import {
  ZONE1_TUT_BEATS, ZONE1_TUT_CURRENTS, ZONE1_TUT_EXIT,
  ZONE1_TUT_RAW, ZONE1_TUT_ZONES,
} from '../level/zone1_tutorial';
import type { AssetStatus } from './BootScene';

const ZONE_KEY: Record<string, string> = { i: 'intake', d: 'duct', h: 'hall', s: 'shaft' };

interface Manifest {
  blob47: { metal: Record<string, number>; sediment: Record<string, number> };
  zone1_lining?: Record<string, Record<string, number>>;
  damageFrames?: { conduit_spark: number[] };
}

/**
 * Zone 1 前四拍 · 教学段。
 *
 * 独立于 GameScene，因为这一段刻意**没有任何敌人、继电器、闸门** ——
 * 一次只教一件事，把关卡剥到只剩要教的那件事。混进 GameScene 会带上
 * 一堆这里用不到的系统，也更容易出状态残留。
 */
export class Zone1TutorialScene extends Phaser.Scene {
  tuning: Tuning = { ...DEFAULT_TUNING };
  flags: DebugFlags = { ...DEFAULT_FLAGS };

  private status!: AssetStatus;
  private level!: LevelData;
  private zoneMap: string[] = [];
  private jelly!: Jellyfish;
  private particles!: Particles;
  private juice!: CameraJuice;
  private darkness!: Darkness;
  private dialogue!: Dialogue;
  private conduits: Conduit[] = [];
  private firedBeats = new Set<number>();
  private hint!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private prevPulse = false;
  private pointerAim = false;
  private done = false;

  constructor() {
    super('zone1tut');
  }

  init(data: { status: AssetStatus }): void {
    this.status = data.status;
    this.conduits = [];
    this.firedBeats = new Set();
    this.prevPulse = false;
    this.pointerAim = false;
    this.done = false;
    this.tuning = { ...DEFAULT_TUNING };
    this.flags = { ...DEFAULT_FLAGS };
  }

  create(): void {
    guardCreate(this, () => this.build());
  }

  private build(): void {
    this.level = this.parse();
    const worldW = this.level.width * TILE;
    const worldH = this.level.height * TILE;

    this.cameras.main.setBackgroundColor(COLORS.abyss);
    this.paintTerrain();

    this.jelly = new Jellyfish(this, 11 * TILE + 16, 2 * TILE + 16, this.status.jelly);
    this.particles = new Particles(this, 18);
    this.dialogue = new Dialogue(this);

    const sparks = (this.cache.json.get('manifest') as Manifest | undefined)
      ?.damageFrames?.conduit_spark ?? [19, 20, 21];
    for (const p of this.level.conduits) {
      this.conduits.push(new Conduit(this, p.x, p.y - TILE / 2, sparks, 16, this.status.enemies));
    }

    this.darkness = new Darkness(this, worldW, worldH);

    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.jelly.sprite, true, 0.09, 0.09);
    this.juice = new CameraJuice(this.cameras.main, 2);

    this.hint = this.add.text(0, 0, '', { ...FONT, fontSize: SIZE.body, color: '#59636B' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(55);
    this.positionHint();
    this.scale.on('resize', () => this.positionHint());

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      left: kb.addKey(K.LEFT), right: kb.addKey(K.RIGHT),
      a: kb.addKey(K.A), d: kb.addKey(K.D),
      space: kb.addKey(K.SPACE), shift: kb.addKey(K.SHIFT), r: kb.addKey(K.R),
    };
    kb.on('keydown-R', () => this.respawn());
    kb.on('keydown-ESC', () => this.finish());
    this.input.on('pointermove', () => { this.pointerAim = true; });
    kb.on('keydown', (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) this.pointerAim = false;
    });
  }

  /* ---------------------------------------------------------------- */

  private parse(): LevelData {
    const raw = ZONE1_TUT_RAW;
    this.zoneMap = ZONE1_TUT_ZONES;
    const height = raw.length;
    const width = raw[0].length;
    const solid: boolean[][] = [];
    const terrain: (('metal' | 'rock') | null)[][] = [];
    const data: LevelData = {
      width, height, solid, terrain,
      spawn: { x: 11 * TILE + 16, y: 2 * TILE + 16 },
      checkpoints: [], gate: [], relays: [], vents: [], conduits: [], drones: [],
    };
    for (let y = 0; y < height; y++) {
      solid[y] = [];
      terrain[y] = [];
      for (let x = 0; x < width; x++) {
        const c = raw[y][x];
        const metal = c === '#';
        const rock = c === '%';
        solid[y][x] = metal || rock;
        terrain[y][x] = metal ? 'metal' : rock ? 'rock' : null;
        const mid = { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
        if (c === 'C') data.conduits.push(mid);
        if (c === '*') data.checkpoints.push(mid);
      }
    }
    return data;
  }

  /**
   * 铺地形。
   *
   * 金属衬里按格子所属分区取不同图块 —— 玩家应该能从墙面认出自己
   * 走到了设施的哪一部分。掩码表直接来自交付 JSON 的文件名
   * （`..._intake_mask_019`），不需要从图像反推。
   */
  private paintTerrain(): void {
    const man = this.cache.json.get('manifest') as Manifest | undefined;
    const lining = man?.zone1_lining;
    const rockTable = man?.blob47?.sediment;
    if (!man || !rockTable) return;

    const rt = this.add.renderTexture(
      0, 0, this.level.width * TILE, this.level.height * TILE,
    ).setOrigin(0, 0).setDepth(1);

    const hasLining = lining && this.textures.exists('zone1_lining');
    const liningStamp = hasLining
      ? this.add.image(0, 0, 'zone1_lining').setVisible(false).setOrigin(0, 0).setScale(2)
      : undefined;
    const rockStamp = this.textures.exists('tiles')
      ? this.add.image(0, 0, 'tiles').setVisible(false).setOrigin(0, 0)
      : undefined;
    const rockMeta = this.cache.json.get('tiles-meta') as
      { frames: { filename: string }[] } | undefined;

    const solid = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= this.level.width || y >= this.level.height) return true;
      return this.level.solid[y][x];
    };
    const mask = (x: number, y: number): number => {
      const n = solid(x, y - 1); const e = solid(x + 1, y);
      const s = solid(x, y + 1); const w = solid(x - 1, y);
      let m = (n ? 1 : 0) | (e ? 4 : 0) | (s ? 16 : 0) | (w ? 64 : 0);
      if (n && w && solid(x - 1, y - 1)) m |= 128;
      if (n && e && solid(x + 1, y - 1)) m |= 2;
      if (s && e && solid(x + 1, y + 1)) m |= 8;
      if (s && w && solid(x - 1, y + 1)) m |= 32;
      return m;
    };

    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const t = this.level.terrain[y][x];
        if (!t) continue;
        const m = String(mask(x, y));

        if (t === 'metal' && hasLining && liningStamp) {
          const zk = ZONE_KEY[this.zoneMap[y]?.[x] ?? ''];
          const idx = zk ? lining![zk]?.[m] : undefined;
          if (idx !== undefined) {
            liningStamp.setFrame(idx);
            rt.draw(liningStamp, x * TILE, y * TILE);
            continue;
          }
        }
        if (rockStamp && rockMeta) {
          const idx = rockTable[m];
          if (idx !== undefined) {
            rockStamp.setFrame(rockMeta.frames[idx].filename);
            rt.draw(rockStamp, x * TILE, y * TILE);
          }
        }
      }
    }
    liningStamp?.destroy();
    rockStamp?.destroy();
  }

  private positionHint(): void {
    this.hint.setPosition(this.scale.width / 2, this.scale.height - 56);
  }

  /* ---------------------------------------------------------------- */

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 30);
    if (this.done) return;
    if (this.juice.frozen) {
      this.juice.update(dt, this.jelly.velocity, this.tuning.maxSpeed);
      this.particles.update(dt, this.cameras.main.worldView, this.time.now);
      return;
    }

    this.dialogue.update(dt);

    const prevState = this.jelly.state;
    this.jelly.update(dt, this.readInput(), this.tuning, this.flags, this.level);

    this.applyCurrents(dt);

    if (this.jelly.state === 'thrust' && prevState !== 'thrust') {
      audio.thrust(0.6);
      this.particles.thrust(this.jelly.x, this.jelly.y, this.jelly.facing, 0.6);
      this.juice.punch(0.5);
    }
    if (this.jelly.state === 'charge') {
      this.particles.intake(this.jelly.x, this.jelly.y, this.jelly.charge);
    }
    if (this.jelly.bumpStrength > 0) {
      audio.bump(this.jelly.bumpStrength);
      this.particles.bump(this.jelly.x, this.jelly.y, this.jelly.bumpStrength);
    }

    for (const c of this.conduits) {
      if (c.hits(this.jelly.x, this.jelly.y, this.tuning.bodyRadius * this.jelly.radiusScale)) {
        this.damage();
      }
    }

    this.checkBeats();
    this.updateDarkness();
    this.juice.update(dt, this.jelly.velocity, this.tuning.maxSpeed);
    this.particles.update(dt, this.cameras.main.worldView, this.time.now);
    audio.updateAmbient(dt);

    if (this.jelly.x > ZONE1_TUT_EXIT[0] * TILE) this.finish();
  }

  private readInput(): JellyfishInput {
    if (this.dialogue.busy) return { charging: false, turn: 0, aimAngle: null, pulse: false };

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

    const down = this.keys.shift.isDown || this.input.activePointer.rightButtonDown();
    const pulse = down && !this.prevPulse;
    this.prevPulse = down;

    return {
      charging: this.keys.space.isDown || this.input.activePointer.leftButtonDown(),
      turn, aimAngle, pulse,
    };
  }

  /** 逆流区：这是第 1 拍的技能闸门，漂移会被推回去，必须蓄力喷射 */
  private applyCurrents(dt: number): void {
    const gx = this.jelly.x / TILE;
    const gy = this.jelly.y / TILE;
    for (const c of ZONE1_TUT_CURRENTS) {
      const [x0, y0, x1, y1] = c.rect;
      if (gx < x0 || gx > x1 + 1 || gy < y0 || gy > y1 + 1) continue;
      this.jelly.velocity.x += c.push[0] * dt;
      this.jelly.velocity.y += c.push[1] * dt;
    }
  }

  private checkBeats(): void {
    for (const b of ZONE1_TUT_BEATS) {
      if (this.firedBeats.has(b.beat)) continue;
      const bx = b.at[0] * TILE + TILE / 2;
      const by = b.at[1] * TILE + TILE / 2;
      if (Math.hypot(bx - this.jelly.x, by - this.jelly.y) > 80) continue;
      this.firedBeats.add(b.beat);
      // 守炉者只陈述事实，不教操作 —— 怎么过去由关卡本身教
      this.dialogue.play([{ who: b.who, text: b.text, corrupt: b.corrupt }]);
    }
  }

  private updateDarkness(): void {
    if (this.flags.lightsOn) {
      this.darkness.setVisible(false);
      return;
    }
    this.darkness.setVisible(true);
    const lights: LightSource[] = [{
      x: this.jelly.x,
      y: this.jelly.y,
      radius: this.jelly.pulsing ? this.tuning.pulseRadius : this.tuning.lightRadius,
    }];
    for (const c of this.conduits) {
      if (c.live) lights.push({ x: c.x, y: c.y + 20, radius: 90, strength: 0.9 });
    }
    this.darkness.redraw(lights);
  }

  private damage(): void {
    if (!this.jelly.hurt(this.tuning)) return;
    audio.hurt();
    this.juice.hitstop(0.11);
    this.cameras.main.shake(180, 0.008);
    if (this.jelly.health <= 0) this.respawn();
  }

  private respawn(): void {
    let best = this.level.spawn;
    for (const cp of this.level.checkpoints) {
      if (cp.x <= this.jelly.x && cp.x > best.x) best = cp;
    }
    this.particles.clearTransient();
    this.juice.reset();
    this.jelly.setPosition(best.x, best.y);
    this.jelly.health = 3;
    this.jelly.invuln = this.tuning.invulnTime;
    this.jelly.playRespawn();
    this.cameras.main.flash(220, 11, 16, 38);
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.cameras.main.fadeOut(700, 11, 16, 38);
    this.time.delayedCall(760, () => {
      this.dialogue.destroy();
      this.scene.start('ending', { status: this.status });
    });
  }

  get readout() {
    return {
      state: this.jelly.state,
      speed: this.jelly.speed,
      charge: this.jelly.charge,
      health: this.jelly.health,
      relays: this.firedBeats.size,
      totalRelays: ZONE1_TUT_BEATS.length,
      particles: this.particles.count,
      muted: audio.muted,
      assets: this.status,
    };
  }
}
