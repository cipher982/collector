/**
 * Unit tests for identity.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getVisitorId,
  getSessionId,
  getPageviewId,
  collectIdentity,
} from '../../src/core/identity.js';
import { storage } from '../../src/utils/storage.js';
import type { IdentityConfig } from '../../src/types.js';

describe('identity', () => {
  const defaultConfig: IdentityConfig = {
    persist: true,
    visitorIdKey: 'test_visitor_id',
    sessionIdKey: 'test_session_id',
  };

  beforeEach(() => {
    // Clear storage before each test
    storage.local.clear();
    storage.session.clear();
  });

  describe('getVisitorId', () => {
    it('should generate new visitor ID with v_ prefix', () => {
      const id = getVisitorId(defaultConfig);
      expect(id).toMatch(/^v_[0-9a-f]+$/);
    });

    it('should persist visitor ID in localStorage', () => {
      const id1 = getVisitorId(defaultConfig);
      const id2 = getVisitorId(defaultConfig);

      expect(id1).toBe(id2);
      expect(storage.local.getItem(defaultConfig.visitorIdKey)).toBe(id1);
    });

    it('should return different ID when persist is false', () => {
      const config = { ...defaultConfig, persist: false };

      const id1 = getVisitorId(config);
      const id2 = getVisitorId(config);

      expect(id1).not.toBe(id2);
      expect(storage.local.getItem(defaultConfig.visitorIdKey)).toBeNull();
    });

    it('should use existing visitor ID from localStorage', () => {
      const existingId = 'v_existing123';
      storage.local.setItem(defaultConfig.visitorIdKey, existingId);

      const id = getVisitorId(defaultConfig);
      expect(id).toBe(existingId);
    });

    it('should generate ID of reasonable length', () => {
      const id = getVisitorId(defaultConfig);
      // Format: v_ + 32 hex chars = 34 chars
      expect(id.length).toBeGreaterThanOrEqual(34);
    });
  });

  describe('getSessionId', () => {
    it('should generate new session ID with s_ prefix', () => {
      const id = getSessionId(defaultConfig);
      expect(id).toMatch(/^s_[0-9a-f]+$/);
    });

    it('should persist session ID in sessionStorage', () => {
      const id1 = getSessionId(defaultConfig);
      const id2 = getSessionId(defaultConfig);

      expect(id1).toBe(id2);
      expect(storage.session.getItem(defaultConfig.sessionIdKey)).toBe(id1);
    });

    it('should return different ID when persist is false', () => {
      const config = { ...defaultConfig, persist: false };

      const id1 = getSessionId(config);
      const id2 = getSessionId(config);

      expect(id1).not.toBe(id2);
      expect(storage.session.getItem(defaultConfig.sessionIdKey)).toBeNull();
    });

    it('should use existing session ID from sessionStorage', () => {
      const existingId = 's_existing456';
      storage.session.setItem(defaultConfig.sessionIdKey, existingId);

      const id = getSessionId(defaultConfig);
      expect(id).toBe(existingId);
    });

    it('should be different from visitor ID', () => {
      const visitorId = getVisitorId(defaultConfig);
      const sessionId = getSessionId(defaultConfig);

      expect(visitorId).not.toBe(sessionId);
      expect(visitorId.startsWith('v_')).toBe(true);
      expect(sessionId.startsWith('s_')).toBe(true);
    });
  });

  describe('getPageviewId', () => {
    it('should generate new pageview ID with p_ prefix', () => {
      const id = getPageviewId();
      expect(id).toMatch(/^p_[0-9a-f]+$/);
    });

    it('should generate unique ID each time', () => {
      const id1 = getPageviewId();
      const id2 = getPageviewId();
      const id3 = getPageviewId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should never persist to storage', () => {
      const id = getPageviewId();

      // Check that it's not in either storage
      expect(storage.local.getItem(id)).toBeNull();
      expect(storage.session.getItem(id)).toBeNull();
    });

    it('should generate ID of reasonable length', () => {
      const id = getPageviewId();
      // Format: p_ + 32 hex chars = 34 chars
      expect(id.length).toBeGreaterThanOrEqual(34);
    });
  });

  describe('collectIdentity', () => {
    it('should return complete identity data', () => {
      const identity = collectIdentity(defaultConfig);

      expect(identity).toHaveProperty('visitorId');
      expect(identity).toHaveProperty('sessionId');
      expect(identity).toHaveProperty('pageviewId');

      expect(identity.visitorId).toMatch(/^v_/);
      expect(identity.sessionId).toMatch(/^s_/);
      expect(identity.pageviewId).toMatch(/^p_/);
    });

    it('should persist visitor and session IDs', () => {
      const identity1 = collectIdentity(defaultConfig);
      const identity2 = collectIdentity(defaultConfig);

      expect(identity1.visitorId).toBe(identity2.visitorId);
      expect(identity1.sessionId).toBe(identity2.sessionId);
    });

    it('should generate new pageview ID each call', () => {
      const identity1 = collectIdentity(defaultConfig);
      const identity2 = collectIdentity(defaultConfig);

      expect(identity1.pageviewId).not.toBe(identity2.pageviewId);
    });

    it('should work without persistence', () => {
      const config = { ...defaultConfig, persist: false };
      const identity = collectIdentity(config);

      expect(identity.visitorId).toMatch(/^v_/);
      expect(identity.sessionId).toMatch(/^s_/);
      expect(identity.pageviewId).toMatch(/^p_/);

      // Should not be in storage
      expect(storage.local.getItem(config.visitorIdKey)).toBeNull();
      expect(storage.session.getItem(config.sessionIdKey)).toBeNull();
    });
  });

  describe('ID format', () => {
    it('should generate cryptographically random IDs', () => {
      // Generate multiple IDs and check they're all different
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(getPageviewId());
      }

      // All should be unique
      expect(ids.size).toBe(100);
    });

    it('should use hex encoding', () => {
      const id = getPageviewId();
      const hexPart = id.slice(2); // Remove prefix

      // Should only contain hex characters
      expect(hexPart).toMatch(/^[0-9a-f]+$/);
    });
  });
});
