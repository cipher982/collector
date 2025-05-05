/**
 * Ping Equalizer – lightweight ASCII bar visualiser for live network latency.
 *
 * USAGE (in a regular script tag):
 *   <script src="/static/pingEqualizer.js"></script>
 *   <script>
 *       const eq = createPingEqualizer('#pingBars', {
 *           endpoint: '/health',   // URL to ping (HTTP mode)
 *           interval: 1000,        // ms between pings
 *           width: 60,             // glyphs kept in sliding window
 *           maxLatency: 60,        // ms mapped to highest glyph
 *           mode: 'http',          // 'http' (default) or 'socket'
 *           socket: existingSocket // reuse a Socket.IO instance (socket mode)
 *       });
 *       eq.start();
 *   </script>
 *
 * Supply either a DOM element reference or a selector string as the first
 * parameter.  The helper will create/overwrite the element contents with a
 * monospace <pre> block that is updated in-place.  It returns an object with
 * `start()`, `stop()` and `destroy()` controls.
 */

(function (global) {
    'use strict';

    // Unicode blocks from lowest (▁) to highest (▇)
    const GLYPHS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇'];

    // Rolling-max decay factor (e.g. 2 % drop per tick)
    const DECAY = 0.98;

    /**
     * Map a latency value in milliseconds to one of the block characters.
     * Values above `max` are clamped to the top glyph; negatives map to 0.
     * @param {number} ms
     * @param {number} max
     * @returns {string}
     */
    // Adaptive glyph mapper using rolling max with exponential decay.
    function createGlyphMapper(initialMax) {
        let rollingMax = Math.max(initialMax, 10);

        return function map(ms) {
            if (!Number.isFinite(ms) || ms < 0) {
                return GLYPHS[0];
            }

            // Update rolling max: keep larger of current sample or decayed previous max.
            rollingMax = Math.max(ms, rollingMax * DECAY, 10);

            const idx = Math.min(
                GLYPHS.length - 1,
                Math.floor((ms / rollingMax) * GLYPHS.length)
            );
            return GLYPHS[idx];
        };
    }

    /**
     * Perform a best-effort latency measurement by issuing a `fetch` request
     * to the provided endpoint and timing the round-trip using
     * `performance.now()`.  Cache is bypassed to avoid false hits.
     *
     * @param {string} url – endpoint to ping
     * @returns {Promise<number>} – latency in milliseconds (may resolve to
     *                              NaN if the request fails or is CORS-blocked)
     */
    // ------------------------------------------------------------------
    // Latency measurement strategies
    // ------------------------------------------------------------------

    async function measurePingHttp(url) {
        const t0 = performance.now();
        try {
            await fetch(`${url}${url.includes('?') ? '&' : '?'}cb=${Math.random()}`, {
                cache: 'no-store',
                mode: 'no-cors'
            });
            return Math.round(performance.now() - t0);
        } catch (_) {
            return NaN;
        }
    }

    /* eslint-disable no-undef -- io comes from Socket.IO client global */
    function createSocket(urlPath = undefined) {
        if (typeof io === 'undefined') {
            throw new Error('PingEqualizer: Socket.IO client not loaded');
        }
        return urlPath ? io(urlPath, { transports: ['websocket'] }) : io();
    }

    function measurePingSocket(socket) {
        return new Promise((resolve) => {
            const t0 = performance.now();

            // With `timeout`, Socket.IO passes (err, ...response) to the ACK
            // callback.  We only care about success/failure, RTT comes from
            // performance.now().
            /* eslint-disable func-names */
            socket.timeout(3000).emit('latency_check', t0, function (err) {
                if (err) {
                    return resolve(NaN);
                }
                const delta = performance.now() - t0;
                return resolve(Math.round(delta));
            });
            /* eslint-enable func-names */
        });
    }

    /**
     * Create a new ping equalizer instance.
     *
     * @param {HTMLElement|string} target – DOM node or selector string where
     *        the equalizer should render.
     * @param {Object} [options]
     * @param {string} [options.endpoint='/health'] – URL to ping.
     * @param {number} [options.interval=1000]      – polling interval (ms).
     * @param {number} [options.width=60]          – glyphs kept in the buffer.
     * @param {number} [options.maxLatency=60]     – ms that maps to tallest bar.
     * @param {'http'|'socket'} [options.mode='http'] – measurement backend.
     * @param {Object} [options.socket]            – existing Socket.IO instance (mode='socket').
     */
    function createPingEqualizer(target, options = {}) {
        const {
            endpoint = '/health',
            interval = 1000,
            width = 60,
            maxLatency = 60,
            mode = 'http',
            socket: externalSocket = null,
        } = options;

        // Resolve target element
        const root = typeof target === 'string' ? document.querySelector(target) : target;
        if (!root) {
            throw new Error('PingEqualizer: target element not found');
        }

        // Ensure monospace pre element for stable glyph widths
        let pre = root.tagName === 'PRE' ? root : root.querySelector('pre');
        if (!pre) {
            pre = document.createElement('pre');
            pre.style.margin = '0';
            pre.style.fontFamily = 'monospace';
            pre.style.lineHeight = '1.2em';
            pre.style.overflow = 'hidden';
            pre.style.height = '1.2em';
            root.appendChild(pre);
        }

        let buffer = '';
        let timerId = null;

        // Glyph mapping function scoped to this instance
        const glyphFor = createGlyphMapper(maxLatency);

        let socketInstance = null;

        async function tick() {
            let ms;
            if (mode === 'socket') {
                if (!socketInstance) {
                    socketInstance = externalSocket || createSocket();
                }
                ms = await measurePingSocket(socketInstance);
            } else {
                // default HTTP mode
                ms = await measurePingHttp(endpoint);
            }
            buffer += glyphFor(ms);
            if (buffer.length > width) {
                buffer = buffer.slice(-width);
            }
            pre.textContent = buffer;
        }

        function start() {
            if (timerId === null) {
                // Kick off immediately, then at interval.
                tick();
                timerId = setInterval(tick, interval);
            }
        }

        function stop() {
            if (timerId !== null) {
                clearInterval(timerId);
                timerId = null;
            }
        }

        function destroy() {
            stop();
            buffer = '';
            if (pre.parentElement) {
                pre.parentElement.removeChild(pre);
            }
        }

        return { start, stop, destroy };
    }

    // Attach factory to global namespace to allow usage from plain script tag.
    global.createPingEqualizer = createPingEqualizer;
})(typeof window !== 'undefined' ? window : this);
