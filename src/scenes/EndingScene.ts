import Phaser from 'phaser';
import { COLORS } from '../config/tuning';
import type { AssetStatus } from './BootScene';
import { audio } from '../audio/AudioSystem';
import { FONT, SIZE } from '../ui/theme';


/** 结局：苏醒与归群 */
export class EndingScene extends Phaser.Scene {
  private status!: AssetStatus;

  constructor() {
    super('ending');
  }

  init(data: { status: AssetStatus }): void {
    this.status = data.status;
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.abyss);
    this.cameras.main.fadeIn(800, 11, 16, 38);
    audio.victory();

    if (this.status.cutscenes) {
      const img = this.add.image(width / 2, height / 2 - 40, 'cut2');
      const scale = Math.max(1, Math.floor(Math.min(width / 256, (height - 160) / 256)));
      img.setScale(scale);
    }

    this.add.text(width / 2, height - 108, '穿过闸门', {
      ...FONT, fontSize: SIZE.heading, color: '#70FFE0',
    }).setOrigin(0.5);

    this.add.text(width / 2, height - 78,
      '锈蚀边缘只是断裂带的入口。\n更深处，服务器农场仍在黑暗里等待通电。',
      { ...FONT, fontSize: SIZE.small, color: '#59636B', align: 'center', lineSpacing: 6 })
      .setOrigin(0.5);

    this.add.text(width / 2, height - 34, 'Zone 1 完 · 按任意键回到标题', {
      ...FONT, fontSize: SIZE.small, color: '#D8792D',
    }).setOrigin(0.5);

    const again = () => {
      audio.unlock();
      this.scene.start('title', { status: this.status });
    };
    this.time.delayedCall(900, () => {
      this.input.keyboard?.once('keydown', again);
      this.input.once('pointerdown', again);
    });
  }
}
