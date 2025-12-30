/**
 * Storage abstraction with fallbacks for localStorage and sessionStorage
 *
 * Handles cases where storage is unavailable (private browsing, disabled cookies, etc.)
 */

/**
 * Storage adapter interface
 */
interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

/**
 * In-memory fallback storage for when localStorage/sessionStorage unavailable
 */
class MemoryStorage implements StorageAdapter {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Test if storage API is available and working
 */
function testStorage(storage: Storage): boolean {
  try {
    const testKey = '__storage_test__';
    storage.setItem(testKey, 'test');
    const result = storage.getItem(testKey) === 'test';
    storage.removeItem(testKey);
    return result;
  } catch {
    return false;
  }
}

/**
 * Get localStorage or fallback to in-memory storage
 */
function getLocalStorage(): StorageAdapter {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return new MemoryStorage();
  }

  try {
    if (testStorage(localStorage)) {
      return localStorage;
    }
  } catch {
    // Fall through to memory storage
  }

  return new MemoryStorage();
}

/**
 * Get sessionStorage or fallback to in-memory storage
 */
function getSessionStorage(): StorageAdapter {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return new MemoryStorage();
  }

  try {
    if (testStorage(sessionStorage)) {
      return sessionStorage;
    }
  } catch {
    // Fall through to memory storage
  }

  return new MemoryStorage();
}

// Export singleton instances
export const storage = {
  local: getLocalStorage(),
  session: getSessionStorage(),
};

/**
 * Safe wrapper for getting items from storage
 */
export function getStorageItem(
  storageType: 'local' | 'session',
  key: string
): string | null {
  try {
    const store = storageType === 'local' ? storage.local : storage.session;
    return store.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Safe wrapper for setting items in storage
 */
export function setStorageItem(
  storageType: 'local' | 'session',
  key: string,
  value: string
): boolean {
  try {
    const store = storageType === 'local' ? storage.local : storage.session;
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe wrapper for removing items from storage
 */
export function removeStorageItem(
  storageType: 'local' | 'session',
  key: string
): boolean {
  try {
    const store = storageType === 'local' ? storage.local : storage.session;
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
