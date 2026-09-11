// 简易音效系统（Web Audio API，无需外部音频文件）
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = "sine", volume = 0.15) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch { /* 静默忽略 */ }
}

/** 发送消息：短促点击 */
export function playSend() {
  playTone(800, 0.1, "square", 0.1);
}

/** NPC 回复到达：温和提示音 */
export function playReceive() {
  setTimeout(() => playTone(600, 0.15, "sine", 0.08), 0);
  setTimeout(() => playTone(800, 0.2, "sine", 0.08), 100);
}

/** 法器激活：清脆叮声 */
export function playArtifact() {
  playTone(1200, 0.12, "sine", 0.12);
  setTimeout(() => playTone(1600, 0.15, "sine", 0.1), 80);
}

/** 胜利：昂扬旋律 */
export function playVictory() {
  [523, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.3, "triangle", 0.12), i * 120);
  });
}

/** 受损/警告：低沉 */
export function playDamage() {
  playTone(200, 0.3, "sawtooth", 0.08);
}

// ==================== 环境背景音（冥想氛围）====================
// 用「温暖和弦 pad（triangle + 轻微失谐合唱感）+ 风铃琶音 + 柔和流水噪声」
// 合成清晰可闻的冥想氛围，无需外部音频文件。
let waterNodes: {
  oscillators: OscillatorNode[];
  arpeggioTimer: ReturnType<typeof setInterval> | null;
  noiseSource: AudioBufferSourceNode;
  masterGain: GainNode;
  breathLfo: OscillatorNode;
  breathLfoGain: GainNode;
} | null = null;

/** 播放冥想背景音（呼吸引导时使用） */
export function startWaterSound() {
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();
    if (waterNodes) return; // 已在播放

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(0.7, now + 2.0);
    masterGain.connect(ctx.destination);

    const oscillators: OscillatorNode[] = [];

    // 1) 温暖和弦 pad：C3/E3/G3/C4，用 triangle 波形 + 每音双 oscillator 轻微失谐，
    //    制造温暖"合唱"般的丰满感（比纯 sine 更明显）
    const chordFreqs = [130.81, 164.81, 196.0, 261.63]; // C3 E3 G3 C4
    const chordGains = [0.22, 0.16, 0.13, 0.08];
    chordFreqs.forEach((freq, i) => {
      // 每个音用两个失谐的 oscillator 制造合唱感
      [-3, 3].forEach((cents) => {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = freq;
        osc.detune.value = cents;
        const oscGain = ctx.createGain();
        oscGain.gain.value = chordGains[i] / 2;
        osc.connect(oscGain);
        oscGain.connect(masterGain);
        osc.start(now);
        oscillators.push(osc);
      });
    });

    // 2) 风铃琶音：五声音阶（C 宫调式）缓慢循环，每 2 秒一个音，柔和衰减
    const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C5 D5 E5 G5 A5 C6
    let arpIndex = 0;
    const playArpeggioNote = () => {
      try {
        const freq = pentatonic[arpIndex % pentatonic.length];
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.8);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.9);
        arpIndex++;
      } catch { /* 静默忽略 */ }
    };
    const arpeggioTimer = setInterval(playArpeggioNote, 2000);

    // 3) 柔和流水噪声（低通滤波，作为氛围垫底）
    const bufferSize = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 900;
    noiseFilter.Q.value = 0.5;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.08;
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSource.start(now);

    // 4) 呼吸感音量起伏：0.06Hz LFO 让整体音量像呼吸一样缓慢起伏
    const breathLfo = ctx.createOscillator();
    breathLfo.type = "sine";
    breathLfo.frequency.value = 0.06;
    const breathLfoGain = ctx.createGain();
    breathLfoGain.gain.value = 0.15;
    breathLfo.connect(breathLfoGain);
    breathLfoGain.connect(masterGain.gain);
    breathLfo.start(now);

    waterNodes = { oscillators, arpeggioTimer, noiseSource, masterGain, breathLfo, breathLfoGain };
  } catch {
    /* 静默忽略 */
  }
}

/** 停止冥想背景音（淡出） */
export function stopWaterSound() {
  try {
    if (!waterNodes) return;
    const ctx = getCtx();
    const { oscillators, arpeggioTimer, noiseSource, masterGain, breathLfo } = waterNodes;
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    if (arpeggioTimer) clearInterval(arpeggioTimer);

    const oscs = oscillators;
    const ns = noiseSource;
    const blfo = breathLfo;
    setTimeout(() => {
      try {
        oscs.forEach((o) => o.stop());
        ns.stop();
        blfo.stop();
      } catch { /* 已停止 */ }
    }, 1300);
    waterNodes = null;
  } catch {
    /* 静默忽略 */
  }
}
