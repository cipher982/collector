/*
 * PingEq – tiny Web Component that visualises live network latency as a
 * moving ASCII equaliser, a scrolling ticker with the latest value and an
 * optional micro-sparkline overlay.  Zero external dependencies – can reuse
 * a Socket.IO instance exposed as `window.sharedSocket` or fall back to
 * opening its own.
 *
 * Usage (HTML):
 *   <!-- HTTP polling mode -->
 *   <ping-eq endpoint="/health" width="60"></ping-eq>
 *
 *   <!-- Socket.IO round-trip mode (recommended) -->
 *   <ping-eq mode="socket" width="60" interval="1000"></ping-eq>
 */

const GLYPHS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇'];
const DECAY = 0.98; // rolling-max decay per sample

function createGlyphMapper(initialMax = 60, scaling = 'dynamic') {
    let rollingMax = Math.max(initialMax, 10);

    return function glyph(ms) {
        if (!Number.isFinite(ms) || ms < 0) {
            return GLYPHS[0];
        }

        // Update max first for more reactive bars
        rollingMax = Math.max(ms, rollingMax * DECAY, 10);

        let idx = 0;
        if (scaling === 'log') {
            const v = Math.log10(Math.max(ms, 1));
            const vmax = Math.log10(Math.max(rollingMax, 10));
            idx = Math.floor((v / vmax) * GLYPHS.length);
        } else {
            // dynamic / linear
            idx = Math.floor((ms / rollingMax) * GLYPHS.length);
        }

        return GLYPHS[Math.min(GLYPHS.length - 1, Math.max(0, idx))];
    };
}

// ---------------------------------------------------------------------------
// Latency measurement strategies
// ---------------------------------------------------------------------------

async function measurePingHttp(url) {
    const t0 = performance.now();
    try {
        await fetch(`${url}${url.includes('?') ? '&' : '?'}cb=${Math.random()}`, {
            cache: 'no-store',
            mode: 'no-cors',
        });
        return Math.round(performance.now() - t0);
    } catch {
        return NaN;
    }
}

function createSocket() {
    if (typeof io === 'undefined') {
        throw new Error('PingEq: Socket.IO client script missing');
    }
    return io();
}

function measurePingSocket(socket) {
    return new Promise((resolve) => {
        const t0 = performance.now();
        socket.timeout(3000).emit('latency_check', t0, function (err) {
            if (err) {
                return resolve(NaN);
            }
            resolve(Math.round(performance.now() - t0));
        });
    });
}

// ---------------------------------------------------------------------------
// Web Component
// ---------------------------------------------------------------------------

class PingEqualizer extends HTMLElement {
    static get observedAttributes() {
        return ['endpoint', 'interval', 'width', 'mode', 'scaling', 'ticker', 'sparkline'];
    }

    constructor() {
        super();

        // Shadow DOM keeps styles isolated from page
        this._root = this.attachShadow({ mode: 'open' });

        // Defaults (can be overridden by attributes)
        this._endpoint = '/health';
        this._interval = 1000; // ms
        this._width = 60; // glyphs
        this._mode = 'http'; // or 'socket'
        this._scaling = 'dynamic'; // or 'log'
        this._enableTicker = true;
        this._enableSpark = true;

        this._buffer = '';
        this._ring = new Float32Array(this._width);
        this._ringPtr = 0;

        this._glyphFor = createGlyphMapper(60, this._scaling);

        // External Socket.IO or own instance
        this._socket = null;

        // Internal timer handle
        this._running = false;

        // Build DOM structure
        this._buildDom();
    }

    // Lifecycle -----------------------------------------------------------

    connectedCallback() {
        this._start();
        // Pause when tab hidden to save CPU
        document.addEventListener('visibilitychange', this._visHandler);
    }

    disconnectedCallback() {
        this._stop();
        document.removeEventListener('visibilitychange', this._visHandler);
    }

    attributeChangedCallback(name, _old, _new) {
        switch (name) {
            case 'endpoint':
                this._endpoint = this.getAttribute('endpoint') || '/health';
                break;
            case 'interval':
                this._interval = Number(this.getAttribute('interval')) || 1000;
                break;
            case 'width':
                this._width = Number(this.getAttribute('width')) || 60;
                this._ring = new Float32Array(this._width);
                this._ringPtr = 0;
                // Resize canvas & update bar buffer
                this._canvas.width = this._width;
                this._buffer = this._buffer.slice(-this._width).padStart(this._width, GLYPHS[0]);
                this._pre.textContent = this._buffer;
                break;
            case 'mode':
                this._mode = this.getAttribute('mode') || 'http';
                break;
            case 'scaling':
                this._scaling = this.getAttribute('scaling') || 'dynamic';
                this._glyphFor = createGlyphMapper(60, this._scaling);
                break;
            case 'ticker':
                this._enableTicker = this.getAttribute('ticker') !== 'off';
                this._tickerSpan.style.display = this._enableTicker ? 'inline' : 'none';
                break;
            case 'sparkline':
                this._enableSpark = this.getAttribute('sparkline') !== 'off';
                this._canvas.style.display = this._enableSpark ? 'block' : 'none';
                break;
            default:
        }
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    _buildDom() {
        // Styles – scoped to shadow
        const style = document.createElement('style');
        style.textContent = `
            :host { display:block; width:100%; font-family:monospace; overflow:hidden; }
            pre { margin:0; line-height:1.2em; overflow:hidden; }
            .wrap { position:relative; display:block; overflow:hidden; }
            .ticker {
                position:absolute;
                white-space:nowrap;
                pointer-events:none;
                right:-100%;
                animation:scroll var(--ticker-speed, 8s) linear infinite;
                top:0;
            }
            @keyframes scroll {
                from { transform:translateX(100%); }
                to   { transform:translateX(-100%); }
            }
            canvas { position:absolute; top:0; left:0; height:1.2em; width:100%; opacity:0.3; pointer-events:none; z-index:-1; }
        `;

        // Equaliser bar
        this._pre = document.createElement('pre');
        this._pre.textContent = ''.padStart(this._width, GLYPHS[0]);

        // Wrapper for overlay elements
        const wrapper = document.createElement('div');
        wrapper.className = 'wrap';
        wrapper.appendChild(this._pre);

        // Ticker
        this._tickerSpan = document.createElement('span');
        this._tickerSpan.className = 'ticker';
        wrapper.appendChild(this._tickerSpan);

        // Sparkline canvas
        this._canvas = document.createElement('canvas');
        this._canvas.width = this._width;
        this._canvas.height = 9; // 1em ~ 16px → 9px good baseline
        wrapper.appendChild(this._canvas);

        this._ctx = this._canvas.getContext('2d');

        // Append to shadow root
        this._root.appendChild(style);
        this._root.appendChild(wrapper);
    }

    _visHandler = () => {
        if (document.hidden) {
            this._stop();
        } else {
            this._start();
        }
    };

    _getSocket() {
        if (this._socket) return this._socket;

        // reuse shared if provided
        if (window.sharedSocket) {
            this._socket = window.sharedSocket;
        } else {
            this._socket = createSocket();
        }
        return this._socket;
    }

    async _measure() {
        if (this._mode === 'socket') {
            const sock = this._getSocket();
            return measurePingSocket(sock);
        }
        return measurePingHttp(this._endpoint);
    }

    _drawSparkline() {
        if (!this._enableSpark) return;

        const h = this._canvas.height;
        const w = this._width;
        const ctx = this._ctx;
        const max = Math.max(...this._ring, 10);

        ctx.clearRect(0, 0, w, h);
        ctx.beginPath();
        for (let i = 0; i < w; i += 1) {
            const idx = (this._ringPtr + i) % w;
            const val = this._ring[idx];
            const y = h - (val / max) * h;
            if (i === 0) ctx.moveTo(i, y);
            else ctx.lineTo(i, y);
        }
        // Use theme accent-neutral colour if available.
        const cssColor = getComputedStyle(document.documentElement).getPropertyValue('--c-accent-neutral').trim();
        ctx.strokeStyle = cssColor || '#57f';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    async _tick() {
        const ms = await this._measure();

        // --- glyph line -------------------------------------------------
        this._buffer += this._glyphFor(ms);
        if (this._buffer.length > this._width) {
            this._buffer = this._buffer.slice(-this._width);
        }
        this._pre.textContent = this._buffer;

        // --- ticker ----------------------------------------------------
        if (this._enableTicker) {
            this._tickerSpan.textContent = `${Number.isFinite(ms) ? ms : '--'} ms `;
        }

        // --- sparkline data -------------------------------------------
        this._ring[this._ringPtr] = Number.isFinite(ms) ? ms : 0;
        this._ringPtr = (this._ringPtr + 1) % this._width;
        this._drawSparkline();
    }

    async _loop() {
        while (this._running) {
            const start = performance.now();
            await this._tick();
            const elapsed = performance.now() - start;
            // Wait for the remaining interval time (avoid drift)
            await new Promise((r) => setTimeout(r, Math.max(this._interval - elapsed, 0)));
        }
    }

    _start() {
        if (this._running) return;
        this._running = true;
        this._loop();
    }

    _stop() {
        this._running = false;
    }

    // ------------------------------------------------------------------
    // Public helper – return rolling stats of the latency ring buffer.
    // ------------------------------------------------------------------

    /**
     * Compute mean / standard-deviation / min / max for the samples that have
     * already been written into the ring buffer.  Zero or non-finite samples
     * (place-holders for failed pings) are ignored so they do not skew the
     * distribution.
     *
     * Returns an empty object if no valid samples are present yet.
     */
    getStats() {
        const values = Array.from(this._ring).filter((v) => Number.isFinite(v) && v > 0);
        if (!values.length) return {};

        const n = values.length;
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
        const stddev = Math.sqrt(variance);

        return {
            mean,
            stddev,
            min: Math.min(...values),
            max: Math.max(...values),
            samples: n,
            last: values[values.length - 1],
        };
    }

    /**
     * Return the most recent latency sample in milliseconds (NaN if none).
     */
    getLastSample() {
        const idx = (this._ringPtr - 1 + this._width) % this._width;
        return this._ring[idx] || NaN;
    }
}

// Register custom element
window.customElements.define('ping-eq', PingEqualizer);

// Named export for ES module consumers (optional)
export { PingEqualizer };
