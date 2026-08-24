/**
 * Web Audio 合成基元。
 *
 * 这个游戏的音效需求全是抽象的 —— 喷射、脉冲、电弧、闸门、警报，
 * 没有一个需要真实录音的质感。合成的好处是风格天然统一、零素材体积、
 * 零版权问题，而且可以参数化：喷射声的音高跟着蓄力量走、脉冲余响
 * 跟着半径变，这是采样做不到的。
 */

export interface Bus {
  ctx: AudioContext;
  /** 干声接这里 */
  dry: GainNode;
  /** 送到延迟混响的量 */
  send: GainNode;
}

/** 一段循环白噪声，全局复用一份，避免每次发声都重新填缓冲 */
export function makeNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** 布朗噪声：比白噪声低频更多，适合做水下底噪 */
export function makeBrownBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

export interface EnvelopeOptions {
  attack?: number;
  decay?: number;
  peak?: number;
  /** 衰减到多少后停止，用来算释放尾巴 */
  sustain?: number;
  release?: number;
}

/** 给一个 GainNode 套 AD 包络，返回总时长 */
export function applyEnvelope(
  gain: GainNode,
  t0: number,
  { attack = 0.005, decay = 0.2, peak = 1 }: EnvelopeOptions,
): number {
  const g = gain.gain;
  g.cancelScheduledValues(t0);
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  return attack + decay;
}

export interface ToneOptions extends EnvelopeOptions {
  type?: OscillatorType;
  freq: number;
  /** 结束频率，用于扫频 */
  freqTo?: number;
  gain?: number;
  sendAmount?: number;
  detune?: number;
}

/** 单个振荡器 + 包络，一次性发声 */
export function tone(bus: Bus, at: number, opts: ToneOptions): void {
  const { ctx } = bus;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();

  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, at);
  if (opts.freqTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(opts.freqTo, 1), at + (opts.attack ?? 0.005) + (opts.decay ?? 0.2),
    );
  }
  if (opts.detune) osc.detune.setValueAtTime(opts.detune, at);

  const dur = applyEnvelope(amp, at, { ...opts, peak: opts.gain ?? 0.2 });

  osc.connect(amp);
  amp.connect(bus.dry);
  if (opts.sendAmount) {
    const s = ctx.createGain();
    s.gain.value = opts.sendAmount;
    amp.connect(s);
    s.connect(bus.send);
  }

  osc.start(at);
  osc.stop(at + dur + 0.05);
}

export interface NoiseOptions extends EnvelopeOptions {
  buffer: AudioBuffer;
  filter?: BiquadFilterType;
  freq?: number;
  freqTo?: number;
  q?: number;
  gain?: number;
  sendAmount?: number;
  playbackRate?: number;
}

/** 一段带滤波的噪声爆发 */
export function noise(bus: Bus, at: number, opts: NoiseOptions): void {
  const { ctx } = bus;
  const src = ctx.createBufferSource();
  src.buffer = opts.buffer;
  src.playbackRate.value = opts.playbackRate ?? 1;
  // 每次从随机位置起播，避免连续触发时听出重复
  const offset = Math.random() * Math.max(0, opts.buffer.duration - 0.5);

  const amp = ctx.createGain();
  const dur = applyEnvelope(amp, at, { ...opts, peak: opts.gain ?? 0.2 });

  let node: AudioNode = src;
  if (opts.filter) {
    const f = ctx.createBiquadFilter();
    f.type = opts.filter;
    f.frequency.setValueAtTime(opts.freq ?? 800, at);
    if (opts.freqTo !== undefined) {
      f.frequency.exponentialRampToValueAtTime(Math.max(opts.freqTo, 20), at + dur);
    }
    f.Q.value = opts.q ?? 1;
    src.connect(f);
    node = f;
  }

  node.connect(amp);
  amp.connect(bus.dry);
  if (opts.sendAmount) {
    const s = ctx.createGain();
    s.gain.value = opts.sendAmount;
    amp.connect(s);
    s.connect(bus.send);
  }

  src.start(at, offset);
  src.stop(at + dur + 0.05);
}
