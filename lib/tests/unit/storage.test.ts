/**
 * Unit tests for storage.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  storage,
  getStorageItem,
  setStorageItem,
  removeStorageItem,
} from '../../src/utils/storage.js';

describe('storage', () => {
  describe('getStorageItem', () => {
    it('should retrieve item from localStorage', () => {
      const testKey = 'test_local_key';
      const testValue = 'test_value';

      // Set item directly
      storage.local.setItem(testKey, testValue);

      // Retrieve using helper
      const result = getStorageItem('local', testKey);
      expect(result).toBe(testValue);

      // Cleanup
      storage.local.removeItem(testKey);
    });

    it('should retrieve item from sessionStorage', () => {
      const testKey = 'test_session_key';
      const testValue = 'test_value';

      // Set item directly
      storage.session.setItem(testKey, testValue);

      // Retrieve using helper
      const result = getStorageItem('session', testKey);
      expect(result).toBe(testValue);

      // Cleanup
      storage.session.removeItem(testKey);
    });

    it('should return null for non-existent key', () => {
      const result = getStorageItem('local', 'non_existent_key');
      expect(result).toBeNull();
    });
  });

  describe('setStorageItem', () => {
    it('should set item in localStorage', () => {
      const testKey = 'test_set_local';
      const testValue = 'test_value';

      const success = setStorageItem('local', testKey, testValue);
      expect(success).toBe(true);

      const result = storage.local.getItem(testKey);
      expect(result).toBe(testValue);

      // Cleanup
      storage.local.removeItem(testKey);
    });

    it('should set item in sessionStorage', () => {
      const testKey = 'test_set_session';
      const testValue = 'test_value';

      const success = setStorageItem('session', testKey, testValue);
      expect(success).toBe(true);

      const result = storage.session.getItem(testKey);
      expect(result).toBe(testValue);

      // Cleanup
      storage.session.removeItem(testKey);
    });

    it('should overwrite existing value', () => {
      const testKey = 'test_overwrite';

      setStorageItem('local', testKey, 'first');
      setStorageItem('local', testKey, 'second');

      const result = storage.local.getItem(testKey);
      expect(result).toBe('second');

      // Cleanup
      storage.local.removeItem(testKey);
    });
  });

  describe('removeStorageItem', () => {
    it('should remove item from localStorage', () => {
      const testKey = 'test_remove_local';

      storage.local.setItem(testKey, 'value');
      expect(storage.local.getItem(testKey)).toBe('value');

      const success = removeStorageItem('local', testKey);
      expect(success).toBe(true);
      expect(storage.local.getItem(testKey)).toBeNull();
    });

    it('should remove item from sessionStorage', () => {
      const testKey = 'test_remove_session';

      storage.session.setItem(testKey, 'value');
      expect(storage.session.getItem(testKey)).toBe('value');

      const success = removeStorageItem('session', testKey);
      expect(success).toBe(true);
      expect(storage.session.getItem(testKey)).toBeNull();
    });

    it('should succeed even if key does not exist', () => {
      const success = removeStorageItem('local', 'non_existent_key');
      expect(success).toBe(true);
    });
  });

  describe('storage adapter', () => {
    it('should have local storage adapter', () => {
      expect(storage.local).toBeDefined();
      expect(storage.local.getItem).toBeInstanceOf(Function);
      expect(storage.local.setItem).toBeInstanceOf(Function);
      expect(storage.local.removeItem).toBeInstanceOf(Function);
    });

    it('should have session storage adapter', () => {
      expect(storage.session).toBeDefined();
      expect(storage.session.getItem).toBeInstanceOf(Function);
      expect(storage.session.setItem).toBeInstanceOf(Function);
      expect(storage.session.removeItem).toBeInstanceOf(Function);
    });
  });
});
