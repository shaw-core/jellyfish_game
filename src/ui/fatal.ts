import Phaser from 'phaser';

/**
 * 致命错误可视化。
 *
 * 场景 create() 里抛异常时，Phaser 只往控制台打一行，画面停在上一帧 ——
 * 表现就是"卡住了/黑屏"。这个项目已经因此来回排查过四轮，每次都靠读代码猜。
 *
 * 现在包一层：抓到异常直接画在屏幕上，谁挂了、挂在哪一行，一眼可见。
 */
export function guardCreate(scene: Phaser.Scene, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    showFatal(scene, err);
  }
}

export function showFatal(scene: Phaser.Scene, err: unknown): void {
  const msg = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err);
  console.error('[fatal]', err);

  const { width, height } = scene.scale;
  scene.add.rectangle(0, 0, width, height, 0x0b1026, 0.96)
    .setOrigin(0, 0).setScrollFactor(0).setDepth(99998);
  scene.add.text(16, 16, `场景 ${scene.scene.key} 初始化失败\n\n${msg}`, {
    fontFamily: 'ui-monospace, monospace',
    fontSize: '12px',
    color: '#FF3344',
    wordWrap: { width: width - 32 },
  }).setScrollFactor(0).setDepth(99999);
}

/**
 * 跨场景监听的登记与统一注销。
 *
 * HudScene 把监听挂在 GameScene 的 emitter 上，这类监听在 HudScene 关闭时
 * 不会被自动移除 —— 反复进出后会累积成多份，对着已销毁的对象操作。
 */
export function bindCrossScene(
  owner: Phaser.Scene,
  target: Phaser.Events.EventEmitter,
  event: string,
  handler: (...args: never[]) => void,
): void {
  target.on(event, handler);
  const off = (): void => { target.off(event, handler); };
  owner.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  owner.events.once(Phaser.Scenes.Events.DESTROY, off);
}
