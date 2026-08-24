import Phaser from 'phaser';

/**
 * 「按任意键继续」的通用闸门。
 *
 * 之前每个场景各写各的，用 `delayedCall` 里注册 `once('keydown')`，
 * 结果三个坑同时踩：
 *
 * 1. 进入本场景的那次按键还没抬起，键盘重复会立刻触发返回
 * 2. `pointerdown` 和上一场景的点击是同一次交互，同样会被吃掉
 * 3. `once` 被误触发消耗掉之后，再按就彻底没反应了 —— 这就是
 *    「按任意键返回没有用」的直接原因
 *
 * 这里的做法：
 * - 用 `on` 而不是 `once`，自己拿 fired 标志去重，误触发不会耗尽监听
 * - 只认 `keyup` 与 `pointerup`：抬起事件一定属于本场景的新交互
 * - 额外加一个最短停留时间，防止连点穿透
 * - 场景 shutdown 时统一注销，不给下个场景留野监听
 */
export function continueGate(
  scene: Phaser.Scene,
  onContinue: () => void,
  minDwellMs = 350,
): void {
  const armedAt = scene.time.now + minDwellMs;
  let fired = false;

  const fire = (): void => {
    if (fired || scene.time.now < armedAt) return;
    fired = true;
    cleanup();
    onContinue();
  };

  const kb = scene.input.keyboard;
  const onKeyUp = (): void => fire();
  const onPointerUp = (): void => fire();

  const cleanup = (): void => {
    kb?.off('keyup', onKeyUp);
    scene.input.off('pointerup', onPointerUp);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  };

  kb?.on('keyup', onKeyUp);
  scene.input.on('pointerup', onPointerUp);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
}

/**
 * 场景级监听的统一注销。
 *
 * Phaser 会在 shutdown 时清掉 scene.input 上的监听，但 `addKey` 建出来的
 * Key 对象、以及挂在 scene.events 上的跨场景监听不会自动断开。
 * 场景反复进出时这些会累积，表现就是"按一次触发两次"。
 */
export function autoCleanup(scene: Phaser.Scene, dispose: () => void): void {
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, dispose);
  scene.events.once(Phaser.Scenes.Events.DESTROY, dispose);
}
