// WYD Web Port — Sound Manager (Web Audio API)
let audioCtx = null;
const soundBuffers = new Map();
let isMuted = false;

const SOUND_URLS = {
  menuClick: '/sounds/menu01.wav',
  menuToggle: '/sounds/menu02.wav',
  swing1: '/sounds/swing01.wav',
  swing2: '/sounds/swing02.wav',
  hit1: '/sounds/dmg01.wav',
  hit2: '/sounds/dmg02.wav',
  potion: '/sounds/item04.wav',
  itemMove: '/sounds/item01.wav',
  inventory: '/sounds/inven01.wav',
  levelUp: '/sounds/effect01.wav',
};

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export async function preloadSounds() {
  const ctx = getAudioContext();
  if (!ctx) return;

  for (const [key, url] of Object.entries(SOUND_URLS)) {
    if (soundBuffers.has(key)) continue;
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const arrayBuf = await resp.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        soundBuffers.set(key, audioBuf);
      }
    } catch {
      // Audio autoplay policy or network error handled gracefully
    }
  }
}

export function playSound(key, volume = 0.5) {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const buffer = soundBuffers.get(key);
  if (!buffer) {
    // If not cached yet, attempt lazy load
    if (SOUND_URLS[key]) {
      fetch(SOUND_URLS[key])
        .then((res) => res.arrayBuffer())
        .then((arr) => ctx.decodeAudioData(arr))
        .then((buf) => {
          soundBuffers.set(key, buf);
          playBuffer(ctx, buf, volume);
        })
        .catch(() => {});
    }
    return;
  }
  playBuffer(ctx, buffer, volume);
}

function playBuffer(ctx, buffer, volume) {
  try {
    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    source.buffer = buffer;
    gainNode.gain.value = volume;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch {}
}

export const sfx = {
  click: () => playSound('menuClick', 0.4),
  toggle: () => playSound('menuToggle', 0.45),
  swing: () => playSound(Math.random() > 0.5 ? 'swing1' : 'swing2', 0.4),
  hit: () => playSound(Math.random() > 0.5 ? 'hit1' : 'hit2', 0.5),
  potion: () => playSound('potion', 0.55),
  item: () => playSound('itemMove', 0.45),
  inventory: () => playSound('inventory', 0.45),
  levelUp: () => playSound('levelUp', 0.6),
  setMuted: (m) => {
    isMuted = m;
  },
  toggleMute: () => {
    isMuted = !isMuted;
    return isMuted;
  },
};
