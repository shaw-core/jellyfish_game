import Phaser from 'phaser';
import { COLORS, DEFAULT_FLAGS, DEFAULT_TUNING, type Tuning } from '../config/tuning';
import { Jellyfish, type JellyfishInput } from '../game/Jellyfish';
import { Particles } from '../game/Particles';
import { AutoTiler, wreckFrame, type BlobTables, type WreckFamily } from '../game/AutoTiler';
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
  private doorIsV2 = false;
  private arrived = false;
  private stall = '';
  private diag?: Phaser.GameObjects.Text;
  private scanCone?: Phaser.GameObjects.Graphics;
  private coneImg?: Phaser.GameObjects.Image;
  private lamp?: Phaser.GameObjects.Sprite;
  private scanOrigin = { x: 0, y: 0 };
  private scanAngle = { v: 0 };
  private scanHit = false;
  private undercurrentFx?: Phaser.GameObjects.Sprite;
  private parallax: { far?: Phaser.GameObjects.TileSprite; mid?: Phaser.GameObjects.TileSprite } = {};
  private shaftFx?: Phaser.GameObjects.Sprite;
  private farSwarm: Phaser.GameObjects.Sprite[] = [];
  private scanHl?: Phaser.GameObjects.Sprite;
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
    this.prevPulse = false;
    this.door = undefined;
    this.undercurrentFx = undefined;
    this.parallax = {};
    this.shaftFx = undefined;
    this.farSwarm = [];
    this.scanHl = undefined;
    this.doorIsV2 = false;
    this.doorY = 10 * TILE;
    this.arrived = false;
    this.scanCone = undefined;
    this.coneImg = undefined;
    this.lamp = undefined;
    this.scanHit = false;
    this.stall = '';
    this.tuning = { ...DEFAULT_TUNING };
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

    this.buildParallax();

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

    // 诊断条：正常时不显示，某一段超时才浮出来。
    // 同类静默故障已经出现四次，每次都得靠猜，这次让它自己说
    this.diag = this.add.text(8, 8, '', { ...FONT, fontSize: SIZE.small, color: '#FF3344' })
      .setScrollFactor(0).setDepth(90).setAlpha(0);
  }

  /* ---------------------------------------------------------------- */

  /**
   * 三层视差：远景 / 中景 / 主体。
   *
   * 之前只有一层纯渐变，主角游起来像在原地 —— 水里没有参照物，速度感
   * 全靠粒子撑，撑不住。远景对比度实测标准差只有 2.5，正好：它的作用是
   * 给速度感，不是给信息。
   *
   * scrollFactor 决定跟随相机的比例，越小越远。
   */
  private buildParallax(): void {
    const { width, height } = this.scale;
    const vw = width / this.cameras.main.zoom + 480;
    const vh = height / this.cameras.main.zoom + 270;

    if (this.textures.exists('bg_far')) {
      this.parallax.far = this.add.tileSprite(0, 0, vw, vh, 'bg_far')
        .setOrigin(0, 0).setScrollFactor(0).setDepth(1);
    }
    if (this.textures.exists('bg_mid')) {
      this.parallax.mid = this.add.tileSprite(0, 0, vw, vh, 'bg_mid')
        .setOrigin(0, 0).setScrollFactor(0).setDepth(2).setAlpha(0.9);
    }

    // 海面光柱：全场唯一提示"上面有个更好的地方"的元素，
    // 结局要回去的方向。开场埋下它，结局才有分量
    if (this.textures.exists('surface_shaft')) {
      this.shaftFx = this.add.sprite(OPEN_W * 0.38, 0, 'surface_shaft')
        .setOrigin(0.5, 0).setDepth(3).setAlpha(0.5).setScrollFactor(0.35);
      this.shaftFx.play('surface_shaft');
    }

    // 远景族群：比主体那层再小一档，只有轮廓，制造纵深
    if (this.textures.exists('swarm_far')) {
      for (let i = 0; i < 16; i++) {
        const s = this.add.sprite(
          Math.random() * OPEN_W, 150 + Math.random() * 600, 'swarm_far',
        ).setDepth(3).setAlpha(0.4).setScrollFactor(0.45);
        s.play(['swarm_far_a', 'swarm_far_b', 'swarm_far_c'][i % 3]);
        randomizePhase(s);
        this.farSwarm.push(s);
      }
    }
  }

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
        randomizePhase(s);
      } else {
        s.setScale(0.45 + Math.random() * 0.35);
        if (this.status.jelly) {
          s.play('idle');
          randomizePhase(s);
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
    this.watchdog();

    const cam = this.cameras.main;
    if (this.parallax.far) {
      this.parallax.far.tilePositionX = cam.scrollX * 0.12;
      this.parallax.far.tilePositionY = cam.scrollY * 0.08;
    }
    if (this.parallax.mid) {
      this.parallax.mid.tilePositionX = cam.scrollX * 0.34;
      this.parallax.mid.tilePositionY = cam.scrollY * 0.22;
    }
    for (const s of this.farSwarm) s.x -= 6 * dt;

    if (this.undercurrentFx) {
      this.undercurrentFx.setPosition(cam.midPoint.x, cam.midPoint.y);
    }
    if (this.phase === 'scan') this.drawScanCone();

    this.particles.update(dt, this.cameras.main.worldView, this.time.now);
    audio.updateAmbient(dt);
  }

  /**
   * 分段看门狗。
   *
   * 开场是线性的，任何一段卡住都等于游戏报废。这里给每段一个上限，
   * 超时就强制推进 —— 宁可跳过一段演出，也不能让玩家永远停在那儿。
   */
  private watchdog(): void {
    const cap: Partial<Record<Phase, [number, () => void]>> = {
      sweep: [4, () => this.toArrive()],
      arrive: [8, () => { this.phase = 'explore'; this.phaseTimer = 0; this.setHint('往深处游'); }],
      approach: [6, () => this.toScan()],
      scan: [9, () => this.toWelcome()],
      welcome: [16, () => this.toEnter()],
      enter: [12, () => this.toGame()],
    };
    const entry = cap[this.phase];
    if (!entry) return;
    if (this.phaseTimer > entry[0]) {
      console.warn(`[prologue] 阶段 ${this.phase} 超时，强制推进`);
      this.stall = `阶段 ${this.phase} 超时已强制推进（${entry[0]}s）`;
      this.diag?.setText(this.stall).setAlpha(1);
      this.time.delayedCall(4000, () => this.diag?.setAlpha(0));
      entry[1]();
    }
  }

  /** 建场失败时的兜底地形：只画地面与门，保证流程能走完 */
  private buildFallbackField(): void {
    const w = this.ruinLevel.width * TILE;
    const h = this.ruinLevel.height * TILE;
    const g = this.add.graphics().setDepth(1);
    g.fillGradientStyle(COLORS.deep, COLORS.deep, COLORS.abyss, COLORS.abyss, 1);
    g.fillRect(0, 0, w, h);
    g.fillStyle(COLORS.slate, 1);
    for (let y = 0; y < this.ruinLevel.height; y++) {
      for (let x = 0; x < this.ruinLevel.width; x++) {
        if (this.ruinLevel.solid[y][x]) g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    this.doorY = 14 * TILE - 64;
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
        if (this.phaseTimer < 1.2) this.cameras.main.shake(80, 0.003);
        if (this.phaseTimer > 1.9) this.toArrive();
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
        // 停在门前一段距离、略低于灯源 —— 锥形从上往下摆过来必然覆盖到
        const tx = this.doorX - 150;
        const ty = this.doorY + 40;
        this.jelly.velocity.x += (tx - this.jelly.x) * 1.6 * dt;
        this.jelly.velocity.y += (ty - this.jelly.y) * 1.6 * dt;
        if (this.phaseTimer > 1.6) this.toScan();
        break;
      }

      case 'scan':
        // 扫描期间主角悬停不动，否则锥形跟着它跑，"被照到"就没有张力了
        this.jelly.velocity.scale(1 - 4 * dt);
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

    // v2 比背景更暗（平均亮度 23.4，最亮色只占 0.2% 面积），
    // 是一股把光吃掉的东西，而不是漂亮的水
    const key = this.textures.exists('undercurrent2') ? 'undercurrent2' : 'undercurrent';
    if (this.textures.exists(key)) {
      const cam = this.cameras.main;
      this.undercurrentFx = this.add.sprite(cam.midPoint.x, cam.midPoint.y, key)
        .setDepth(40).setAlpha(0).setScale(3);
      this.undercurrentFx.play(key === 'undercurrent2' ? 'undercurrent2' : 'undercurrent');
      this.tweens.add({ targets: this.undercurrentFx, alpha: 0.95, duration: 300 });
    }

    // 族群被冲散：换成受冲击的姿态，而不是原样平移出画
    if (this.textures.exists('swarm_scatter')) {
      for (const sp of this.swarm) {
        sp.play('swarm_scatter');
        randomizePhase(sp);
      }
    }

    // 推进只靠 runPhase 里的计时，不挂相机事件 —— 事件在场景重启后
    // 是否还能如期送达，取决于一堆我们控制不了的内部状态。
    // 淡出只负责画面，不负责流程。
    this.time.delayedCall(1100, () => this.cameras.main.fadeOut(700, 11, 16, 38));
  }

  /** 落进废墟：只换场景内容，不换 Scene，主角的物理状态保持连续 */
  private toArrive(): void {
    if (this.arrived) return;            // 幂等：计时与看门狗都可能触发
    this.arrived = true;
    this.phase = 'arrive';
    this.phaseTimer = 0;

    this.swarm.forEach((s) => s.destroy());
    this.swarm = [];
    this.undercurrentFx?.destroy();
    this.undercurrentFx = undefined;
    this.parallax.far?.destroy();
    this.parallax.mid?.destroy();
    this.parallax = {};
    this.shaftFx?.destroy();
    this.farSwarm.forEach((s) => s.destroy());
    this.farSwarm = [];
    this.openBg.destroy();

    try {
      this.buildRuinField();
    } catch (err) {
      // 建场里任何一处异常都不该让玩家卡在空背景里。
      // 至少保证地形还在，玩家能走到门口
      console.error('[prologue] 废墟场构建失败，退化为最简地形', err);
      this.buildFallbackField();
    }

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

    // 海床岩层仍用正片那套 47 掩码图块，保持空间语言一致
    const manifest = this.cache.json.get('manifest') as { blob47: BlobTables } | undefined;
    const tilesMeta = this.cache.json.get('tiles-meta') as
      { frames: { filename: string }[] } | undefined;
    if (manifest && tilesMeta && this.textures.exists('tiles')) {
      new AutoTiler(this.ruinLevel, manifest.blob47, tilesMeta).build(this, 'tiles').setDepth(1);
    }

    // 金属残构改用残骸图块 —— 这些是沉船式的废弃物，不是完好的设施衬里。
    // 四个族分段使用，四段场景才不会看起来是同一个地方
    this.paintWrecks();

    const floor = this.floorTop();

    // 接触过渡：沉积物堆积 + 接触阴影。物件直接坐在地面上是"粗糙"最直接的来源
    if (this.textures.exists('contact_decals')) {
      for (let gx = 2; gx < this.ruinLevel.width - 2; gx += 1) {
        const gy = floor[gx];
        if (gy <= 0) continue;
        if (Math.random() < 0.45) {
          this.add.sprite(gx * TILE + TILE / 2, gy * TILE, 'contact_decals',
            Math.floor(Math.random() * 3))
            .setOrigin(0.5, 0.5).setDepth(3).setAlpha(0.85);
        }
      }
    }

    // 附着生物：这片海之前是死的，除了主角什么活物都没有。
    // 加上之后「死去的机械」和「活着的海」才形成对冲
    // 海床地面装饰：打散岩层图块的重复节奏
    if (this.textures.exists('floor_decals')) {
      for (let gx = 2; gx < this.ruinLevel.width - 2; gx++) {
        const gy = floor[gx];
        if (gy <= 0 || Math.random() > 0.35) continue;
        this.add.sprite(gx * TILE + TILE / 2, gy * TILE, 'floor_decals',
          Math.floor(Math.random() * 12)).setOrigin(0.5, 1).setDepth(3).setAlpha(0.9);
      }
    }

    if (this.textures.exists('growth2') || this.textures.exists('growth')) {
      for (let gx = 4; gx < this.ruinLevel.width - 4; gx += 2) {
        const gy = floor[gx];
        if (gy <= 0 || Math.random() > 0.4) continue;
        const v2 = this.textures.exists('growth2');
        const kind = Math.random();
        const g = this.add.sprite(gx * TILE + TILE / 2, gy * TILE, v2 ? 'growth2' : 'growth')
          .setOrigin(0.5, 1).setDepth(4);
        if (kind < 0.45) {
          const i = 1 + Math.floor(Math.random() * 3);
          g.play(v2 ? `g2_worm_${i}` : `growth_worm_${i}`);
        } else if (kind < 0.75) {
          const i = 1 + Math.floor(Math.random() * 2);
          g.play(v2 ? `g2_anemone_${i}` : `growth_anemone_${i}`);
        } else {
          // 菌毯是静帧，没有动画 —— 相位随机化必须能识别这种情况
          g.setFrame(v2 ? 22 + Math.floor(Math.random() * 3) : 12 + Math.floor(Math.random() * 3));
        }
        randomizePhase(g);
      }
    }

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

    // 倒地的机器人：和 Zone 1 里还在巡逻的是同一型号，
    // 玩家在这里记住轮廓，后面遇到活的才会想「原来它们本来会动」
    const robotKey = this.textures.exists('robot2') ? 'robot2' : 'env_fallen_robot';
    if (this.textures.exists(robotKey)) {
      const gx = 37;
      const gy = floor[gx];
      if (gy > 0) {
        this.add.sprite(gx * TILE, gy * TILE + 2, robotKey)
          .setOrigin(0.5, 1).setDepth(5)
          .play(robotKey === 'robot2' ? 'robot2_idle' : 'robot_idle');
      }
    }

    // 破损接头 + 点光。之前火花不照亮任何东西，所以完全没有光感
    const sparkKey = this.textures.exists('spark2') ? 'spark2' : 'env_spark';
    if (this.textures.exists(sparkKey)) {
      for (const gx of [11, 24, 48, 59]) {
        const gy = floor[gx];
        if (gy <= 0) continue;
        const px = gx * TILE + TILE / 2;
        const py = gy * TILE - TILE / 2;

        if (this.textures.exists('fx_point_light')) {
          const glow = this.add.image(px, py, 'fx_point_light')
            .setDepth(4).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1);
          glow.setTint(0xffd700);
          // 亮度跟着放电帧走，不是匀速呼吸 —— 火光是抖的
          this.tweens.add({
            targets: glow, alpha: 0.32,
            duration: 90, yoyo: true, repeat: -1, repeatDelay: 520,
            delay: Math.random() * 900,
          });
        }

        const s = this.add.sprite(px, py, sparkKey).setDepth(5);
        s.play(sparkKey === 'spark2' ? 'spark2_flicker' : 'spark_flicker');
        randomizePhase(s);
      }
    }

    // 机械门：底边落在地面上
    const doorGx = Math.floor(this.doorX / TILE);
    const groundY = (floor[doorGx] > 0 ? floor[doorGx] : 16) * TILE;
    this.doorY = groundY - 64;
    const doorKey = this.textures.exists('door2') ? 'door2' : 'env_mech_door';
    if (this.textures.exists(doorKey)) {
      this.door = this.add.sprite(this.doorX + 40, this.doorY, doorKey).setDepth(6);
      this.door.setFrame(0);
      this.doorIsV2 = doorKey === 'door2';
      if (this.doorIsV2) {
        // 门一直在极缓慢地"察觉"，读取槽偶尔亮一下 —— 它醒着，只是没人来
        this.time.delayedCall(1200, () => {
          if (this.phase === 'explore' || this.phase === 'arrive') this.door?.play('door2_detect');
        });
      }
    }
  }

  /**
   * 用残骸图块画金属残构。
   *
   * 按 x 分段轮换四个族，于是画面从左到右经过倾斜舱段 → 断裂桁架 →
   * 翻倒储罐 → 沉降平台，四段场景不会看起来是同一个地方。
   * 桁架那族是镂空的，画面因此有了可透视的层次。
   */
  private paintWrecks(): void {
    const key = this.textures.exists('wreck2') ? 'wreck2' : 'wreck';
    if (!this.textures.exists(key)) return;

    const families: WreckFamily[] = [
      'tilted_hull', 'open_truss', 'overturned_tank', 'sunken_platform',
    ];
    const solid = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= this.ruinLevel.width || y >= this.ruinLevel.height) return false;
      return this.ruinLevel.terrain[y][x] === 'metal';
    };

    const rt = this.add.renderTexture(
      0, 0, this.ruinLevel.width * TILE, this.ruinLevel.height * TILE,
    ).setOrigin(0, 0).setDepth(2);
    const stamp = this.add.image(0, 0, key).setVisible(false).setOrigin(0, 0);

    for (let y = 0; y < this.ruinLevel.height; y++) {
      for (let x = 0; x < this.ruinLevel.width; x++) {
        if (!solid(x, y)) continue;
        const fam = families[Math.floor(x / 19) % families.length];
        const frame = wreckFrame(
          fam, solid(x, y - 1), solid(x + 1, y), solid(x, y + 1), solid(x - 1, y),
        );
        stamp.setFrame(frame);
        // 残骸是 16px 的，图块格是 32px，按 2 倍整数放大铺满
        stamp.setScale(2);
        rt.draw(stamp, x * TILE, y * TILE);
      }
    }
    stamp.destroy();
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

    if (this.doorIsV2) this.door?.play('door2_scan');
    else this.door?.play('door_scan');
    audio.relayOn();

    // 探照灯从门顶灯具射出，绕灯源摆动扫过整片水域。
    // 之前是一条平移的横带，主角只要不在那条线上就完全扫不到。
    this.scanOrigin = { x: this.doorX + 40, y: this.doorY - 44 };

    if (this.textures.exists('scan_lamp')) {
      this.lamp = this.add.sprite(this.scanOrigin.x, this.scanOrigin.y - 10, 'scan_lamp')
        .setDepth(29);
      this.lamp.play('lamp_scan');
    }

    if (this.textures.exists('cone_beam')) {
      // 贴图左端窄右端宽，锚在左端 = 灯源，按角度旋转、按长度拉伸
      this.coneImg = this.add.image(this.scanOrigin.x, this.scanOrigin.y, 'cone_beam')
        .setOrigin(0, 0.5).setDepth(28)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.75);
      this.coneImg.setDisplaySize(620, 200);
    } else {
      this.scanCone = this.add.graphics().setDepth(28).setBlendMode(Phaser.BlendModes.ADD);
    }
    this.scanAngle = { v: Math.PI * 0.78 };

    this.tweens.add({
      targets: this.scanAngle,
      v: Math.PI * 1.22,
      duration: 2600,
      ease: 'Sine.InOut',
      yoyo: true,
      onComplete: () => this.toWelcome(),
    });

    const hlKey = this.textures.exists('scan_hl2') ? 'scan_hl2' : 'scan_hl';
    if (this.textures.exists(hlKey)) {
      this.scanHl = this.add.sprite(this.jelly.x, this.jelly.y, hlKey)
        .setDepth(21).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.scanHl.play(hlKey === 'scan_hl2' ? 'scan_hl2' : 'scan_hl');
    }
  }

  /** 每帧重画探照灯，并判断主角是否被照到 */
  private drawScanCone(): void {
    const o = this.scanOrigin;
    const a = this.scanAngle.v;

    if (this.coneImg) {
      this.coneImg.setRotation(a);
    }

    const g = this.scanCone;
    if (g) {
      g.clear();
      const halfG = 0.16;
      for (const [spread, alpha] of [[halfG * 0.45, 0.16], [halfG * 0.75, 0.09], [halfG, 0.05]]) {
        g.fillStyle(0x70ffe0, alpha);
        g.beginPath();
        g.moveTo(o.x, o.y);
        for (let t = -1; t <= 1.001; t += 0.125) {
          g.lineTo(o.x + Math.cos(a + spread * t) * 620, o.y + Math.sin(a + spread * t) * 620);
        }
        g.closePath();
        g.fillPath();
      }
    }

    const half = 0.16;
    const len = 620;

    // 命中判定：主角与灯源连线的夹角落在锥内即被照到
    const dx = this.jelly.x - o.x;
    const dy = this.jelly.y - o.y;
    const dist = Math.hypot(dx, dy);
    const delta = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - a));
    const hit = dist < len && delta < half;

    if (this.scanHl) {
      this.scanHl.setPosition(this.jelly.x, this.jelly.y);
      this.scanHl.setAlpha(Phaser.Math.Linear(this.scanHl.alpha, hit ? 1 : 0, 0.2));
    }
    if (hit && !this.scanHit) {
      this.scanHit = true;
      this.lamp?.play('lamp_lock');
      audio.pulse();
      this.particles.pulse(this.jelly.x, this.jelly.y, 120);
    }
  }

  private toWelcome(): void {
    if (this.phase === 'welcome' || this.phase === 'enter') return;
    this.phase = 'welcome';
    this.phaseTimer = 0;
    this.scanCone?.destroy();
    this.scanCone = undefined;
    this.coneImg?.destroy();
    this.coneImg = undefined;
    this.lamp?.destroy();
    this.lamp = undefined;
    this.scanHl?.destroy();
    this.scanHl = undefined;
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
    if (this.doorIsV2) {
      // v2 多了解锁那一拍：锁扣先弹开，门板才滑动
      this.door?.play('door2_unlock');
      this.door?.once('animationcomplete', () => this.door?.play('door2_open'));
    } else {
      this.door?.play('door_open');
    }
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

/**
 * 随机化动画相位，让同类精灵不同步呼吸。
 *
 * 必须先确认真的有动画在播 —— Phaser 的 setProgress 内部直接取
 * currentAnim.getFrameByProgress，没有 currentAnim 时抛 TypeError。
 * 这一下会把调用它的整个 create/build 流程打断，表现是场景"什么都没建出来"。
 */
function randomizePhase(sprite: Phaser.GameObjects.Sprite): void {
  if (sprite.anims?.currentAnim) sprite.anims.setProgress(Math.random());
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
