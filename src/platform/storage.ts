/** Key/value storage. Async so the native build can swap in `@capacitor/preferences` (phase 7). */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Browser storage. Every call is wrapped: private mode or a full quota must never crash the game. */
export function webStorage(): KeyValueStore {
  return {
    get: async (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: async (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // ignore: storage unavailable
      }
    },
    remove: async (key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore: storage unavailable
      }
    },
  };
}

/** In-memory storage for tests and as a last-resort fallback. */
export function memoryStorage(initial: Record<string, string> = {}): KeyValueStore & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    },
  };
}
