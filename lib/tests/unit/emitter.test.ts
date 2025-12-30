/**
 * Tests for event emitter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  emitEvent,
  sendEvent,
  flushEvents,
  resetEmitter,
  getEventQueue,
} from '../../src/core/emitter.js';
import { configure, resetConfig } from '../../src/config.js';
import { storage } from '../../src/utils/storage.js';

describe('Event Emitter', () => {
  beforeEach(() => {
    resetConfig();
    storage.local.clear();
    storage.session.clear();
    resetEmitter();

    // Mock window.location and document.referrer
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/test' },
        configurable: true,
        writable: true,
      });
    }

    if (typeof document !== 'undefined') {
      Object.defineProperty(document, 'referrer', {
        value: '',
        configurable: true,
        writable: true,
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendEvent', () => {
    it('should use sendBeacon when available', () => {
      const sendBeaconSpy = vi.fn(() => true);
      Object.defineProperty(navigator, 'sendBeacon', {
        value: sendBeaconSpy,
        configurable: true,
      });

      const event = {
        visitor_id: 'v123',
        session_id: 's123',
        pageview_id: 'p123',
        event_type: 'test',
        seq: 1,
        client_timestamp: '2024-01-01T00:00:00.000Z',
        path: '/test',
        referrer: null,
        payload: {},
      };

      const result = sendEvent('/endpoint', event);

      expect(result).toBe(true);
      expect(sendBeaconSpy).toHaveBeenCalledWith(
        '/endpoint',
        expect.any(Blob)
      );

      // Verify blob contains correct JSON
      const blob = sendBeaconSpy.mock.calls[0][1] as Blob;
      expect(blob.type).toContain('application/json');
    });

    it('should fallback to fetch when sendBeacon unavailable', () => {
      // Remove sendBeacon
      Object.defineProperty(navigator, 'sendBeacon', {
        value: undefined,
        configurable: true,
      });

      const fetchSpy = vi.fn(() =>
        Promise.resolve(new Response('{}', { status: 200 }))
      );
      global.fetch = fetchSpy;

      const event = {
        visitor_id: 'v123',
        session_id: 's123',
        pageview_id: 'p123',
        event_type: 'test',
        seq: 1,
        client_timestamp: '2024-01-01T00:00:00.000Z',
        path: '/test',
        referrer: null,
        payload: {},
      };

      const result = sendEvent('/endpoint', event);

      expect(result).toBe(false); // Returns false for fetch
      expect(fetchSpy).toHaveBeenCalledWith('/endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        keepalive: true,
      });
    });

    it('should handle errors gracefully', () => {
      // Mock sendBeacon to throw
      Object.defineProperty(navigator, 'sendBeacon', {
        value: () => {
          throw new Error('Network error');
        },
        configurable: true,
      });

      const event = {
        visitor_id: 'v123',
        session_id: 's123',
        pageview_id: 'p123',
        event_type: 'test',
        seq: 1,
        client_timestamp: '2024-01-01T00:00:00.000Z',
        path: '/test',
        referrer: null,
        payload: {},
      };

      // Should not throw
      expect(() => sendEvent('/endpoint', event)).not.toThrow();
    });
  });

  describe('emitEvent', () => {
    it('should warn if endpoint not configured', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      emitEvent('test');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[VisitorContext] Cannot emit event: eventEndpoint not configured'
      );
    });

    it('should emit event immediately when batching disabled', () => {
      configure({
        eventEndpoint: '/event',
        batchEvents: false,
      });

      const sendBeaconSpy = vi.fn(() => true);
      Object.defineProperty(navigator, 'sendBeacon', {
        value: sendBeaconSpy,
        configurable: true,
      });

      emitEvent('click', {
        payload: { button: 'submit' },
        path: '/checkout',
      });

      expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
      expect(getEventQueue()).toHaveLength(0); // Not queued
    });

    it('should queue event when batching enabled', () => {
      configure({
        eventEndpoint: '/event',
        batchEvents: true,
        batchInterval: 5000,
      });

      const sendBeaconSpy = vi.fn(() => true);
      Object.defineProperty(navigator, 'sendBeacon', {
        value: sendBeaconSpy,
        configurable: true,
      });

      emitEvent('click', {
        payload: { button: 'submit' },
      });

      // Should be queued, not sent yet
      expect(sendBeaconSpy).not.toHaveBeenCalled();
      expect(getEventQueue()).toHaveLength(1);
    });

    it('should include identity in event', () => {
      configure({
        eventEndpoint: '/event',
        batchEvents: true, // Queue it so we can inspect
      });

      emitEvent('test');

      const queue = getEventQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].visitor_id).toBeTruthy();
      expect(queue[0].session_id).toBeTruthy();
      expect(queue[0].pageview_id).toBeTruthy();
      expect(queue[0].event_type).toBe('test');
    });

    it('should increment sequence counter', () => {
      configure({
        eventEndpoint: '/event',
        batchEvents: true,
      });

      emitEvent('test1');
      emitEvent('test2');
      emitEvent('test3');

      const queue = getEventQueue();
      expect(queue).toHaveLength(3);
      expect(queue[0].seq).toBe(1);
      expect(queue[1].seq).toBe(2);
      expect(queue[2].seq).toBe(3);
    });

    it('should use provided options', () => {
      configure({
        eventEndpoint: '/event',
        batchEvents: true,
      });

      emitEvent('custom', {
        payload: { foo: 'bar' },
        path: '/custom-path',
        referrer: 'https://example.com',
        client_timestamp: '2024-01-01T12:00:00.000Z',
      });

      const queue = getEventQueue();
      expect(queue[0].payload).toEqual({ foo: 'bar' });
      expect(queue[0].path).toBe('/custom-path');
      expect(queue[0].referrer).toBe('https://example.com');
      expect(queue[0].client_timestamp).toBe('2024-01-01T12:00:00.000Z');
    });

    it('should use defaults for window location and timestamp', () => {
      configure({
        eventEndpoint: '/event',
        batchEvents: true,
      });

      emitEvent('test');

      const queue = getEventQueue();
      // Should use window.location.pathname from beforeEach mock or fallback
      expect(queue[0].path).toBeTruthy();
      expect(queue[0].referrer).toBeDefined();
      expect(queue[0].client_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
    });
  });

  describe('flushEvents', () => {
    it('should do nothing if queue empty', () => {
      configure({ eventEndpoint: '/event' });

      const sendBeaconSpy = vi.fn(() => true);
      Object.defineProperty(navigator, 'sendBeacon', {
        value: sendBeaconSpy,
        configurable: true,
      });

      flushEvents();

      expect(sendBeaconSpy).not.toHaveBeenCalled();
    });

    it('should send all queued events', () => {
      configure({
        eventEndpoint: '/event',
        batchEvents: true,
      });

      const sendBeaconSpy = vi.fn(() => true);
      Object.defineProperty(navigator, 'sendBeacon', {
        value: sendBeaconSpy,
        configurable: true,
      });

      emitEvent('test1');
      emitEvent('test2');
      emitEvent('test3');

      expect(getEventQueue()).toHaveLength(3);

      flushEvents();

      expect(sendBeaconSpy).toHaveBeenCalledTimes(3);
      expect(getEventQueue()).toHaveLength(0);
    });

    it('should warn if endpoint not configured', () => {
      configure({ batchEvents: true });

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Manually add event to queue for testing
      emitEvent('test'); // This will warn about no endpoint

      resetConfig();
      configure({ eventEndpoint: '/event', batchEvents: true });
      emitEvent('test2'); // This should queue

      resetConfig(); // Remove endpoint
      flushEvents(); // This should warn

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[VisitorContext] Cannot flush events: eventEndpoint not configured'
      );
    });

    it('should clear queue when flushed', () => {
      configure({
        eventEndpoint: '/event',
        batchEvents: true,
      });

      const sendBeaconSpy = vi.fn(() => true);
      Object.defineProperty(navigator, 'sendBeacon', {
        value: sendBeaconSpy,
        configurable: true,
      });

      emitEvent('test');
      expect(getEventQueue()).toHaveLength(1);

      // Flush immediately
      flushEvents();

      expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
      expect(getEventQueue()).toHaveLength(0);
    });
  });

  describe('batching behavior', () => {
    it('should auto-flush after batch interval', async () => {
      // Skip if window.setTimeout not available (SSR environment)
      if (typeof window === 'undefined' || !window.setTimeout) {
        return;
      }

      configure({
        eventEndpoint: '/event',
        batchEvents: true,
        batchInterval: 50, // Short interval for testing
      });

      const sendBeaconSpy = vi.fn(() => true);
      Object.defineProperty(navigator, 'sendBeacon', {
        value: sendBeaconSpy,
        configurable: true,
      });

      emitEvent('test1');
      emitEvent('test2');

      expect(sendBeaconSpy).not.toHaveBeenCalled();
      expect(getEventQueue()).toHaveLength(2);

      // Wait for timer to fire
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(sendBeaconSpy).toHaveBeenCalledTimes(2);
      expect(getEventQueue()).toHaveLength(0);
    });

    it('should batch multiple events before flush', () => {
      configure({
        eventEndpoint: '/event',
        batchEvents: true,
        batchInterval: 5000,
      });

      const sendBeaconSpy = vi.fn(() => true);
      Object.defineProperty(navigator, 'sendBeacon', {
        value: sendBeaconSpy,
        configurable: true,
      });

      // Emit multiple events
      emitEvent('test1');
      emitEvent('test2');
      emitEvent('test3');

      // All should be queued, none sent yet
      expect(getEventQueue()).toHaveLength(3);
      expect(sendBeaconSpy).not.toHaveBeenCalled();

      // Manual flush
      flushEvents();

      // All events should be sent together
      expect(sendBeaconSpy).toHaveBeenCalledTimes(3);
      expect(getEventQueue()).toHaveLength(0);
    });

    it('should start fresh batch after flush', async () => {
      // Skip if window.setTimeout not available (SSR environment)
      if (typeof window === 'undefined' || !window.setTimeout) {
        return;
      }

      configure({
        eventEndpoint: '/event',
        batchEvents: true,
        batchInterval: 50,
      });

      const sendBeaconSpy = vi.fn(() => true);
      Object.defineProperty(navigator, 'sendBeacon', {
        value: sendBeaconSpy,
        configurable: true,
      });

      // First batch
      emitEvent('test1');
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(sendBeaconSpy).toHaveBeenCalledTimes(1);

      // Second batch
      emitEvent('test2');
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(sendBeaconSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('resetEmitter', () => {
    it('should clear queue and reset sequence', () => {
      configure({
        eventEndpoint: '/event',
        batchEvents: true,
      });

      emitEvent('test1');
      emitEvent('test2');

      expect(getEventQueue()).toHaveLength(2);
      expect(getEventQueue()[1].seq).toBe(2);

      resetEmitter();

      expect(getEventQueue()).toHaveLength(0);

      emitEvent('test3');
      expect(getEventQueue()[0].seq).toBe(1); // Reset to 1
    });

    it('should clear queued events', () => {
      configure({
        eventEndpoint: '/event',
        batchEvents: true,
      });

      emitEvent('test1');
      emitEvent('test2');
      expect(getEventQueue()).toHaveLength(2);

      resetEmitter();

      expect(getEventQueue()).toHaveLength(0);
    });
  });
});
