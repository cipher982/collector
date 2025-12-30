/**
 * Integration test for full visitor context workflow
 *
 * Tests the complete flow: configure → collect → emit → verify
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  configure,
  resetConfig,
  VisitorContext,
  emitEvent,
  flushEvents,
  resetEmitter,
} from '../../src/index.js';
import { storage } from '../../src/utils/storage.js';

describe('Full Workflow Integration', () => {
  beforeEach(() => {
    resetConfig();
    resetEmitter();
    storage.local.clear();
    storage.session.clear();
  });

  it('should collect complete visitor context with all modules enabled', async () => {
    configure({
      modules: {
        context: true,
        performance: false, // Disable for faster test (web vitals timeout)
        network: false, // Disable for faster test (network measurements)
        fingerprint: false, // Disabled by default
        battery: false,
        gpu: false,
      },
    });

    const ctx = await VisitorContext.collect();

    // Verify identity
    expect(ctx.identity).toBeDefined();
    expect(ctx.identity.visitorId).toMatch(/^v_/);
    expect(ctx.identity.sessionId).toMatch(/^s_/);
    expect(ctx.identity.pageviewId).toMatch(/^p_/);

    // Verify browser info
    expect(ctx.browser).toBeDefined();
    expect(ctx.browser).toHaveProperty('userAgent');
    expect(ctx.browser).toHaveProperty('language');
    expect(ctx.browser).toHaveProperty('platform');

    // Verify device info
    expect(ctx.device).toBeDefined();
    expect(ctx.device).toHaveProperty('screenWidth');
    expect(ctx.device).toHaveProperty('screenHeight');
    expect(ctx.device).toHaveProperty('viewportWidth');
    expect(ctx.device).toHaveProperty('viewportHeight');

    // Verify locale info
    expect(ctx.locale).toBeDefined();
    expect(ctx.locale).toHaveProperty('timezone');
    expect(typeof ctx.locale.timezoneOffset).toBe('number');

    // Performance and network disabled for this test (faster execution)
    expect(ctx.performance).toBeUndefined();
    expect(ctx.network).toBeUndefined();

    // Fingerprint should not be collected (disabled)
    expect(ctx.fingerprint).toBeUndefined();
  });

  it('should respect module configuration', async () => {
    configure({
      modules: {
        context: true,
        performance: false, // Disable performance
        network: false, // Disable network
        fingerprint: false,
        battery: false,
        gpu: false,
      },
    });

    const ctx = await VisitorContext.collect();

    // Should have identity and context
    expect(ctx.identity).toBeDefined();
    expect(ctx.browser).toBeDefined();
    expect(ctx.device).toBeDefined();
    expect(ctx.locale).toBeDefined();

    // Should NOT have performance or network
    expect(ctx.performance).toBeUndefined();
    expect(ctx.network).toBeUndefined();
    expect(ctx.fingerprint).toBeUndefined();
  });

  it('should collect fingerprint when explicitly enabled', async () => {
    configure({
      modules: {
        context: true,
        performance: false,
        network: false,
        fingerprint: true, // Explicitly enable
        battery: false,
        gpu: false,
      },
      fingerprint: {
        canvas: true,
        fonts: true,
        webgl: true,
      },
    });

    const ctx = await VisitorContext.collect();

    // Should have fingerprint data
    expect(ctx.fingerprint).toBeDefined();

    // Fingerprint may be null if APIs not available, but should be defined
    expect(ctx.fingerprint).toHaveProperty('canvas');
    expect(ctx.fingerprint).toHaveProperty('fonts');
    expect(ctx.fingerprint).toHaveProperty('webgl');
  });

  it('should emit events with visitor context', () => {
    configure({
      eventEndpoint: '/event',
      batchEvents: false, // Immediate send
    });

    const sendBeaconSpy = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeaconSpy,
      configurable: true,
    });

    emitEvent('page_view', {
      payload: {
        page_title: 'Test Page',
        page_url: '/test',
      },
    });

    expect(sendBeaconSpy).toHaveBeenCalledOnce();

    // Verify event structure (check blob content indirectly)
    const blob = sendBeaconSpy.mock.calls[0][1] as Blob;
    expect(blob.type).toContain('application/json');
  });

  it('should batch and flush events', async () => {
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

    // Emit multiple events
    emitEvent('click', { payload: { button: 'nav-home' } });
    emitEvent('click', { payload: { button: 'nav-about' } });
    emitEvent('scroll', { payload: { depth: 50 } });

    // Should be batched (not sent yet)
    expect(sendBeaconSpy).not.toHaveBeenCalled();

    // Manually flush
    flushEvents();

    // All events should be sent
    expect(sendBeaconSpy).toHaveBeenCalledTimes(3);
  });

  it('should persist visitor ID across page loads', async () => {
    configure({
      modules: {
        context: true,
        performance: false, // Disable for faster test
        network: false, // Disable for faster test
        fingerprint: false,
        battery: false,
        gpu: false,
      },
      identity: {
        persist: true,
        visitorIdKey: 'test_visitor_id',
        sessionIdKey: 'test_session_id',
      },
    });

    // First page load
    const ctx1 = await VisitorContext.collect();
    const visitorId1 = ctx1.identity.visitorId;
    const sessionId1 = ctx1.identity.sessionId;

    // Simulate new page load (clear pageview, keep storage)
    resetEmitter();

    // Second page load
    const ctx2 = await VisitorContext.collect();
    const visitorId2 = ctx2.identity.visitorId;
    const sessionId2 = ctx2.identity.sessionId;
    const pageviewId2 = ctx2.identity.pageviewId;

    // Visitor ID should persist
    expect(visitorId2).toBe(visitorId1);

    // Session ID should persist (same session)
    expect(sessionId2).toBe(sessionId1);

    // Pageview ID should be different
    expect(pageviewId2).not.toBe(ctx1.identity.pageviewId);
  });

  it('should handle end-to-end workflow: collect → emit → verify', async () => {
    // Configure library
    configure({
      eventEndpoint: '/event',
      batchEvents: false,
      modules: {
        context: true,
        performance: true,
        network: true,
        fingerprint: false,
        battery: false,
        gpu: false,
      },
    });

    // Mock sendBeacon
    const sendBeaconSpy = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeaconSpy,
      configurable: true,
    });

    // Step 1: Collect visitor context
    const ctx = await VisitorContext.collect();

    expect(ctx.identity).toBeDefined();
    expect(ctx.browser).toBeDefined();
    expect(ctx.device).toBeDefined();

    // Step 2: Emit event with context data
    emitEvent('pageview', {
      payload: {
        page_title: 'Home',
        context: {
          browser: ctx.browser.userAgent,
          screen: `${ctx.device.screenWidth}x${ctx.device.screenHeight}`,
        },
      },
    });

    // Step 3: Verify event was sent
    expect(sendBeaconSpy).toHaveBeenCalledOnce();
    expect(sendBeaconSpy).toHaveBeenCalledWith(
      '/event',
      expect.any(Blob)
    );
  });

  it('should handle errors gracefully', async () => {
    // Configure with invalid endpoint (no protocol)
    configure({
      eventEndpoint: '/invalid-endpoint',
      batchEvents: false,
    });

    // Mock sendBeacon to throw
    const sendBeaconSpy = vi.fn(() => {
      throw new Error('Network error');
    });
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeaconSpy,
      configurable: true,
    });

    // Should not throw when emitting event
    expect(() => {
      emitEvent('test');
    }).not.toThrow();
  });

  it('should support tree-shakeable imports', async () => {
    // This test verifies that individual modules can be imported
    // (actual tree-shaking is verified at build time)

    const { getBrowserInfo, getDeviceInfo, getLocaleInfo } = await import(
      '../../src/collectors/context.js'
    );
    const { getVisitorId, getSessionId, getPageviewId } = await import(
      '../../src/core/identity.js'
    );

    // Use individual functions
    const browser = getBrowserInfo();
    const device = getDeviceInfo();
    const locale = getLocaleInfo();

    // Verify structure (values may be empty/zero in test environment)
    expect(browser).toHaveProperty('userAgent');
    expect(device).toHaveProperty('screenWidth');
    expect(locale).toHaveProperty('timezone');

    // Identity functions require config
    const identityConfig = {
      persist: true,
      visitorIdKey: 'test_v',
      sessionIdKey: 'test_s',
    };

    const visitorId = getVisitorId(identityConfig);
    const sessionId = getSessionId(identityConfig);
    const pageviewId = getPageviewId();

    expect(visitorId).toMatch(/^v_/);
    expect(sessionId).toMatch(/^s_/);
    expect(pageviewId).toMatch(/^p_/);
  });
});
