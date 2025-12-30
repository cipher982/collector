/**
 * Event emission module
 *
 * Handles sending events to configured endpoints using sendBeacon or fetch.
 * Supports batching to reduce network overhead.
 */

import { getConfig } from '../config.js';
import { getVisitorId, getSessionId, getPageviewId } from './identity.js';

/**
 * Event data structure
 */
export interface EventData {
  event_type: string;
  payload?: Record<string, any>;
  path?: string;
  referrer?: string;
  client_timestamp?: string;
}

/**
 * Internal event with full identity
 */
interface EventEnvelope {
  visitor_id: string;
  session_id: string;
  pageview_id: string;
  event_type: string;
  seq: number;
  client_timestamp: string;
  path: string;
  referrer: string | null;
  payload: Record<string, any>;
}

/**
 * Event queue for batching
 */
let eventQueue: EventEnvelope[] = [];
let batchTimer: number | null = null;
let eventSequence = 0;

/**
 * Send a single event immediately
 *
 * Uses navigator.sendBeacon if available (preferred for reliability),
 * falls back to fetch with keepalive flag.
 *
 * @param endpoint - URL to send event to
 * @param event - Event data
 * @returns true if sendBeacon was used and accepted, false otherwise
 */
export function sendEvent(endpoint: string, event: EventEnvelope): boolean {
  try {
    const json = JSON.stringify(event);

    // Prefer sendBeacon for reliability (especially on page unload)
    if (navigator.sendBeacon) {
      const blob = new Blob([json], { type: 'application/json' });
      return navigator.sendBeacon(endpoint, blob);
    }

    // Fallback to fetch with keepalive
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: true,
    }).catch(() => {
      // Fire-and-forget, swallow errors
    });

    return false;
  } catch {
    // Fire-and-forget, swallow errors
    return false;
  }
}

/**
 * Flush all queued events immediately
 *
 * Sends all batched events to the configured endpoint.
 */
export function flushEvents(): void {
  if (eventQueue.length === 0) {
    return;
  }

  const config = getConfig();
  const endpoint = config.eventEndpoint;

  if (!endpoint) {
    console.warn('[VisitorContext] Cannot flush events: eventEndpoint not configured');
    eventQueue = [];
    return;
  }

  // Send all events
  const events = [...eventQueue];
  eventQueue = [];

  // Clear batch timer
  if (batchTimer !== null) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  // Send each event
  for (const event of events) {
    sendEvent(endpoint, event);
  }
}

/**
 * Schedule a batch flush
 */
function scheduleBatchFlush(): void {
  const config = getConfig();

  if (batchTimer !== null) {
    return; // Already scheduled
  }

  batchTimer = window.setTimeout(() => {
    batchTimer = null;
    flushEvents();
  }, config.batchInterval);
}

/**
 * Emit an event
 *
 * Sends event data to the configured endpoint. Respects batching configuration.
 * If batching is enabled, queues the event and sends after batchInterval.
 * If batching is disabled, sends immediately.
 *
 * @param event_type - Type of event (e.g., 'pageview', 'click', 'custom')
 * @param options - Event options
 *
 * @example
 * ```typescript
 * import { emitEvent, configure } from '@collector/context';
 *
 * configure({ eventEndpoint: '/event' });
 *
 * emitEvent('button_click', {
 *   payload: { button_id: 'submit' },
 *   path: '/checkout',
 * });
 * ```
 */
export function emitEvent(
  event_type: string,
  options: {
    payload?: Record<string, any>;
    path?: string;
    referrer?: string;
    client_timestamp?: string;
  } = {}
): void {
  const config = getConfig();

  if (!config.eventEndpoint) {
    console.warn('[VisitorContext] Cannot emit event: eventEndpoint not configured');
    return;
  }

  // Increment sequence counter
  eventSequence += 1;

  // Build event envelope
  const envelope: EventEnvelope = {
    visitor_id: getVisitorId(),
    session_id: getSessionId(),
    pageview_id: getPageviewId(),
    event_type,
    seq: eventSequence,
    client_timestamp: options.client_timestamp || new Date().toISOString(),
    path: options.path ?? window.location.pathname,
    referrer: options.referrer ?? (document.referrer || null),
    payload: options.payload ?? {},
  };

  // Handle batching
  if (config.batchEvents) {
    eventQueue.push(envelope);
    scheduleBatchFlush();
  } else {
    // Send immediately
    sendEvent(config.eventEndpoint, envelope);
  }
}

/**
 * Reset event emitter state
 *
 * Clears event queue and resets sequence counter.
 * Useful for testing.
 */
export function resetEmitter(): void {
  eventQueue = [];
  eventSequence = 0;
  if (batchTimer !== null) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
}

/**
 * Get current event queue (for testing)
 */
export function getEventQueue(): readonly EventEnvelope[] {
  return eventQueue;
}
