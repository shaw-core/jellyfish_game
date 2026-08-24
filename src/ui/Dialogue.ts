import Phaser from 'phaser';

export interface Line {
  /** 说话者。留空表示旁白 */
  who?: string;
  text: string;
  /** 0–1，这一句里有多少字符会被数据损坏吃掉 */
  corrupt?: number;
  /** 打完后自动停留多久（秒）；不填则等玩家按键 */
  hold?: number;
}

const GLITCH = '▓▒░#§¤◊∎⌁';

/**
 * 终端式对白框。
 *
 * 这个游戏里唯一"说话"的是死者与残响，所以对白不做成人物气泡，
 * 而是做成终端输出：等宽、单色、逐字打印。守炉者的数据缺损直接
 * 体现在字符上 —— 不需要任何一句台词解释"它坏了"。
 */
export class Dialogue {
  private box: Phaser.GameObjects.Rectangle;
  private nameText: Phaser.GameObjects.Text;
  private bodyText: Phaser.GameObjects.Text;
  private prompt: Phaser.GameObjects.Text;
  private container: Phaser.GameObjects.Container;

  private queue: Line[] = [];
  private current?: Line;
  private full = '';
  private shown = 0;
  private timer = 0;
  private holdTimer = 0;
  private done = true;
  private onComplete?: () => void;

  constructor(private scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    const w = Math.min(560, width - 48);
    const h = 96;
    const x = (width - w) / 2;
    const y = height - h - 28;

    this.box = scene.add.rectangle(0, 0, w, h, 0x0b1026, 0.88).setOrigin(0, 0);
    this.box.setStrokeStyle(1, 0x25355f);

    const font = { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' };
    this.nameText = scene.add.text(12, 9, '', { ...font, fontSize: '11px', color: '#D8792D' });
    this.bodyText = scene.add.text(12, 30, '', {
      ...font, fontSize: '13px', color: '#DFFFF7',
      wordWrap: { width: w - 24 }, lineSpacing: 5,
    });
    this.prompt = scene.add.text(w - 20, h - 20, '▾', { ...font, fontSize: '11px', color: '#31D6C8' })
      .setAlpha(0);

    this.container = scene.add.container(x, y, [this.box, this.nameText, this.bodyText, this.prompt]);
    this.container.setScrollFactor(0).setDepth(60).setVisible(false);

    scene.input.keyboard?.on('keydown', () => this.advance());
    scene.input.on('pointerdown', () => this.advance());
  }

  get busy(): boolean {
    return !this.done || this.queue.length > 0;
  }

  play(lines: Line[], onComplete?: () => void): void {
    this.queue = [...lines];
    this.onComplete = onComplete;
    this.container.setVisible(true);
    this.next();
  }

  private next(): void {
    const line = this.queue.shift();
    if (!line) {
      this.container.setVisible(false);
      this.done = true;
      this.current = undefined;
      this.onComplete?.();
      return;
    }
    this.current = line;
    this.full = line.text;
    this.shown = 0;
    this.timer = 0;
    this.holdTimer = line.hold ?? 0;
    this.done = false;
    this.nameText.setText(line.who ?? '');
    this.bodyText.setText('');
    this.prompt.setAlpha(0);
  }

  /** 按键：没打完就立刻打完，打完了就翻页 */
  private advance(): void {
    if (!this.current) return;
    if (this.shown < this.full.length) {
      this.shown = this.full.length;
      this.render();
      this.done = true;
      return;
    }
    if (this.current.hold === undefined) this.next();
  }

  update(dt: number): void {
    if (!this.current) return;

    if (this.shown < this.full.length) {
      this.timer += dt;
      // 每 28ms 一个字；损坏度高的句子打得更慢，像在挣扎
      const step = 0.028 + (this.current.corrupt ?? 0) * 0.05;
      while (this.timer > step && this.shown < this.full.length) {
        this.timer -= step;
        this.shown++;
      }
      this.render();
      if (this.shown >= this.full.length) this.done = true;
      return;
    }

    this.prompt.setAlpha(this.current.hold === undefined
      ? 0.4 + Math.sin(this.scene.time.now / 260) * 0.35
      : 0);

    if (this.current.hold !== undefined) {
      this.holdTimer -= dt;
      if (this.holdTimer <= 0) this.next();
    }
  }

  private render(): void {
    const c = this.current?.corrupt ?? 0;
    let out = this.full.slice(0, this.shown);
    if (c > 0) {
      // 逐帧随机替换少量字符，字符会"抖"，像信号在丢包
      out = out.split('').map((ch) => (
        ch !== '\n' && Math.random() < c * 0.12
          ? GLITCH[Math.floor(Math.random() * GLITCH.length)]
          : ch
      )).join('');
    }
    this.bodyText.setText(out);
  }

  destroy(): void {
    this.container.destroy();
  }
}
