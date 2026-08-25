import Phaser from 'phaser';
import { COLORS } from '../config/tuning';
import { FONT, SIZE } from '../ui/theme';


/** 覆盖在游戏之上的 HUD。独立场景，这样不受主相机 zoom 影响 */
export class HudScene extends Phaser.Scene {
  private hearts: Phaser.GameObjects.Arc[] = [];
  private objective!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;

  constructor() {
    super('hud');
  }

  init(): void {
    // 同样的理由：HUD 是 launch 起来的，重进游戏会再跑一次 create
    this.hearts = [];
  }

  create(): void {
    for (let i = 0; i < 3; i++) {
      this.hearts.push(this.add.circle(20 + i * 16, 22, 5, COLORS.biolum));
    }

    this.objective = this.add.text(16, 38, '', { ...FONT, fontSize: SIZE.body, color: '#59636B' });
    this.toast = this.add.text(0, 0, '', { ...FONT, fontSize: SIZE.body, color: '#70FFE0' })
      .setOrigin(0.5).setAlpha(0);

    this.add.text(16, this.scale.height - 26,
      '空格/左键 蓄力喷射   ·   Shift/右键 生物脉冲   ·   A D 转向   ·   R 重生   ·   M 静音',
      { ...FONT, fontSize: SIZE.small, color: '#25355F' });

    const game = this.scene.get('game') as Phaser.Scene & { readout?: { health: number; relays: number; totalRelays: number } };

    // HUD 是 launch 起来的，create 比 GameScene 的首次 emit 晚一拍，
    // 所以初始值要主动拉一次，不能只等事件
    const initial = game.readout;
    if (initial) {
      this.setHealth(initial.health);
      this.setObjective(initial.relays, initial.totalRelays);
    }

    game.events.on('health', (h: number) => this.setHealth(h));
    game.events.on('objective', (lit: number, total: number) => this.setObjective(lit, total));
    game.events.on('toast', (msg: string) => this.showToast(msg));

    this.scale.on('resize', () => this.reposition());
    this.reposition();
  }

  private reposition(): void {
    this.toast.setPosition(this.scale.width / 2, this.scale.height * 0.24);
  }

  private setObjective(lit: number, total: number): void {
    this.objective.setText(
      lit >= total ? '闸门已开启 · 前往东侧出口' : `用生物脉冲点亮继电器  ${lit}/${total}`,
    );
  }

  private setHealth(h: number): void {
    this.hearts.forEach((c, i) => {
      c.setFillStyle(i < h ? COLORS.biolum : COLORS.slate);
    });
  }

  private showToast(msg: string): void {
    this.toast.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1400, duration: 600 });
  }
}
