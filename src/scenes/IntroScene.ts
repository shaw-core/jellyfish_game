import Phaser from 'phaser';
import { COLORS } from '../config/tuning';
import type { AssetStatus } from './BootScene';

const FONT = { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' };

/** 开场：坠落与失散 */
export class IntroScene extends Phaser.Scene {
  private status!: AssetStatus;

  constructor() {
    super('intro');
  }

  init(data: { status: AssetStatus }): void {
    this.status = data.status;
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.abyss);

    if (this.status.cutscenes) {
      const img = this.add.image(width / 2, height / 2 - 40, 'cut1');
      // 过场是 256×256 的点阵，只用整数倍放大，否则像素会糊
      const scale = Math.max(1, Math.floor(Math.min(width / 256, (height - 160) / 256)));
      img.setScale(scale);
      img.setAlpha(0);
      this.tweens.add({ targets: img, alpha: 1, duration: 900 });
    }

    const title = this.add.text(width / 2, height - 120, '深海余烬与流光水母', {
      ...FONT, fontSize: '20px', color: '#70FFE0',
    }).setOrigin(0.5).setAlpha(0);

    const sub = this.add.text(width / 2, height - 92,
      'Zone 1 · 锈蚀边缘', { ...FONT, fontSize: '12px', color: '#31D6C8' })
      .setOrigin(0.5).setAlpha(0);

    const body = this.add.text(width / 2, height - 62,
      '洋流把你从族群中撕开，坠进不见天日的断裂带。\n下方有座沉了几个世纪的废墟 —— 唯一的光是你自己。',
      { ...FONT, fontSize: '11px', color: '#59636B', align: 'center', lineSpacing: 6 })
      .setOrigin(0.5).setAlpha(0);

    const prompt = this.add.text(width / 2, height - 22, '按任意键开始', {
      ...FONT, fontSize: '11px', color: '#D8792D',
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: [title, sub], alpha: 1, duration: 700, delay: 500 });
    this.tweens.add({ targets: body, alpha: 1, duration: 700, delay: 1100 });
    this.tweens.add({
      targets: prompt, alpha: 1, duration: 600, delay: 1600,
      onComplete: () => this.tweens.add({
        targets: prompt, alpha: 0.25, duration: 900, yoyo: true, repeat: -1,
      }),
    });

    const go = () => this.scene.start('game', { status: this.status });
    this.input.keyboard?.once('keydown', go);
    this.input.once('pointerdown', go);
  }
}
