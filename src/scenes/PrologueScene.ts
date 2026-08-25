import Phaser from 'phaser';
import { COLORS, DEFAULT_FLAGS, DEFAULT_TUNING, type Tuning } from '../config/tuning';
import { Jellyfish, type JellyfishInput } from '../game/Jellyfish';
import { Particles } from '../game/Particles';
import { AutoTiler, type BlobTables } from '../game/AutoTiler';
import { Dialogue } from '../ui/Dialogue';
import { audio } from '../audio/AudioSystem';
import { FONT, SIZE } from '../ui/theme';
import type { AssetStatus } from './BootScene';
import { TILE, parseLevel, type LevelData } from '../level/level1';
import { PROLOGUE_RAW } from '../level/prologue';

type Phase =
  | 'swim'      // 跟着族群游
  | 'sweep'     // 暗流卷走
  | 'arrive'    // 落进废墟
  | 'explore'   // 在废墟里自由游动
  | 'approach'  // 靠近机械门
  | 'scan'      // 蓝光扫描
  | 'welcome'   // 断续文字
  | 'enter';    // 游进去

const OPEN_W = 1900;
const OPEN_H = 1000;

/**
 * 开场。
 *
 * 分镜：
 *   1 和族群一起游 —— 建立"它本来属于某个地方"
 *   2 暗流袭来，操作失效，被冲走
 *   3 醒在一片海底废墟：散落的机械零件、倒地的机器人、忽明忽暗的电火花
 *   4 深处有一道机械门
 *   5 靠近时蓝光扫描
 *   6 断断续续的一句「欢迎，来访者」
 *   7 门开，游进去 → Zone 1
 *
 * 第 3 段是可自由游动的实际场景，不是过场动画 —— 地形用的图块与自动
 * 拼接规则和正片完全相同，玩家在这里学到的空间语言后面直接能用。
 */
export class PrologueScene extends Phaser.Scene {
  private status!: AssetStatus;
  private tuning: Tuning = { ...DEFAULT_TUNING };
  private jelly!: Jellyfish;
  private particles!: Particles;
  private dialogue!: Dialogue;
  private hint!: Phaser.GameObjects.Text;
  private openBg!: Phaser.GameObjects.Graphics;

  private phase: Phase = 'swim';
  private phaseTimer = 0;
  private swarm: Phaser.GameObjects.Sprite[] = [];
  private openLevel!: LevelData;
  private ruinLevel!: LevelData;
  private door?: Phaser.GameObjects.Sprite;
  private undercurrentFx?: Phaser.GameObjects.TileSprite;
  private undercurrentTimer?: Phaser.Time.TimerEvent;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private prevPulse = false;

  private readonly doorX = 71 * TILE;
  /** 门的纵向位置由地面算出来，不写死 —— 门得站在地上 */
  private doorY = 10 * TILE;

  constructor() {
    super('prologue');
  }

  init(data: { status: AssetStatus }): void {
    this.status = data.status;
    this.phase = 'swim';
    this.phaseTimer = 0;
    this.swarm = [];
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.abyss);

    this.openLevel = emptyLevel(OPEN_W, OPEN_H);
    this.ruinLevel = parseLevel(PROLOGUE_RAW);

    this.cameras.main.setBounds(0, 0, OPEN_W, OPEN_H);
    this.cameras.main.setZoom(2);

    this.openBg = this.add.graphics().setDepth(0);
    this.openBg.fillGradientStyle(COLORS.deep, COLORS.deep, COLORS.abyss, COLORS.abyss, 1);
    this.openBg.fillRect(0, 0, OPEN_W, OPEN_H);

    this.buildSwarm();

    this.jelly = new Jellyfish(this, 520, 460, this.status.jelly);
    this.particles = new Particles(this, 18);
    this.dialogue = new Dialogue(this);

    this.hint = this.add.text(0, 0, '', { ...FONT, fontSize: SIZE.body, color: '#59636B' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(55);
    this.positionHint();
    this.scale.on('resize', () => this.positionHint());

    this.cameras.main.startFollow(this.jelly.sprite, true, 0.08, 0.08);

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      left: kb.addKey(K.LEFT), right: kb.addKey(K.RIGHT),
      a: kb.addKey(K.A), d: kb.addKey(K.D),
      space: kb.addKey(K.SPACE), shift: kb.addKey(K.SHIFT),
    };
    kb.on('keydown-ESC', () => this.toGame());

    this.setHint('按住空格蓄力，松开喷射 —— 跟上族群');
  }

  /* ---------------------------------------------------------------- */

  private buildSwarm(): void {
    const hasSwarm = this.textures.exists('swarm');
    const variants = ['swarm_a', 'swarm_b', 'swarm_c'];
    const fallback = this.status.jelly ? 'jelly' : 'jelly-placeholder';

    for (let i = 0; i < 22; i++) {
      const s = this.add.sprite(
        260 + Math.random() * 1300,
        200 + Math.random() * 560,
        hasSwarm ? 'swarm' : fallback,
      ).setDepth(6).setAlpha(0.5 + Math.random() * 0.35);

      if (hasSwarm) {
        s.play(variants[i % 3]);
        s.anims.setProgress(Math.random());
      } else {
        s.setScale(0.45 + Math.random() * 0.35);
        if (this.status.jelly) {
          s.play('idle');
          s.anims.setProgress(Math.random());
        }
      }
      this.swarm.push(s);
    }
  }

  private positionHint(): void {
    this.hint.setPosition(this.scale.width / 2, this.scale.height - 56);
  }

  private setHint(text: string): void {
    this.hint.setText(text);
    this.hint.setAlpha(0);
    if (text) this.tweens.add({ targets: this.hint, alpha: 1, duration: 500 });
  }

  private get level(): LevelData {
    return this.phase === 'swim' || this.phase === 'sweep' ? this.openLevel : this.ruinLevel;
  }

  /* ---------------------------------------------------------------- */

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.phaseTimer += dt;
    this.dialogue.update(dt);

    this.driftSwarm(dt);

    const prevState = this.jelly.state;
    this.jelly.update(dt, this.readInput(), this.tuning, DEFAULT_FLAGS, this.level);

    if (this.jelly.state === 'thrust' && prevState !== 'thrust') {
      audio.thrust(0.6);
      this.particles.thrust(this.jelly.x, this.jelly.y, this.jelly.facing, 0.6);
    }
    if (this.jelly.state === 'charge') {
      this.particles.intake(this.jelly.x, this.jelly.y, this.jelly.charge);
    }

    this.runPhase(dt);

    if (this.undercurrentFx) {
      const cam = this.cameras.main;
      this.undercurrentFx.setPosition(cam.midPoint.x, cam.midPoint.y);
      this.undercurrentFx.tilePositionX += 700 * dt;
    }

    this.particles.update(dt, this.cameras.main.worldView, this.time.now);
    audio.updateAmbient(dt);
  }

  private readInput(): JellyfishInput {
    // 只有「跟着族群游」和「废墟探索」两段交给玩家，其余是叙事
    const free = this.phase === 'swim' || this.phase === 'explore';
    if (!free) return { charging: false, turn: 0, aimAngle: null, pulse: false };

    const turn =
      (this.keys.left.isDown || this.keys.a.isDown ? -1 : 0) +
      (this.keys.right.isDown || this.keys.d.isDown ? 1 : 0);

    let aimAngle: number | null = null;
    if (turn === 0) {
      const p = this.input.activePointer;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      const dx = w.x - this.jelly.x;
      const dy = w.y - this.jelly.y;
      if (dx * dx + dy * dy > 400) aimAngle = Math.atan2(dy, dx);
    }

    const pulseDown = this.keys.shift.isDown || this.input.activePointer.rightButtonDown();
    const pulse = pulseDown && !this.prevPulse;
    this.prevPulse = pulseDown;

    return {
      charging: this.keys.space.isDown || this.input.activePointer.leftButtonDown(),
      turn, aimAngle, pulse,
    };
  }

  private driftSwarm(dt: number): void {
    if (this.phase !== 'swim' && this.phase !== 'sweep') return;
    const fleeing = this.phase === 'sweep';
    for (const s of this.swarm) {
      s.x += (fleeing ? 220 : 24) * dt;
      s.y += (fleeing ? -140 : Math.sin(this.time.now / 900 + s.x) * 6) * dt;
    }
  }

  /* ---------------------------------------------------------------- */

  private runPhase(dt: number): void {
    switch (this.phase) {
      case 'swim':
        this.jelly.velocity.x += 22 * dt;
        // 给足时间熟悉手感再让暗流来，否则玩家还没觉得"我属于这里"就被冲走了
        if (this.phaseTimer > 11) this.toSweep();
        break;

      case 'sweep':
        this.jelly.velocity.x += 520 * dt;
        this.jelly.velocity.y += 180 * dt;
        this.cameras.main.shake(80, 0.003);
        if (this.phaseTimer > 2.0) this.toArrive();
        break;

      case 'arrive':
        this.jelly.velocity.scale(1 - 2.4 * dt);
        if (this.phaseTimer > 2.4) {
          this.phase = 'explore';
          this.phaseTimer = 0;
          this.setHint('往深处游');
        }
        break;

      case 'explore':
        if (this.jelly.x > this.doorX - 170) this.toApproach();
        break;

      case 'approach': {
        const tx = this.doorX - 110;
        this.jelly.velocity.x += (tx - this.jelly.x) * 1.6 * dt;
        this.jelly.velocity.y += (this.doorY + 10 - this.jelly.y) * 1.6 * dt;
        if (this.phaseTimer > 1.6) this.toScan();
        break;
      }

      case 'scan':
        this.jelly.velocity.scale(1 - 3 * dt);
        break;

      case 'welcome':
      case 'enter':
        break;
    }
  }

  /* ---------------------------------------------------------------- */

  private toSweep(): void {
    this.phase = 'sweep';
    this.phaseTimer = 0;
    this.setHint('');
    audio.hurt();
    this.cameras.main.flash(240, 11, 16, 38);

    if (this.textures.exists('undercurrent')) {
      const cam = this.cameras.main;
      this.undercurrentFx = this.add.tileSprite(
        cam.midPoint.x, cam.midPoint.y, cam.width / cam.zoom + 640, 320, 'undercurrent',
      ).setDepth(40).setAlpha(0);
      this.tweens.add({ targets: this.undercurrentFx, alpha: 0.9, duration: 300 });
      let f = 0;
      this.undercurrentTimer = this.time.addEvent({
        delay: 100, loop: true,
        callback: () => this.undercurrentFx?.setFrame((f = (f + 1) % 6)),
      });
    }

    this.time.delayedCall(1300, () => this.cameras.main.fadeOut(700, 11, 16, 38));
  }

  /** 落进废墟：只换场景内容，不换 Scene，主角的物理状态保持连续 */
  private toArrive(): void {
    this.phase = 'arrive';
    this.phaseTimer = 0;

    this.swarm.forEach((s) => s.destroy());
    this.swarm = [];
    this.undercurrentFx?.destroy();
    this.undercurrentFx = undefined;
    this.undercurrentTimer?.remove();
    this.openBg.destroy();

    this.buildRuinField();

    this.cameras.main.setBounds(0, 0, this.ruinLevel.width * TILE, this.ruinLevel.height * TILE);
    this.jelly.setPosition(6 * TILE, 8 * TILE);
    this.jelly.velocity.set(40, 60);
    this.cameras.main.fadeIn(1600, 11, 16, 38);

    this.dialogue.play([
      { text: '水流把你甩了出来。\n族群不在了。', hold: 2.8 },
      { text: '这里到处是金属。\n有些还亮着 —— 亮得很勉强，像忘了怎么停下来。', hold: 3.4 },
    ]);
  }

  /**
   * 搭出废墟场。
   *
   * 地形用和正片相同的图块与自动拼接；散落零件、倒地的机器人、破损接头
   * 都由 tools/gen_env_assets.py 程序生成，摆放位置按地形算出来 ——
   * 零件落在地面上，接头贴在墙边，不是随机撒在水里。
   */
  private buildRuinField(): void {
    const w = this.ruinLevel.width * TILE;
    const h = this.ruinLevel.height * TILE;

    const bg = this.add.graphics().setDepth(0);
    bg.fillGradientStyle(COLORS.deep, COLORS.deep, COLORS.abyss, COLORS.abyss, 1);
    bg.fillRect(0, 0, w, h);

    const manifest = this.cache.json.get('manifest') as { blob47: BlobTables } | undefined;
    const tilesMeta = this.cache.json.get('tiles-meta') as
      { frames: { filename: string }[] } | undefined;
    if (manifest && tilesMeta && this.textures.exists('tiles')) {
      new AutoTiler(this.ruinLevel, manifest.blob47, tilesMeta).build(this, 'tiles').setDepth(1);
    }

    const floor = this.floorTop();

    // 散落零件：只落在地面上
    if (this.textures.exists('env_debris')) {
      let x = 10 * TILE;
      let i = 0;
      while (x < 64 * TILE) {
        const gx = Math.floor(x / TILE);
        const gy = floor[gx];
        if (gy > 0) {
          this.add.sprite(x, gy * TILE + 2, 'env_debris', i % 6)
            .setOrigin(0.5, 1).setDepth(4);
        }
        x += 96 + Math.random() * 140;
        i++;
      }
    }

    // 倒地的机器人：放在玩家一定会经过的开阔地面上
    if (this.textures.exists('env_fallen_robot')) {
      const gx = 37;
      const gy = floor[gx];
      if (gy > 0) {
        this.add.sprite(gx * TILE, gy * TILE + 2, 'env_fallen_robot')
          .setOrigin(0.5, 1).setDepth(5).play('robot_idle');
      }
    }

    // 破损接头：坐在残构顶面上，火花才有来源 ——
    // 纵坐标从该列的地面高度推出来，换了地形也不会飘在水里
    if (this.textures.exists('env_spark')) {
      for (const gx of [11, 24, 48, 59]) {
        const gy = floor[gx];
        if (gy <= 0) continue;
        const s = this.add.sprite(gx * TILE + TILE / 2, gy * TILE - TILE / 2, 'env_spark')
          .setDepth(5);
        s.play('spark_flicker');
        s.anims.setProgress(Math.random());
      }
    }

    // 机械门：底边落在地面上
    const doorGx = Math.floor(this.doorX / TILE);
    const groundY = (floor[doorGx] > 0 ? floor[doorGx] : 16) * TILE;
    this.doorY = groundY - 64;
    if (this.textures.exists('env_mech_door')) {
      this.door = this.add.sprite(this.doorX + 40, this.doorY, 'env_mech_door').setDepth(6);
      this.door.setFrame(0);
    }
  }

  /** 每列最靠上的实心地面格，用来把物件摆在地上而不是浮在水里 */
  private floorTop(): number[] {
    const out: number[] = [];
    for (let x = 0; x < this.ruinLevel.width; x++) {
      let found = -1;
      for (let y = 2; y < this.ruinLevel.height; y++) {
        if (this.ruinLevel.solid[y][x]) { found = y; break; }
      }
      out.push(found);
    }
    return out;
  }

  private toApproach(): void {
    if (this.phase !== 'explore') return;
    this.phase = 'approach';
    this.phaseTimer = 0;
    this.setHint('');
  }

  private toScan(): void {
    this.phase = 'scan';
    this.phaseTimer = 0;

    this.door?.play('door_scan');
    audio.relayOn();

    // 蓝光从上往下扫过主角。用补间控制的亮带，比逐帧贴图更好调时长
    const beam = this.add.rectangle(
      this.jelly.x, this.doorY - 64, 210, 3, COLORS.biolum, 0.9,
    ).setDepth(30);
    this.tweens.add({
      targets: beam, y: this.doorY + 64, duration: 1500, ease: 'Sine.InOut',
      onComplete: () => { beam.destroy(); this.toWelcome(); },
    });
    this.tweens.add({ targets: beam, alpha: 0.35, duration: 220, yoyo: true, repeat: 5 });
  }

  private toWelcome(): void {
    this.phase = 'welcome';
    this.phaseTimer = 0;
    audio.pulse();
    this.particles.pulse(this.jelly.x, this.jelly.y, 180);

    this.dialogue.play([
      { who: '???', text: '欢……迎……', corrupt: 0.55, hold: 2.0 },
      { who: '???', text: '欢迎，来访者。', corrupt: 0.16, hold: 2.6 },
      { who: '???', text: '登记为第……（数据损坏）……位。\n请进。', corrupt: 0.4, hold: 3.0 },
    ], () => this.toEnter());
  }

  private toEnter(): void {
    this.phase = 'enter';
    this.phaseTimer = 0;
    this.door?.play('door_open');
    audio.gateOpen();

    // 门开之后主角自己游进去 —— 这一下是结果，不是挑战
    this.tweens.add({
      targets: this.jelly.sprite,
      x: this.doorX + 40, y: this.doorY + 10,
      duration: 2200, delay: 700, ease: 'Sine.In',
    });
    this.time.delayedCall(2700, () => {
      this.cameras.main.fadeOut(900, 11, 16, 38);
      this.time.delayedCall(950, () => this.toGame());
    });
  }

  private toGame(): void {
    this.dialogue.destroy();
    this.scene.start('game', { status: this.status });
  }
}

/** 一片没有任何实心格的开阔水域 */
function emptyLevel(w: number, h: number): LevelData {
  const width = Math.ceil(w / TILE);
  const height = Math.ceil(h / TILE);
  const solid: boolean[][] = [];
  const terrain: (('metal' | 'rock') | null)[][] = [];
  for (let y = 0; y < height; y++) {
    solid[y] = new Array(width).fill(false);
    terrain[y] = new Array(width).fill(null);
  }
  return {
    width, height, solid, terrain,
    spawn: { x: 0, y: 0 }, checkpoints: [], gate: [],
    relays: [], vents: [], conduits: [], drones: [],
  };
}
