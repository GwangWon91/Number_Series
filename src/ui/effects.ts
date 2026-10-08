/**
 * 게임 이벤트 → 소리·진동. 에셋·라이브러리 없이 WebAudio로 짧은 음을 합성한다.
 * 애니메이션은 CSS(클래스·key 재마운트)가 맡고, 여기서는 소리와 진동만 낸다.
 */
import type { GameEvent } from '../game/run';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      // iOS: 무음 스위치를 따르도록 (지원 브라우저만)
      const session = (navigator as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'ambient';
      ctx = new AudioContext();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** 음 하나: 주파수(Hz), 시작 지연(s), 길이(s) */
function tone(freq: number, at = 0, dur = 0.09, type: OscillatorType = 'sine', volume = 0.08) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur);
}

const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 미지원 (iOS 등) */
  }
};

export function playEffects(events: readonly GameEvent[], opts: { sound: boolean; haptics: boolean }) {
  for (const e of events) {
    if (e.kind === 'correct') {
      // 콤보가 이어질수록 음이 반음씩 올라간다 (최대 한 옥타브)
      const base = 660 * 2 ** (Math.min(e.combo - 1, 12) / 12);
      if (opts.sound) {
        tone(base);
        tone(base * 1.5, 0.07);
        if (e.combo % 5 === 0) tone(base * 2, 0.14, 0.14);
      }
      if (opts.haptics) vibrate(e.combo % 5 === 0 ? [15, 40, 15] : 15);
    } else if (e.kind === 'wrong') {
      if (opts.sound) tone(196, 0, 0.18, 'triangle', 0.1);
      if (opts.haptics) vibrate([30, 40, 30]);
    } else if (e.kind === 'checkpoint') {
      if (opts.sound) [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25 + i * 0.08, 0.12));
    }
  }
}
