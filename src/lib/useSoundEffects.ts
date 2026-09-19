import { useCallback, useEffect, useRef, useState } from "react";

export type SoundName = "add" | "connect" | "disconnect" | "save" | "ai";

const STORAGE_KEY = "reflectblocks:sound-enabled";

export function useSoundEffects() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  });
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  }, [enabled]);

  const play = useCallback((name: SoundName) => {
    if (!enabled) return;
    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const context = contextRef.current ?? new AudioContextCtor();
      contextRef.current = context;
      const now = context.currentTime;
      const osc = context.createOscillator();
      const gain = context.createGain();
      const frequencies: Record<SoundName, [number, number]> = {
        add: [470, 620],
        connect: [520, 760],
        disconnect: [420, 310],
        save: [560, 700],
        ai: [610, 840],
      };
      const [start, end] = frequencies[name];
      osc.type = "sine";
      osc.frequency.setValueAtTime(start, now);
      osc.frequency.exponentialRampToValueAtTime(end, now + 0.09);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Sound is a non-essential enhancement. Never interrupt writing if audio fails.
    }
  }, [enabled]);

  return {
    soundEnabled: enabled,
    setSoundEnabled: setEnabled,
    playSound: play,
  };
}
