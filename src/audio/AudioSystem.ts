import { makeBrownBuffer, makeNoiseBuffer, noise, tone, type Bus } from './Synth';

/**
 * 游戏音频系统。
 *
 * 整条总线末端挂了一个低通 —— 玩家在水下，高频本来就传不过来。
 * Pulse 触发时会短暂把截止频率推上去，听感上像"水被推开了一瞬"，
 * 这个瞬间的通透感比单独把脉冲音做响更有效。
 *
 * 浏览器要求用户手势之后才能出声，所以 unlock() 挂在开场那一下按键上。
 */
export class AudioSystem {
  private ctx?: AudioContext;
  private master?: GainNode;
  private lowpass?: BiquadFilterType extends never ? never : BiquadFilterNode;
  private bus?: Bus;

  private noiseBuf?: AudioBuffer;
  private brownBuf?: AudioBuffer;

  /** 环境底噪与蓄力音是常驻节点 */
  private chargeOsc?: OscillatorNode;
  private chargeGain?: GainNode;
  private ventGain?: GainNode;

  private groanTimer = 0;
  private _muted = false;
  private started = false;

  get muted(): boolean { return this._muted; }
  get ready(): boolean { return this.started && !!this.ctx; }

  /** 必须在用户手势的回调里调用 */
  unlock(): void {
    if (this.started) {
      void this.ctx?.resume();
      return;
    }
    this.started = true;

    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    this.ctx = ctx;

    this.noiseBuf = makeNoiseBuffer(ctx);
    this.brownBuf = makeBrownBuffer(ctx);

    // 总线：dry + 反馈延迟（当洞穴混响用，比 Convolver 便宜太多）
    const master = ctx.createGain();
    master.gain.value = 0.9;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    lp.Q.value = 0.6;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;

    const dry = ctx.createGain();
    const send = ctx.createGain();
    send.gain.value = 1;

    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.26;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    const wetLp = ctx.createBiquadFilter();
    wetLp.type = 'lowpass';
    wetLp.frequency.value = 900;

    send.connect(delay);
    delay.connect(wetLp);
    wetLp.connect(fb);
    fb.connect(delay);
    wetLp.connect(wet);

    dry.connect(lp);
    wet.connect(lp);
    lp.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);

    this.master = master;
    this.lowpass = lp;
    this.bus = { ctx, dry, send };

    this.startAmbient();
  }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx!.currentTime, 0.05);
    }
  }

  /* ---------------------------------------------------------------- */
  /* 环境                                                              */
  /* ---------------------------------------------------------------- */

  private startAmbient(): void {
    const { ctx, bus, brownBuf } = this;
    if (!ctx || !bus || !brownBuf) return;

    const src = ctx.createBufferSource();
    src.buffer = brownBuf;
    src.loop = true;

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;

    // 让截止频率极慢地上下浮动，水体才有"在流动"的感觉
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 120;
    lfo.connect(lfoAmt);
    lfoAmt.connect(f.frequency);

    const g = ctx.createGain();
    g.gain.value = 0.16;

    src.connect(f);
    f.connect(g);
    g.connect(bus.dry);

    src.start();
    lfo.start();

    // 喷口的持续轰鸣，音量由 setVentProximity 控制
    const vsrc = ctx.createBufferSource();
    vsrc.buffer = brownBuf;
    vsrc.loop = true;
    const vf = ctx.createBiquadFilter();
    vf.type = 'bandpass';
    vf.frequency.value = 190;
    vf.Q.value = 1.4;
    const vg = ctx.createGain();
    vg.gain.value = 0;
    vsrc.connect(vf); vf.connect(vg); vg.connect(bus.dry);
    vsrc.start();
    this.ventGain = vg;
  }

  /** 远处金属结构的呻吟，随机间隔触发，用来打破底噪的单调 */
  updateAmbient(dt: number): void {
    if (!this.bus || !this.ctx) return;
    this.groanTimer -= dt;
    if (this.groanTimer > 0) return;
    this.groanTimer = 9 + Math.random() * 14;

    const at = this.ctx.currentTime + Math.random() * 0.4;
    const base = 48 + Math.random() * 40;
    tone(this.bus, at, {
      type: 'sawtooth', freq: base, freqTo: base * 0.82,
      attack: 1.2, decay: 3.4, gain: 0.05, sendAmount: 0.5,
    });
  }

  /** 0 = 远离喷口，1 = 正下方 */
  setVentProximity(v: number): void {
    if (!this.ventGain || !this.ctx) return;
    this.ventGain.gain.setTargetAtTime(0.34 * v, this.ctx.currentTime, 0.12);
  }

  /* ---------------------------------------------------------------- */
  /* 主角                                                              */
  /* ---------------------------------------------------------------- */

  /** 蓄力：一条随蓄力量升高的音，给玩家一个"还能再蓄"的听觉尺子 */
  startCharge(): void {
    const { ctx, bus } = this;
    if (!ctx || !bus || this.chargeOsc) return;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 90;

    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.07, ctx.currentTime, 0.05);

    osc.connect(g);
    g.connect(bus.dry);
    osc.start();

    this.chargeOsc = osc;
    this.chargeGain = g;
  }

  updateCharge(amount: number): void {
    if (!this.chargeOsc || !this.ctx) return;
    // 音高跟蓄力量走，蓄满时正好到八度上方一点
    this.chargeOsc.frequency.setTargetAtTime(90 + amount * 130, this.ctx.currentTime, 0.04);
  }

  stopCharge(): void {
    const { ctx } = this;
    if (!ctx || !this.chargeOsc || !this.chargeGain) return;
    const osc = this.chargeOsc;
    const g = this.chargeGain;
    this.chargeOsc = undefined;
    this.chargeGain = undefined;

    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02);
    osc.stop(ctx.currentTime + 0.2);
  }

  /** 喷射：低频"闷推" + 噪声尾流，强度跟蓄力量走 */
  thrust(power: number): void {
    const { ctx, bus, noiseBuf } = this;
    if (!ctx || !bus || !noiseBuf) return;
    const at = ctx.currentTime;
    const p = 0.35 + power * 0.65;

    tone(bus, at, {
      type: 'sine', freq: 180 + power * 90, freqTo: 46,
      attack: 0.004, decay: 0.26 + power * 0.16, gain: 0.3 * p, sendAmount: 0.25,
    });
    noise(bus, at, {
      buffer: noiseBuf, filter: 'bandpass',
      freq: 900 + power * 700, freqTo: 220, q: 0.8,
      attack: 0.006, decay: 0.3 + power * 0.2, gain: 0.16 * p, sendAmount: 0.35,
    });
  }

  /** 生物脉冲：钟一样的和声 + 短暂拉开总线低通 */
  pulse(): void {
    const { ctx, bus, lowpass } = this;
    if (!ctx || !bus) return;
    const at = ctx.currentTime;

    for (const [i, mult] of [1, 1.5, 2.01, 3.02].entries()) {
      tone(bus, at + i * 0.012, {
        type: 'sine', freq: 320 * mult,
        attack: 0.008, decay: 1.4 - i * 0.22,
        gain: 0.2 / (i + 1.2), sendAmount: 0.8,
      });
    }

    if (lowpass) {
      lowpass.frequency.cancelScheduledValues(at);
      lowpass.frequency.setValueAtTime(1400, at);
      lowpass.frequency.linearRampToValueAtTime(7000, at + 0.06);
      lowpass.frequency.exponentialRampToValueAtTime(1400, at + 1.1);
    }
  }

  /** 继电器点亮 */
  relayOn(): void {
    const { ctx, bus } = this;
    if (!ctx || !bus) return;
    const at = ctx.currentTime;
    tone(bus, at, { type: 'square', freq: 520, attack: 0.004, decay: 0.1, gain: 0.09 });
    tone(bus, at + 0.09, { type: 'square', freq: 780, attack: 0.004, decay: 0.3, gain: 0.09, sendAmount: 0.6 });
  }

  /* ---------------------------------------------------------------- */
  /* 危险与反馈                                                        */
  /* ---------------------------------------------------------------- */

  /** 电弧，distance 0–1，越远越轻越闷 */
  spark(distance: number): void {
    const { ctx, bus, noiseBuf } = this;
    if (!ctx || !bus || !noiseBuf) return;
    const near = 1 - distance;
    if (near <= 0.02) return;
    const at = ctx.currentTime;

    noise(bus, at, {
      buffer: noiseBuf, filter: 'highpass',
      freq: 1800 + near * 2600, q: 0.7,
      attack: 0.001, decay: 0.06 + Math.random() * 0.05,
      gain: 0.13 * near, sendAmount: 0.3,
    });
  }

  /** 被发现：两声上行提示音 */
  alerted(): void {
    const { ctx, bus } = this;
    if (!ctx || !bus) return;
    const at = ctx.currentTime;
    tone(bus, at, { type: 'square', freq: 440, attack: 0.004, decay: 0.09, gain: 0.1 });
    tone(bus, at + 0.11, { type: 'square', freq: 660, attack: 0.004, decay: 0.14, gain: 0.1 });
  }

  hurt(): void {
    const { ctx, bus, noiseBuf } = this;
    if (!ctx || !bus || !noiseBuf) return;
    const at = ctx.currentTime;
    tone(bus, at, {
      type: 'sawtooth', freq: 220, freqTo: 55,
      attack: 0.003, decay: 0.45, gain: 0.26, sendAmount: 0.4,
    });
    noise(bus, at, {
      buffer: noiseBuf, filter: 'lowpass', freq: 700, freqTo: 160,
      attack: 0.002, decay: 0.3, gain: 0.18,
    });
  }

  /** 撞墙：轻响，强度跟撞击速度走 */
  bump(strength: number): void {
    const { ctx, bus, noiseBuf } = this;
    if (!ctx || !bus || !noiseBuf || strength < 0.08) return;
    noise(bus, ctx.currentTime, {
      buffer: noiseBuf, filter: 'lowpass', freq: 420, freqTo: 140,
      attack: 0.002, decay: 0.1, gain: 0.12 * strength,
    });
  }

  /** 闸门开启：金属摩擦 + 低频轰鸣 */
  gateOpen(): void {
    const { ctx, bus, noiseBuf, brownBuf } = this;
    if (!ctx || !bus || !noiseBuf || !brownBuf) return;
    const at = ctx.currentTime;

    noise(bus, at, {
      buffer: noiseBuf, filter: 'bandpass', freq: 1100, freqTo: 420, q: 3,
      attack: 0.05, decay: 1.1, gain: 0.14, sendAmount: 0.5,
    });
    noise(bus, at, {
      buffer: brownBuf, filter: 'lowpass', freq: 200,
      attack: 0.12, decay: 1.6, gain: 0.24, sendAmount: 0.3,
    });
    tone(bus, at + 1.0, {
      type: 'sine', freq: 90, freqTo: 62, attack: 0.01, decay: 0.7, gain: 0.2, sendAmount: 0.6,
    });
  }

  /** 结局：一段上行的和声 */
  victory(): void {
    const { ctx, bus } = this;
    if (!ctx || !bus) return;
    const at = ctx.currentTime;
    [262, 330, 392, 523].forEach((f, i) => {
      tone(bus, at + i * 0.16, {
        type: 'sine', freq: f, attack: 0.02, decay: 1.6, gain: 0.16, sendAmount: 0.7,
      });
    });
  }
}

export const audio = new AudioSystem();
