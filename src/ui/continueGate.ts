import Phaser from 'phaser';

/**
 * 「按任意键继续」的通用闸门。
 *
 * 不走 Phaser 的 KeyboardPlugin。原因在它的源码里：事件队列是全局共享的
 * （`this.manager.queue`），每个场景的插件在各自的 update 里处理同一份队列。
 * 于是 `scene.start()` 在按键回调里执行时，新场景刚注册的监听器会在同一帧
 * 撞上那个还没被清掉的事件，把「继续」立刻消耗掉 —— 表现就是按任意键没反应。
 *
 * 换成 keyup 只是把时机挪了一点，队列共享的问题还在。所以这里直接挂 DOM 监听：
 * 时序完全由我们自己控制，且与场景生命周期严格对齐。
 */
export function continueGate(
  scene: Phaser.Scene,
  onContinue: () => void,
  minDwellMs = 400,
): void {
  const armedAt = performance.now() + minDwellMs;
  let fired = false;

  const fire = (): void => {
    if (fired || performance.now() < armedAt) return;
    fired = true;
    cleanup();
    onContinue();
  };

  const onKey = (e: KeyboardEvent): void => {
    // 修饰键单独按下不算「任意键」
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
    fire();
  };
  const onPointer = (): void => fire();

  const cleanup = (): void => {
    window.removeEventListener('keyup', onKey);
    window.removeEventListener('pointerup', onPointer);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    scene.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
  };

  window.addEventListener('keyup', onKey);
  window.addEventListener('pointerup', onPointer);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  scene.events.once(Phaser.Scenes.Events.DESTROY, cleanup);

  // 兜底：即使输入层再出问题，画面上也始终有一块能点的区域
  const hit = scene.add.zone(0, 0, scene.scale.width, scene.scale.height)
    .setOrigin(0, 0).setScrollFactor(0).setDepth(9999)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerup', fire);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => hit.destroy());
}

/**
 * 「推进一句对白」用的监听，同样走 DOM。
 * 返回注销函数，由调用方在销毁时执行。
 */
export function advanceListener(onAdvance: () => void): () => void {
  const armedAt = performance.now() + 250;
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
    if (performance.now() < armedAt) return;
    onAdvance();
  };
  const onPointer = (): void => {
    if (performance.now() < armedAt) return;
    onAdvance();
  };
  window.addEventListener('keyup', onKey);
  window.addEventListener('pointerup', onPointer);
  return () => {
    window.removeEventListener('keyup', onKey);
    window.removeEventListener('pointerup', onPointer);
  };
}
