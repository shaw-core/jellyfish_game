import Phaser from 'phaser';
import { COLORS } from '../config/tuning';
import { Particles } from '../game/Particles';
import { audio } from '../audio/AudioSystem';
import type { AssetStatus } from './BootScene';
import { FONT, SIZE } from '../ui/theme';
import { continueGate } from '../ui/continueGate';
import { BUILD_ID } from '../config/build';


/**
 * 标题画面。
 *
 * 刻意不放主角 —— 主角第一次出现应该是在开场过场里、和族群在一起，
 * 那个"它本来属于某个地方"的反差才有用。这里只有水、海雪，
 * 和远处一点够不着的光。
 */
export class TitleScene extends Phaser.Scene {
  private status!: AssetStatus;
  private particles!: Particles;
  private index = 0;
  private items: Phaser.GameObjects.Text[] = [];
  private marker?: Phaser.GameObjects.Sprite;

  constructor() {
    super('title');
  }

  init(data: { status: AssetStatus }): void {
    this.status = data.status;
    // Phaser 复用 Scene 实例：create() 会重跑，但类字段初始化器只在构造时
    // 执行过一次。不在这里清空的话，items 会累积上一轮已销毁的 Text，
    // refresh() 对销毁对象调 setColor 会抛异常，整个标题场景当场废掉 ——
    // 表现就是「按任意键返回没反应」（其实返回了，只是标题坏了）
    this.items = [];
    this.marker = undefined;
    this.index = 0;
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.abyss);

    if (this.textures.exists('title_backdrop')) {
      // 背景是 480×270 的点阵，只按整数倍放大，非整数倍会把像素糊掉；
      // 放大后不足的边缘由底色补，所以底色必须和背景四角一致
      const img = this.add.image(width / 2, height / 2, 'title_backdrop');
      const scale = Math.max(1, Math.ceil(Math.max(width / 480, height / 270)));
      img.setScale(scale).setDepth(0);
    } else {
      const g = this.add.graphics();
      g.fillGradientStyle(COLORS.deep, COLORS.deep, COLORS.abyss, COLORS.abyss, 1);
      g.fillRect(0, 0, width, height);
    }

    this.particles = new Particles(this, 5);

    // Logo 自带英文副标与「余烬」的暖橙，不要再叠文字
    const heads: Phaser.GameObjects.GameObject[] = [];
    if (this.textures.exists('title_logo')) {
      const logo = this.add.image(width / 2, height * 0.34, 'title_logo');
      const s = Math.max(1, Math.floor(Math.min(width * 0.8 / 512, 2)));
      logo.setScale(s).setAlpha(0).setDepth(2);
      heads.push(logo);
    } else {
      heads.push(
        this.add.text(width / 2, height * 0.34, '深海余烬与流光水母', {
          ...FONT, fontSize: SIZE.title, color: '#70FFE0',
        }).setOrigin(0.5).setAlpha(0),
      );
    }
    this.tweens.add({ targets: heads, alpha: 1, duration: 1400, delay: 400 });

    const labels = ['开始下潜', '直接进入 Zone 1', '操作说明'];
    labels.forEach((label, i) => {
      const t = this.add.text(width / 2, height * 0.58 + i * 26, label, {
        ...FONT, fontSize: SIZE.body, color: '#59636B',
      }).setOrigin(0.5).setAlpha(0).setInteractive({ useHandCursor: true });

      t.on('pointerover', () => { this.index = i; this.refresh(); });
      t.on('pointerup', () => this.choose());
      this.items.push(t);
      t.setDepth(2);
    });
    this.tweens.add({ targets: this.items, alpha: 1, duration: 900, delay: 1100 });

    this.add.text(width / 2, height - 24, '↑ ↓ 选择    Enter / 点击 确认', {
      ...FONT, fontSize: SIZE.small, color: '#25355F',
    }).setOrigin(0.5);

    // 构建标记：用来确认部署的到底是不是这一版
    this.add.text(width - 8, height - 8, BUILD_ID, {
      ...FONT, fontSize: SIZE.small, color: '#25355F',
    }).setOrigin(1, 1);

    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => { this.index = (this.index + 2) % 3; this.refresh(); });
    kb.on('keydown-DOWN', () => { this.index = (this.index + 1) % 3; this.refresh(); });
    kb.on('keydown-W', () => { this.index = (this.index + 2) % 3; this.refresh(); });
    kb.on('keydown-S', () => { this.index = (this.index + 1) % 3; this.refresh(); });
    // 用 keyup 确认：keydown 会在进入下个场景后继续重复，
    // 把下个场景的「按任意键」闸门一起触发掉
    kb.on('keyup-ENTER', () => this.choose());
    kb.on('keyup-SPACE', () => this.choose());

    if (this.textures.exists('menu_marker')) {
      this.marker = this.add.sprite(0, 0, 'menu_marker').setDepth(2);
      this.marker.play('marker_breath');
    }

    this.refresh();
  }

  private refresh(): void {
    this.items.forEach((t, i) => {
      // 防御：万一还是拿到了已销毁的对象，跳过而不是让整个场景崩掉
      if (!t.scene) return;
      t.setColor(i === this.index ? '#70FFE0' : '#59636B');
    });
    const active = this.items[this.index];
    if (this.marker && active) {
      this.marker.setPosition(active.x - active.width / 2 - 14, active.y);
    }
  }

  private choose(): void {
    // 音频必须在用户手势里解锁，标题菜单这一下正好
    audio.unlock();

    if (this.index === 2) {
      this.scene.start('help', { status: this.status });
      return;
    }
    this.scene.start(this.index === 0 ? 'prologue' : 'zone1tut', { status: this.status });
  }

  override update(_t: number, delta: number): void {
    this.particles.update(
      Math.min(delta / 1000, 1 / 30),
      new Phaser.Geom.Rectangle(0, 0, this.scale.width, this.scale.height),
      this.time.now,
    );
  }
}

/** 操作说明，从标题进入 */
export class HelpScene extends Phaser.Scene {
  private status!: AssetStatus;

  constructor() { super('help'); }

  init(data: { status: AssetStatus }): void { this.status = data.status; }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.abyss);

    const rows: [string, string][] = [
      ['空格 / 鼠标左键', '按住蓄力，松开喷射'],
      ['A D / ← →', '转向'],
      ['移动鼠标', '朝鼠标方向瞄准'],
      ['Shift / 鼠标右键', '生物脉冲'],
      ['R', '回到上一个检查点'],
      ['M', '静音'],
    ];

    this.add.text(width / 2, height * 0.22, '操作', {
      ...FONT, fontSize: SIZE.heading, color: '#70FFE0',
    }).setOrigin(0.5);

    rows.forEach(([k, v], i) => {
      const y = height * 0.32 + i * 26;
      this.add.text(width / 2 - 16, y, k, {
        ...FONT, fontSize: SIZE.body, color: '#D8792D',
      }).setOrigin(1, 0.5);
      this.add.text(width / 2 + 16, y, v, {
        ...FONT, fontSize: SIZE.body, color: '#DFFFF7',
      }).setOrigin(0, 0.5);
    });

    this.add.text(width / 2, height - 40, '按任意键返回', {
      ...FONT, fontSize: SIZE.small, color: '#59636B',
    }).setOrigin(0.5);

    continueGate(this, () => this.scene.start('title', { status: this.status }));
  }
}
