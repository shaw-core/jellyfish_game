import Phaser from 'phaser';
import { COLORS, DEFAULT_FLAGS, DEFAULT_TUNING, type Tuning } from '../config/tuning';
import { Jellyfish, type JellyfishInput } from '../game/Jellyfish';
import { Particles } from '../game/Particles';
import { Dialogue } from '../ui/Dialogue';
import { audio } from '../audio/AudioSystem';
import type { AssetStatus } from './BootScene';
import type { LevelData } from '../level/level1';
import { drawGlyphWall } from '../game/Glyphs';
import { FONT, SIZE } from '../ui/theme';


type Phase = 'drift' | 'rescue' | 'freed' | 'sweep' | 'fall' | 'land' | 'wake';

const W = 1600;
const H = 900;

/**
 * 开场。
 *
 * 书里说开端必须传达三件事：游戏目的、怎么玩、这是个什么样的世界，
 * 而且不能写成说明文（9-2）。所以这一段全部靠事件带：
 *
 *   逆流回头去顶开被缠住的幼体   → 教蓄力喷射，同时"救猫咪"
 *   暗流袭来、失去控制被卷落     → 教惯性，同时完成失散
 *   落地受惊本能发光照亮碑文     → 教脉冲，同时交代世界与目的
 *
 * 主角失散不是因为倒霉，是因为它回了头。这一点全程没有一个字说明。
 */
export class PrologueScene extends Phaser.Scene {
  private status!: AssetStatus;
  private tuning: Tuning = { ...DEFAULT_TUNING };
  private jelly!: Jellyfish;
  private particles!: Particles;
  private dialogue!: Dialogue;
  private hint!: Phaser.GameObjects.Text;

  private phase: Phase = 'drift';
  private phaseTimer = 0;
  private swarm: Phaser.GameObjects.Sprite[] = [];
  private juvenile!: Phaser.GameObjects.Sprite;
  private debris!: Phaser.GameObjects.Rectangle;
  private juvPos = { x: 300, y: 460 };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private prevPulse = false;
  private darkOverlay!: Phaser.GameObjects.Rectangle;
  private openLevel!: LevelData;

  constructor() {
    super('prologue');
  }

  init(data: { status: AssetStatus }): void {
    this.status = data.status;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.abyss);
    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setZoom(2);

    // 开场是一片开阔水域，没有任何实心格
    this.openLevel = {
      width: Math.ceil(W / 32), height: Math.ceil(H / 32),
      solid: [], terrain: [],
      spawn: { x: 0, y: 0 }, checkpoints: [], gate: [],
      relays: [], vents: [], conduits: [], drones: [],
    };
    for (let y = 0; y < this.openLevel.height; y++) {
      this.openLevel.solid[y] = new Array(this.openLevel.width).fill(false);
      this.openLevel.terrain[y] = new Array(this.openLevel.width).fill(null);
    }

    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(COLORS.deep, COLORS.deep, COLORS.abyss, COLORS.abyss, 1);
    g.fillRect(0, 0, W, H);

    this.buildSwarm();

    this.jelly = new Jellyfish(this, 760, 430, this.status.jelly);
    this.particles = new Particles(this, 18);
    this.dialogue = new Dialogue(this);

    this.darkOverlay = this.add.rectangle(0, 0, W, H, 0x0b1026)
      .setOrigin(0, 0).setDepth(50).setAlpha(0).setScrollFactor(0);

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
      esc: kb.addKey(K.ESC),
    };
    kb.on('keydown-ESC', () => this.finish());

    this.setHint('族群在向右迁徙 —— 但后面有东西不对劲');
    this.time.delayedCall(2600, () => {
      if (this.phase === 'drift') {
        this.phase = 'rescue';
        this.setHint('按住 空格 蓄力，松开喷射。逆流游回去');
      }
    });
  }

  /* ---------------------------------------------------------------- */

  private buildSwarm(): void {
    const key = this.status.jelly ? 'jelly' : 'jelly-placeholder';

    for (let i = 0; i < 14; i++) {
      const s = this.add.sprite(
        420 + Math.random() * 1100,
        180 + Math.random() * 520,
        key,
      );
      s.setDepth(6);
      s.setScale(0.45 + Math.random() * 0.4);
      s.setAlpha(0.5 + Math.random() * 0.3);
      if (this.status.jelly) {
        s.play('idle');
        // 相位错开，整群不会同步呼吸
        s.anims.setProgress(Math.random());
      }
      this.swarm.push(s);
    }

    // 被残骸缠住的幼体，在主角左后方
    this.debris = this.add.rectangle(this.juvPos.x + 14, this.juvPos.y + 6, 30, 8, 0x5b2d19)
      .setDepth(7).setAngle(28);

    this.juvenile = this.add.sprite(this.juvPos.x, this.juvPos.y, key).setDepth(8);
    this.juvenile.setScale(0.55);
    if (this.status.jelly) this.juvenile.play('idle');

    // 微弱求救式明灭 —— 不用一个字说明它有麻烦
    this.tweens.add({
      targets: this.juvenile, alpha: 0.35,
      duration: 620, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
  }

  private positionHint(): void {
    this.hint.setPosition(this.scale.width / 2, this.scale.height - 54);
  }

  private setHint(text: string): void {
    this.hint.setText(text);
    this.hint.setAlpha(0);
    this.tweens.add({ targets: this.hint, alpha: 1, duration: 500 });
  }

  /* ---------------------------------------------------------------- */

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.phaseTimer += dt;
    this.dialogue.update(dt);

    this.driftSwarm(dt);

    const input = this.readInput();
    const wasPulsing = this.jelly.pulsing;
    const prevState = this.jelly.state;

    this.jelly.update(dt, input, this.tuning, DEFAULT_FLAGS, this.openLevel);

    if (this.jelly.state === 'thrust' && prevState !== 'thrust') {
      audio.thrust(0.6);
      this.particles.thrust(this.jelly.x, this.jelly.y, this.jelly.facing, 0.6);
    }
    if (this.jelly.pulsing && !wasPulsing) {
      audio.pulse();
      this.particles.pulse(this.jelly.x, this.jelly.y, 220);
    }
    if (this.jelly.state === 'charge') {
      this.particles.intake(this.jelly.x, this.jelly.y, this.jelly.charge);
    }

    this.runPhase(dt);

    this.particles.update(dt, this.cameras.main.worldView, this.time.now);
    audio.updateAmbient(dt);
  }

  private readInput(): JellyfishInput {
    // 被卷落的两段里玩家的输入应当是无效的 —— 失控本身就是叙事
    const locked = this.phase === 'sweep' || this.phase === 'fall'
      || this.phase === 'land' || this.phase === 'wake';
    if (locked) return { charging: false, turn: 0, aimAngle: null, pulse: false };

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
    const speed = this.phase === 'sweep' || this.phase === 'fall' ? 160 : 26;
    for (const s of this.swarm) {
      s.x += speed * dt;
      s.y += Math.sin(this.time.now / 900 + s.x) * 6 * dt;
      if (this.phase === 'sweep' || this.phase === 'fall') s.y -= 90 * dt;
      if (s.x > W + 60) s.x = -60;
    }
  }

  /* ---------------------------------------------------------------- */

  private runPhase(dt: number): void {
    switch (this.phase) {
      case 'drift':
        // 迁徙的洋流把主角往右推，玩家还没拿到控制权的感觉
        this.jelly.velocity.x += 30 * dt;
        break;

      case 'rescue': {
        // 逆流：往左走要顶着水流，这就是教程的难度来源
        this.jelly.velocity.x += 48 * dt;
        const d = Math.hypot(this.jelly.x - this.juvPos.x, this.jelly.y - this.juvPos.y);
        if (d < 46) {
          this.phase = 'freed';
          this.phaseTimer = 0;
          this.onFreed();
        }
        break;
      }

      case 'freed':
        this.jelly.velocity.x += 20 * dt;
        if (this.phaseTimer > 2.6) {
          this.phase = 'sweep';
          this.phaseTimer = 0;
          this.onSweep();
        }
        break;

      case 'sweep':
        // 暗流：横向猛推 + 下拽，玩家操作无效
        this.jelly.velocity.x -= 420 * dt;
        this.jelly.velocity.y += 300 * dt;
        this.cameras.main.shake(60, 0.002);
        if (this.phaseTimer > 1.5) {
          this.phase = 'fall';
          this.phaseTimer = 0;
          this.cameras.main.fadeOut(900, 11, 16, 38);
        }
        break;

      case 'fall':
        this.jelly.velocity.y += 220 * dt;
        if (this.phaseTimer > 1.2) {
          this.phase = 'land';
          this.phaseTimer = 0;
          this.onLand();
        }
        break;

      case 'land':
        this.jelly.velocity.scale(1 - 2 * dt);
        break;

      case 'wake':
        break;
    }
  }

  private onFreed(): void {
    audio.relayOn();
    this.particles.pulse(this.juvPos.x, this.juvPos.y, 90);
    this.tweens.killTweensOf(this.juvenile);
    this.tweens.add({ targets: this.debris, alpha: 0, angle: 90, duration: 700 });
    this.tweens.add({ targets: this.juvenile, alpha: 1, duration: 300 });
    // 幼体被顶开后追着族群走 —— 它得救了，这件事不需要台词
    this.tweens.add({
      targets: this.juvenile, x: this.juvPos.x + 900, y: this.juvPos.y - 160,
      duration: 5200, ease: 'Sine.InOut',
    });
    this.setHint('');
  }

  private onSweep(): void {
    this.setHint('');
    this.cameras.main.flash(200, 11, 16, 38);
    audio.hurt();
  }

  private onLand(): void {
    // 落到断裂带底部：一片全黑，只剩主角
    this.swarm.forEach((s) => s.destroy());
    this.juvenile.destroy();
    this.debris.destroy();

    this.cameras.main.fadeIn(1200, 11, 16, 38);
    this.darkOverlay.setAlpha(0.97);
    this.jelly.setPosition(this.cameras.main.midPoint.x, this.cameras.main.midPoint.y);

    this.time.delayedCall(1400, () => this.onWake());
  }

  /**
   * 落地后的第一次脉冲是本能，不是玩家操作 —— 受惊的生物会发光。
   * 这一下同时做了三件事：教会脉冲、照亮碑文、惊醒守炉者。
   */
  private onWake(): void {
    this.phase = 'wake';

    audio.pulse();
    this.particles.pulse(this.jelly.x, this.jelly.y, 300);
    this.tweens.add({ targets: this.darkOverlay, alpha: 0.55, duration: 400, yoyo: true });

    // 被照亮的一整面碑文。用程序画而不是拿 Unicode 符号顶替 ——
    // 这是玩家第一次见到那个文明的文字，它不该是"别人的字"
    const wall = this.add.graphics().setDepth(52).setAlpha(0);
    drawGlyphWall(wall, this.jelly.x, this.jelly.y - 96, 6, 2, 16, 8, 0x31d6c8, 1);

    this.tweens.add({ targets: wall, alpha: 0.95, duration: 900 });
    this.tweens.add({ targets: wall, alpha: 0.22, duration: 2400, delay: 1200 });

    this.time.delayedCall(1800, () => {
      this.dialogue.play([
        { text: '有什么东西在黑暗里亮了一下。\n不是你。', hold: 2.6 },
        {
          who: '守炉者',
          text: '……检测到生物电。',
          corrupt: 0.35,
        },
        {
          who: '守炉者',
          text: '第九〇七次唤醒。距上一次……（数据损坏）……',
          corrupt: 0.5,
        },
        {
          who: '守炉者',
          text: '你是活的。真好。\n已经很久没有活的东西掉下来了。',
          corrupt: 0.15,
        },
        {
          who: '守炉者',
          text: '你想上去，对吧。\n上升气流只有一处 —— 主炉。往下走，我会指路。',
          corrupt: 0.1,
        },
      ], () => this.finish());
    });
  }

  private finish(): void {
    this.cameras.main.fadeOut(600, 11, 16, 38);
    this.time.delayedCall(650, () => {
      this.dialogue.destroy();
      this.scene.start('game', { status: this.status });
    });
  }
}
