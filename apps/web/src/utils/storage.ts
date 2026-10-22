/**
 * Resilient storage utility for RELIEF-OS.
 * Falls back to an in-memory store in non-browser or storage-restricted environments (such as Node.js test suites).
 */

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const memoryFallback = new MemoryStorage();

function isLocalStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    const testKey = '__relief_os_storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export const safeStorage = {
  getItem(key: string): string | null {
    if (isLocalStorageAvailable()) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return memoryFallback.getItem(key);
      }
    }
    return memoryFallback.getItem(key);
  },

  setItem(key: string, value: string): void {
    if (isLocalStorageAvailable()) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
        memoryFallback.setItem(key, value);
        return;
      }
    }
    memoryFallback.setItem(key, value);
  },

  removeItem(key: string): void {
    if (isLocalStorageAvailable()) {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch {
        memoryFallback.removeItem(key);
        return;
      }
    }
    memoryFallback.removeItem(key);
  },

  clear(): void {
    if (isLocalStorageAvailable()) {
      try {
        window.localStorage.clear();
      } catch {
        // ignore
      }
    }
    memoryFallback.clear();
  },
};
