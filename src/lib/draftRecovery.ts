export type RecoveredDraft<T> = {
  savedAt: number;
  baseUpdatedAt?: number;
  value: T;
};

export function recoveryKey(kind: string, id: string) {
  return `reflectblocks:recovery:${kind}:${id}`;
}

export function readRecovery<T>(key: string): RecoveredDraft<T> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as RecoveredDraft<T>;
  } catch {
    return null;
  }
}

export function writeRecovery<T>(key: string, value: T, baseUpdatedAt?: number) {
  try {
    const payload: RecoveredDraft<T> = { savedAt: Date.now(), baseUpdatedAt, value };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Recovery is a convenience. A full/blocked localStorage should never stop writing.
  }
}

export function clearRecovery(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // no-op
  }
}
