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
  const ctx = getCtx();
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
