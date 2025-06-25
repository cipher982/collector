// Configuration
const CONFIG = {
    COLLECTION_DELAY: 3000,
    ENDPOINT: "/collect",
};

// ------------------------------------------------------------------
// Colour helpers (phase-1 theme refactor)
// ------------------------------------------------------------------

/**
 * Read a CSS custom property from :root.
 * @param {string} name  e.g. '--c-series-1'
 * @returns {string}
 */
function cssVar(name) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
}

/**
 * Return colour as rgba() where `alpha` is applied.
 *  - If the variable is hex (#rrggbb or #rgb) we convert.
 *  - If it is already rgb/rgba() we inject/override alpha.
 *  - Otherwise returns the raw value (best-effort).
 */
function cssVarAlpha(name, alpha = 1) {
    let raw = cssVar(name);

    if (!raw) return "";

    // HEX → rgba
    if (raw.startsWith("#")) {
        let hex = raw.slice(1);
        if (hex.length === 3) {
            hex = hex.split(""
            ).map(c => c + c).join("");
        }
        const intVal = parseInt(hex, 16);
        const r = (intVal >> 16) & 255;
        const g = (intVal >> 8) & 255;
        const b = intVal & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // rgb/rgba → rgba with new alpha
    const rgbMatch = raw.match(/rgba?\(([^)]+)\)/);
    if (rgbMatch) {
        const [r, g, b] = rgbMatch[1].split(',').map(s => s.trim()).slice(0, 3);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // Fallback – return raw (may be "red" etc.)
    return raw;
}

// WebGL compressed texture extensions we probe for – kept at module scope to avoid
// re-allocating the same array every call.
const TEXTURE_EXT_NAMES = [
    'EXT_texture_compression_bptc',
    'WEBGL_compressed_texture_astc',
    'WEBGL_compressed_texture_s3tc',
    'WEBGL_compressed_texture_etc',
    'WEBGL_compressed_texture_etc1',
    'WEBGL_compressed_texture_pvrtc',
];

// Data collectors
const collectors = {
    // Browser Information
    getBrowserInfo() {
        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            cookiesEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine,
            platform: navigator.platform,
            doNotTrack: navigator.doNotTrack,
            deviceMemory: navigator.deviceMemory,
            hardwareConcurrency: navigator.hardwareConcurrency,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            colorDepth: window.screen.colorDepth,
            orientation: (screen.orientation && screen.orientation.type) || window.orientation || "unknown"
        };
    },

    // Performance Metrics
    getPerformanceData() {
        return {
            timing: window.performance.timing,
            memory: window.performance.memory || {},
            navigation: window.performance.navigation || {},
            resources: Array.from(window.performance.getEntriesByType("resource")).map(resource => ({
                name: resource.name,
                duration: resource.duration,
                size: resource.transferSize,
                type: resource.initiatorType
            })),
            webVitals: {} // will be filled asynchronously
        };
    },

    // ------------------------------------------------------------------
    // Network Information API
    // ------------------------------------------------------------------
    getNetworkInfo() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!connection) return {};

        return {
            effectiveType: connection.effectiveType,
            downlink: connection.downlink, // Mbps
            rtt: connection.rtt, // ms
            saveData: connection.saveData
        };
    },

    // ------------------------------------------------------------------
    // Active network performance test (latency + bandwidth)
    // ------------------------------------------------------------------
    async measureNetworkPerformance() {
        const samples = 5;
        const latencies = [];

        // --- Latency (RTT) ------------------------------------------------
        for (let i = 0; i < samples; i += 1) {
            const start = performance.now();
            try {
                // Cache-bust so we always hit the server
                await fetch(`/ping?cb=${Math.random()}`, { cache: 'no-store' });
                latencies.push(performance.now() - start);
            } catch {
                latencies.push(null);
            }
        }

        const validLatencies = latencies.filter(Number.isFinite);
        const latencyMs = validLatencies.length
            ? validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length
            : null;

        // --- Bandwidth ----------------------------------------------------
        let bandwidthMbps = null;
        try {
            const size = 500_000; // 0.5 MB
            const t0 = performance.now();
            const resp = await fetch(`/bw?bytes=${size}&cb=${Math.random()}`, { cache: 'no-store' });
            // Read body fully to ensure complete download
            await resp.arrayBuffer();
            const deltaMs = performance.now() - t0;
            bandwidthMbps = (size * 8) / (deltaMs * 1_000); // bits / ms → Mbps
        } catch {
            // ignore
        }

        return { latencyMs, bandwidthMbps };
    },

    // ------------------------------------------------------------------
    // Battery Status API (async)
    // ------------------------------------------------------------------
    async getBatteryInfo() {
        if (!navigator.getBattery) {
            return {};
        }

        try {
            const battery = await navigator.getBattery();
            return {
                level: Math.round(battery.level * 100), // percentage
                charging: battery.charging
            };
        } catch {
            return {};
        }
    },

    // Error Tracking
    setupErrorTracking() {
        const errors = [];
        window.onerror = (message, source, lineno, colno, error) => {
            errors.push({
                message,
                source,
                lineno,
                colno,
                stack: error?.stack,
                timestamp: new Date().toISOString()
            });
        };
        return errors;
    },

    // Fingerprinting Methods
    getCanvasFingerprint() {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 200;
        canvas.height = 50;

        // Draw text with different styles
        ctx.textBaseline = "top";
        ctx.font = "14px Arial";
        ctx.fillStyle = "#f60";
        ctx.fillRect(125,1,62,20);
        ctx.fillStyle = "#069";
        ctx.fillText("Hello, world!", 2, 15);
        
        return canvas.toDataURL();
    },

    getFontFingerprint() {
        const baseFonts = ["monospace", "sans-serif", "serif"];
        const testString = "mmmmmmmmmmlli";
        const testSize = "72px";
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const detectFont = (font) => {
            ctx.font = testSize + " " + baseFonts[0];
            const baseWidth = ctx.measureText(testString).width;
            ctx.font = testSize + " " + font + "," + baseFonts[0];
            return baseWidth !== ctx.measureText(testString).width;
        };

        const fonts = [
            "Arial", "Courier New", "Georgia", "Times New Roman",
            "Verdana", "Helvetica", "Comic Sans MS"
        ];

        return fonts.filter(font => detectFont(font));
    },

    getWebGLInfo() {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (!gl) return null;

        return {
            vendor: gl.getParameter(gl.VENDOR),
            renderer: gl.getParameter(gl.RENDERER),
            webglVersion: gl.getParameter(gl.VERSION),
            shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
            extensions: gl.getSupportedExtensions()
        };
    },

    // ------------------------------------------------------------------
    // Core Web Vitals helpers (LCP, FID, CLS)
    // ------------------------------------------------------------------
    /**
     * Return a promise that resolves with an object containing the Core Web
     * Vitals (LCP, FID, CLS).  The helper waits – up to `TIMEOUT_MS` – for
     * the web-vitals library to finish loading instead of bailing out
     * immediately.  This removes the race condition where our module script
     * executes before the CDN script has evaluated and avoids the persistent
     * “–” placeholders the user reported.
     */
    getWebVitals() {
        const vitals = {};

        // Helper – when we receive a metric, persist it on the global data
        // object (if already initialised) and trigger an in-place UI update so
        // the card refreshes without a full re-render.
        const pushMetric = (name, value) => {
            const dbg = window.__currentDebugData;
            if (dbg?.performance?.webVitals) {
                dbg.performance.webVitals[name] = value;
                ui.displayWebVitals(dbg);
            }
        };

        // If the library is ready, wire up listeners immediately; otherwise
        // schedule a non-blocking check that will retry until it shows up. We
        // always resolve *synchronously* so the main collection flow is never
        // delayed and the page can render instantly.

        const installListeners = () => {
            try {
                window.webVitals.getLCP((m) => {
                    vitals[m.name] = m.value;
                    pushMetric(m.name, m.value);
                });
                window.webVitals.getFID((m) => {
                    vitals[m.name] = m.value;
                    pushMetric(m.name, m.value);
                });
                window.webVitals.getCLS((m) => {
                    vitals[m.name] = m.value;
                    pushMetric(m.name, m.value);
                });
            } catch {
                // Defensive – if the API surface changed, ignore failure.
            }
        };

        if (typeof window.webVitals !== 'undefined') {
            // Fast-path: library already present.
            installListeners();
        } else {
            // Try to load the library dynamically (approx 10 kB) – if that
            // fails (e.g. CSP blocks external fetch) fall back to a very
            // lightweight manual calculation for LCP and CLS.

            import('https://unpkg.com/web-vitals@3/dist/web-vitals.es5.min.js')
                .then(() => {
                    installListeners();
                })
                .catch(() => {
                    // Manual fallback – best-effort approximations so that
                    // the user at least sees some numbers instead of "–".

                    try {
                        // LCP ----------------------------------------------------------------
                        const tryLcp = () => {
                            const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
                            if (lcpEntries.length) {
                                const last = lcpEntries[lcpEntries.length - 1];
                                vitals.LCP = last.startTime;
                                pushMetric('LCP', vitals.LCP);
                            }
                        };
                        
                        // Check if LCP entries are available immediately
                        tryLcp();
                        
                        // If no LCP entries found, use a fallback based on navigation timing
                        if (!vitals.LCP && performance.timing) {
                            const navStart = performance.timing.navigationStart;
                            const loadComplete = performance.timing.loadEventEnd;
                            if (loadComplete > navStart) {
                                vitals.LCP = loadComplete - navStart;
                                pushMetric('LCP', vitals.LCP);
                            }
                        }
                        
                        // `largest-contentful-paint` can still update after
                        // load, so observe until load+5 s.
                        const po = new PerformanceObserver((list) => {
                            list.getEntries().forEach(() => tryLcp());
                        });
                        po.observe({ type: 'largest-contentful-paint', buffered: true });
                        setTimeout(() => po.disconnect(), 5000);

                        // FID ----------------------------------------------------------------
                        // FID measures the delay from when a user first interacts with a page
                        // to when the browser is actually able to begin processing event handlers
                        let fidValue = null;
                        const poFid = new PerformanceObserver((list) => {
                            for (const entry of list.getEntries()) {
                                // Only record the first input delay
                                if (fidValue === null) {
                                    fidValue = entry.processingStart - entry.startTime;
                                    vitals.FID = fidValue;
                                    pushMetric('FID', vitals.FID);
                                    poFid.disconnect();
                                    break;
                                }
                            }
                        });
                        poFid.observe({ type: 'first-input', buffered: true });
                        setTimeout(() => poFid.disconnect(), 5000);

                        // CLS ----------------------------------------------------------------
                        let clsValue = 0;
                        const poCls = new PerformanceObserver((list) => {
                            for (const e of list.getEntries()) {
                                if (!e.hadRecentInput) clsValue += e.value;
                            }
                            vitals.CLS = +clsValue.toFixed(3);
                            pushMetric('CLS', vitals.CLS);
                        });
                        poCls.observe({ type: 'layout-shift', buffered: true });
                        setTimeout(() => poCls.disconnect(), 5000);
                    } catch {
                        // browsers w/out PerfObserver – give up silently
                    }
                });
        }

        // Return the (possibly empty) vitals object immediately – do not wait
        // for metrics so that the dashboard stays snappy.
        return Promise.resolve(vitals);
    },

    // ------------------------------------------------------------------
    // GPU micro-benchmarks (baseline FPS, GPU timer query, texture support)
    // ------------------------------------------------------------------

    async runBaselineFps(durationMs = 1200) {
        // Lightweight FPS probe that keeps only running stats (no growing arrays)
        return new Promise(resolve => {
            let start;
            let prev;
            let sum = 0;
            let count = 0;
            let min = Infinity;
            let max = 0;

            const step = (ts) => {
                if (start === undefined) {
                    start = prev = ts;
                    return requestAnimationFrame(step);
                }

                const fps = 1000 / (ts - prev);
                prev = ts;

                if (Number.isFinite(fps)) {
                    sum += fps;
                    count += 1;
                    if (fps < min) min = fps;
                    if (fps > max) max = fps;
                }

                if (ts - start < durationMs) {
                    return requestAnimationFrame(step);
                }

                if (!count) {
                    resolve({ available: false });
                    return;
                }

                const avg = sum / count;
                resolve({
                    available: true,
                    avgFps: +avg.toFixed(1),
                    minFps: +min.toFixed(1),
                    maxFps: +max.toFixed(1),
                });
            };

            requestAnimationFrame(step);
        });
    },

    async runGpuTimerQuery(timeoutMs = 250) {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return { available: false };

        const isWebGL2 = gl instanceof WebGL2RenderingContext;
        const ext = gl.getExtension(isWebGL2 ? 'EXT_disjoint_timer_query_webgl2' : 'EXT_disjoint_timer_query');
        if (!ext) return { available: false };

        // helpers to hide WebGL1/2 differences
        const createQuery = isWebGL2 ? gl.createQuery.bind(gl) : ext.createQueryEXT.bind(ext);
        const beginQuery = isWebGL2 ? gl.beginQuery.bind(gl) : ext.beginQueryEXT.bind(ext);
        const endQuery = isWebGL2 ? gl.endQuery.bind(gl) : ext.endQueryEXT.bind(ext);
        const resultAvailable = (q) =>
            isWebGL2 ? gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) : ext.getQueryObjectEXT(q, ext.QUERY_RESULT_AVAILABLE_EXT);
        const resultValue = (q) =>
            isWebGL2 ? gl.getQueryParameter(q, gl.QUERY_RESULT) : ext.getQueryObjectEXT(q, ext.QUERY_RESULT_EXT);

        const query = createQuery();
        try {
            // submit a trivial clear command – colour does not matter
            beginQuery(ext.TIME_ELAPSED_EXT, query);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            endQuery(ext.TIME_ELAPSED_EXT);

            const start = performance.now();
            return await new Promise((res) => {
                const poll = () => {
                    if (performance.now() - start > timeoutMs) {
                        res({ available: true, timeout: true });
                        return;
                    }

                    if (!resultAvailable(query)) {
                        return requestAnimationFrame(poll);
                    }

                    res({ available: true, gpuTimeNs: resultValue(query) });
                };
                poll();
            });
        } catch {
            return { available: false };
        } finally {
            const loseCtx = gl.getExtension('WEBGL_lose_context');
            if (loseCtx) loseCtx.loseContext();
        }
    },

    getTextureCompressionSupport() {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return {};

        return Object.fromEntries(TEXTURE_EXT_NAMES.map((n) => [n, !!gl.getExtension(n)]));
    },

    // ------------------------------------------------------------------
    // Live RTT statistics (mean / jitter) sourced from <ping-eq> element
    // ------------------------------------------------------------------

    getLiveRttStats() {
        // The custom element is rendered with id="pingBars" on the page.
        const el = document.getElementById('pingBars');
        if (el && typeof el.getStats === 'function') {
            const stats = el.getStats();
            if (stats && stats.samples) {
                return {
                    meanMs: Math.round(stats.mean),
                    jitterMs: Math.round(stats.stddev),
                    minMs: Math.round(stats.min),
                    maxMs: Math.round(stats.max),
                    samples: stats.samples,
                };
            }
        }
        return {};
    }
};

// Enhanced UI handling
const ui = {

    displaySystemStatus(data) {
        const statusDiv = document.getElementById('systemStatus');
        const mem = data.browser.deviceMemory;

        // If the maximum bucket (8) is returned, append a '+' and note.
        let memLabel = 'n/a';
        if (typeof mem === 'number') {
            const capped = mem >= 8; // spec-mandated upper bucket
            memLabel = `${mem}${capped ? '+' : ''} GB${capped ? ' (browser-capped)' : ''}`;
        }

        // Show explanatory foot-note when browser returns the maximum bucket.
        const memoryNoteEl = document.getElementById('memoryNote');
        if (memoryNoteEl) {
            if (typeof mem === 'number' && mem >= 8) {
                memoryNoteEl.textContent = 'Browsers cap navigator.deviceMemory at 8 GB for privacy. Actual RAM may be higher.';
                memoryNoteEl.style.display = 'block';
            } else {
                memoryNoteEl.style.display = 'none';
            }
        }

        const items = [
            { label: 'Online', value: data.browser.onLine ? 'Yes' : 'No',        good: data.browser.onLine },
            { label: 'Cookies', value: data.browser.cookiesEnabled ? 'Enabled' : 'Disabled', good: data.browser.cookiesEnabled },
            { label: 'DNT',     value: data.browser.doNotTrack === "1" ? "Enabled" : "Disabled", good: true },
            { label: 'Memory',  value: memLabel, good: typeof mem === 'number' ? mem > 4 : true }
        ];

        // Network chip – prefer actively measured numbers if present
        if (data.network) {
            const measured = data.network.measured || {};
            const rttStats = data.network.rttStats || {};
            let effType = data.network.effectiveType?.toUpperCase() || '';
            if (!effType || effType === '4G') {
                effType = 'NET';
            }

            let rttVal;
            if (typeof rttStats.meanMs === 'number') {
                // Display mean ± jitter when live stats available
                rttVal = `${rttStats.meanMs} ± ${rttStats.jitterMs} ms`;
            } else if (typeof measured.latencyMs === 'number') {
                rttVal = `${Math.round(measured.latencyMs)} ms`;
            } else if (typeof data.network.rtt === 'number') {
                rttVal = `${data.network.rtt} ms`;
            } else {
                rttVal = 'n/a';
            }

            const bwVal = (typeof measured.bandwidthMbps === 'number')
                ? `${measured.bandwidthMbps.toFixed(1)} Mbps`
                : (typeof data.network.downlink === 'number' ? `${data.network.downlink} Mbps` : '');

            const label = `${effType}${bwVal ? ` • ${bwVal}` : ''} • ${rttVal}`;

            const latencyForGood = typeof rttStats.meanMs === 'number' ? rttStats.meanMs : measured.latencyMs;
            const good = (typeof latencyForGood === 'number' && latencyForGood < 150)
                || (typeof data.network.rtt === 'number' && data.network.rtt < 150);

            items.unshift({ label: 'Network', value: label, good, id: 'networkChip' });
        }

        // Battery chip (if available)
        if (data.battery && Object.keys(data.battery).length) {
            const batteryLabel = `${data.battery.level}%${data.battery.charging ? ' ⚡︎' : ''}`;
            items.push({ label: 'Battery', value: batteryLabel, good: data.battery.level > 20 });
        }

        statusDiv.innerHTML = items.map(item => {
            const dot = item.showDot === false ? '' : `<span class="status-indicator ${item.good ? 'status-good' : 'status-warning'}"></span>`;
            return `
                <div${item.id ? ` id="${item.id}"` : ''}>
                    ${dot}
                    <strong>${item.label}:</strong> ${item.value}
                </div>`;
        }).join('');

        // Pulse animation removed for network indicator (requested).
    },

    displayBrowserInfo(data) {
        const browserDiv = document.getElementById('browserInfo');
        browserDiv.innerHTML = `
            <div><strong>Platform:</strong> ${data.browser.platform}</div>
            <div><strong>User Agent:</strong> ${data.browser.userAgent}</div>
            <div><strong>Language:</strong> ${data.browser.language}</div>
            <div><strong>Screen Resolution:</strong> ${data.browser.screenResolution}</div>
            <div><strong>Hardware Concurrency:</strong> ${data.browser.hardwareConcurrency}</div>
            <div><strong>Colour Depth:</strong> ${data.browser.colorDepth} bit</div>
            <div><strong>Orientation:</strong> ${data.browser.orientation}</div>
        `;
    },

    displayPerformanceChart(data) {
        const resources = data.performance.resources;
        const ctx = document.getElementById('performanceChart').getContext('2d');
        
        const resourceData = resources.slice(0, 10).reduce((acc, resource) => {
            acc.labels.push(resource.name.split('/').pop());
            acc.durations.push(resource.duration);
            acc.sizes.push(resource.size / 1024); // Convert to KB
            return acc;
        }, { labels: [], durations: [], sizes: [] });

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: resourceData.labels,
                datasets: [{
                    label: 'Load Time (ms)',
                    data: resourceData.durations,
                    backgroundColor: cssVarAlpha('--c-series-1', 0.7),
                    borderColor: cssVar('--c-series-1'),
                    borderWidth: 1
                }, {
                    label: 'Size (KB)',
                    data: resourceData.sizes,
                    backgroundColor: cssVarAlpha('--c-series-2', 0.7),
                    borderColor: cssVar('--c-series-2'),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: cssVar('--c-grid')
                        },
                        ticks: {
                            color: cssVar('--win98-text')
                        }
                    },
                    x: {
                        grid: {
                            color: cssVar('--c-grid')
                        },
                        ticks: {
                            color: cssVar('--win98-text')
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: cssVar('--win98-text')
                        }
                    }
                }
            }
        });
    },

    // ------------------------------------------------------------------
    // HTTP Waterfall chart (horizontal stacked bar)
    // ------------------------------------------------------------------
    displayWaterfallChart(data) {
        const canvasEl = document.getElementById('waterfallChart');
        if (!canvasEl) return;

        const resources = data.performance.resources
            .filter(r => r.duration && r.name.startsWith('http'))
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 15); // top 15 by duration

        if (!resources.length) {
            canvasEl.parentElement.innerHTML = '<p>No resource timing entries available.</p>';
            return;
        }

        const labels = resources.map(r => r.name.split('/').pop().split('?')[0]);

        // Offset is startTime, Transfer is duration.
        const offsets = resources.map(r => Math.round(r.startTime));
        const transfers = resources.map(r => Math.round(r.duration));

        const ctx = canvasEl.getContext('2d');

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Start offset',
                        data: offsets,
                        backgroundColor: 'rgba(0,0,0,0)', // transparent
                        borderWidth: 0,
                        stack: 'combined',
                    },
                    {
                        label: 'Transfer',
                        data: transfers,
                        backgroundColor: cssVarAlpha('--c-series-1', 0.7),
                        borderColor: cssVar('--c-series-1'),
                        stack: 'combined',
                    },
                ],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                scales: {
                    x: {
                        stacked: true,
                        grid: { color: cssVar('--c-grid') },
                        ticks: { color: cssVar('--win98-text') },
                        title: { display: true, text: 'ms', color: cssVar('--win98-text') },
                    },
                    y: {
                        stacked: true,
                        grid: { color: cssVar('--c-grid') },
                        ticks: { color: cssVar('--win98-text') },
                    },
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            // Show nicer tooltip: offset + transfer
                            label(ctx) {
                                const label = ctx.dataset.label;
                                const value = ctx.parsed.x;
                                return `${label}: ${value} ms`;
                            },
                        },
                    },
                    legend: {
                        labels: { color: cssVar('--win98-text') },
                    },
                },
            },
        });
    },

    displayFingerprints(data) {
        // Canvas Fingerprint
        const canvasDiv = document.getElementById('canvasFingerprint');
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 50;
        canvasDiv.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0);
        img.src = data.fingerprints.canvas;

        // Fonts
        const fontsDiv = document.getElementById('fontFingerprint');
        fontsDiv.innerHTML = `
            <div class="grid">
                ${data.fingerprints.fonts.map(font => `
                    <div class="metric-card" style="font-family: ${font}">${font}</div>
                `).join('')}
            </div>
        `;

        // WebGL
        const webglDiv = document.getElementById('webglInfo');
        const webgl = data.fingerprints.webgl;
        webglDiv.innerHTML = `
            <div><strong>Vendor:</strong> ${webgl.vendor}</div>
            <div><strong>Renderer:</strong> ${webgl.renderer}</div>
            <div><strong>WebGL Version:</strong> ${webgl.webglVersion}</div>
        `;
    },

    // ------------------------------------------------------------------
    // Core Web Vitals cards
    // ------------------------------------------------------------------
    displayWebVitals(data) {
        const container = document.getElementById("coreVitals");
        if (!container) return;

        const vitals = data.performance.webVitals || {};

        const thresholds = {
            LCP: 2500, // Good ≤ 2.5s
            FID: 100,  // Good ≤ 100ms
            CLS: 0.1   // Good ≤ 0.1
        };

        container.innerHTML = Object.keys(thresholds)
            .map(name => {
                const value = vitals[name] ?? "–";

                let cls = "status-warning"; // default when not good
                if (value === "–") {
                    cls = "status-warning";
                } else if (value <= thresholds[name]) {
                    cls = "status-good";
                } else if (value <= thresholds[name] * 1.5) {
                    cls = "status-warning";
                } else {
                    cls = "status-error";
                }

                return `
                    <div class="metric-card">
                        <span class="status-indicator ${cls}"></span>
                        <strong>${name}</strong>: ${typeof value === "number" ? value.toFixed(2) : value}
                    </div>
                `;
            })
            .join("");
    },

    displayDebugInfo(data) {
        const debugOutput = document.getElementById('debugOutput');
        if (debugOutput) {
            debugOutput.textContent = JSON.stringify(data, null, 2);
        }
    },

    // ------------------------------------------------------------------
    // GPU Benchmarks summary card
    // ------------------------------------------------------------------
    displayGpuBenchmarks(data) {
        const container = document.getElementById('gpuBenchResults');
        if (!container || !data?.benchmarks) return;

        const { baselineFps, gpuTimer, textureSupport } = data.benchmarks;

        const fpsText = baselineFps?.available
            ? `${baselineFps.avgFps} fps (min ${baselineFps.minFps}, max ${baselineFps.maxFps})`
            : 'n/a';

        let timerText = 'unsupported';
        if (gpuTimer?.available) {
            timerText = gpuTimer.timeout
                ? 'timed out'
                : `${(gpuTimer.gpuTimeNs / 1e6).toFixed(2)} ms`;
        }

        const supportedFormats = textureSupport
            ? Object.entries(textureSupport)
                  .filter(([, v]) => v)
                  .map(([k]) => k.replace(/^(EXT|WEBGL)_compressed_texture_/, ''))
            : [];
        const texText = supportedFormats.length ? supportedFormats.join(', ') : 'none';

        container.innerHTML = `
            <div><strong>Baseline FPS:</strong> ${fpsText}</div>
            <div><strong>GPU Timer:</strong> ${timerText}</div>
            <div><strong>Compressed texture formats:</strong> ${texText}</div>`;
    },

    // ------------------------------------------------------------------
    // Live WebGL demo (rotating cube + FPS counter)
    // ------------------------------------------------------------------
    startGpuDemo() {
        // Ensure container and Three.js are available
        const container = document.getElementById('gpuDemoContainer');
        if (!container || typeof THREE === 'undefined') return;

        // Prepare renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        const dpr = window.devicePixelRatio || 1;
        const width = container.clientWidth;
        const height = container.clientHeight;
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height);
        renderer.setClearColor(0x202020);
        container.appendChild(renderer.domElement);

        // Scene setup
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        camera.position.z = 3;

        // Lighting
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(3, 5, 2);
        scene.add(dirLight);

        // Geometry – colourful cube
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({
            color: 0x44aaff,
            metalness: 0.1,
            roughness: 0.8,
        });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        // FPS tracking
        const fpsEl = document.getElementById('fpsValue');
        let frames = 0;
        let lastFpsTime = performance.now();

        const animate = (time) => {
            cube.rotation.x += 0.01;
            cube.rotation.y += 0.013;

            renderer.render(scene, camera);

            frames += 1;
            const delta = time - lastFpsTime;
            if (delta >= 1000) {
                const fps = (frames * 1000) / delta;
                if (fpsEl) fpsEl.textContent = fps.toFixed(0);
                frames = 0;
                lastFpsTime = time;
            }

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    },

    // ------------------------------------------------------------------
    // Live timeline initialisation – returns Chart instance
    // ------------------------------------------------------------------
    initializeTimeline() {
        const ctx = document.getElementById('timelineChart');
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'LCP (ms)',
                        data: [],
                        borderColor: cssVarAlpha('--c-accent-good', 0.8),
                        backgroundColor: cssVarAlpha('--c-accent-good', 0.3),
                        tension: 0.3,
                        yAxisID: 'y',
                    },
                    {
                        label: 'JS Errors',
                        data: [],
                        type: 'bar',
                        backgroundColor: cssVarAlpha('--c-series-2', 0.7),
                        yAxisID: 'y1',
                    },
                ],
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        position: 'left',
                        title: { display: true, text: 'LCP (ms)', color: cssVar('--win98-text') },
                        grid: { color: cssVar('--c-grid') },
                        ticks: { color: cssVar('--win98-text') },
                    },
                    y1: {
                        position: 'right',
                        title: { display: true, text: 'Error count', color: cssVar('--win98-text') },
                        grid: { drawOnChartArea: false },
                        min: 0,
                        ticks: { color: cssVar('--win98-text'), stepSize: 1 },
                    },
                    x: {
                        ticks: { color: cssVar('--win98-text') },
                        grid: { color: cssVar('--c-grid') },
                    },
                },
                plugins: {
                    legend: {
                        labels: { color: cssVar('--win98-text') },
                    },
                },
            },
        });
    },

    // ------------------------------------------------------------------
    // (ui object continues below – GPU benchmark helpers belong to collectors)
};

// Data submission
async function submitData(data) {
    try {
        const response = await fetch(CONFIG.ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        console.log(result.message);
    } catch (error) {
        console.error("Error sending data:", error);
    }
}



// Main collection function
async function collectData() {
    try {
    const errors = collectors.setupErrorTracking();

    const data = {
        timestamp: new Date().toISOString(),
        browser: collectors.getBrowserInfo(),
        performance: collectors.getPerformanceData(),
        fingerprints: {
            canvas: collectors.getCanvasFingerprint(),
            fonts: collectors.getFontFingerprint(),
            webgl: collectors.getWebGLInfo()
        },
        network: {
            ...collectors.getNetworkInfo(),
            rttStats: collectors.getLiveRttStats(),
        },
        battery: await collectors.getBatteryInfo(),
        errors
    };

    // ------------------------------------------------------------------
    // GPU micro-benchmarks (kick off async, update UI when done)
    // ------------------------------------------------------------------

    data.benchmarks = { baselineFps: { available: false }, gpuTimer: { available: false } };
    ui.displayGpuBenchmarks(data); // show immediate placeholder

    // Kick benchmarks in parallel but don't block main UI
    Promise.all([
        collectors.runBaselineFps(),
        collectors.runGpuTimerQuery(),
    ]).then(([fpsRes, gpuTimerRes]) => {
        data.benchmarks.baselineFps = fpsRes;
        data.benchmarks.gpuTimer = gpuTimerRes;
        data.benchmarks.textureSupport = collectors.getTextureCompressionSupport();
        ui.displayGpuBenchmarks(data);
    });

    // Active network measurement (does 2 HTTP calls; non-blocking for UX)
    try {
        data.network.measured = await collectors.measureNetworkPerformance();
    } catch {
        // best-effort – ignore failures
    }

    // Capture Core Web Vitals before rendering UI; they resolve quickly
    data.performance.webVitals = await collectors.getWebVitals();

    // Render UI sections (each guarded so a failure in one does not block others)
    const safeCall = (fn) => {
        try {
            fn();
        } catch (err) {
            console.error('Render error:', err);
        }
    };

    [
        ui.displaySystemStatus,
        ui.displayBrowserInfo,
        ui.displayPerformanceChart,
        ui.displayFingerprints,
        ui.displayWebVitals,
        ui.displayWaterfallChart,
        ui.displayDebugInfo,
        ui.displayGpuBenchmarks,
    ].forEach((fn) => safeCall(() => fn(data)));


    // Expose globally for live update helpers
    window.__currentDebugData = data;

    setTimeout(() => submitData(data), CONFIG.COLLECTION_DELAY);

    } catch (err) {
        console.error('collectData failed', err);
    }
}

// Initialize
window.onload = () => {
    collectData();
    initializeLiveUpdates();
    ui.startGpuDemo?.();

    // ------------------------------------------------------------------
    // Neon RTT sparkline ------------------------------------------------
    // ------------------------------------------------------------------

    const sparkCtx = document.getElementById('rttSpark')?.getContext('2d');
    let rttChart = null;

    // Helper to read CSS var and optionally add alpha for rgba.
    const css = (v, alpha=null) => {
        let c = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
        if (!c) return c;
        if (alpha == null) return c;
        // Convert #rrggbb → rgba(r,g,b,alpha)
        if (c.startsWith('#')) {
            const hex = c.slice(1);
            const bigint = parseInt(hex.length === 3 ? hex.split('').map(s=>s+s).join('') : hex, 16);
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;
            return `rgba(${r},${g},${b},${alpha})`;
        }
        // assume already css color; return with alpha not handled
        return c;
    };

    if (sparkCtx) {
        // Visible history buffer count – keep equal at all times so the line
        // scrolls smoothly without the initial "compression" effect where
        // points are re-laid out wider until the array reaches capacity.
        const CAP = 120; // 60 s @2 Hz

        rttChart = new Chart(sparkCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Latency',
                        data: [],
                        borderColor: css('--c-accent-info'),
                        backgroundColor: css('--c-accent-info', 0.15),
                        borderWidth: 1.5,
                        pointRadius: 0,
                        tension: 0.3,
                        fill: false,
                    },
                    {
                        label: 'Upper',
                        data: [],
                        borderColor: 'rgba(0,0,0,0)',
                        pointRadius: 0,
                        fill: false,
                    },
                    {
                        label: 'Lower',
                        data: [],
                        borderColor: 'rgba(0,0,0,0)',
                        pointRadius: 0,
                        fill: { target: 1 }, // fill area to the upper dataset
                        backgroundColor: css('--c-accent-neutral', 0.25),
                    },
                ],
            },
            options: {
                responsive: true,
                // maintainAspectRatio left as default (true) to avoid the
                // canvas blowing up in height on some layouts.
                animation: false,
                plugins: { legend: { display: false } },
                elements: { line: { tension: 0.3 } },
                scales: {
                    x: { display: false },
                    y: {
                        display: false,
                        min: 0,
                        max: 100,
                    },
                },
            },
        });

        // Prefill labels & datasets with nulls so we start at full capacity.
        const { labels, datasets } = rttChart.data;
        for (let i = 0; i < CAP; i += 1) {
            labels.push('');
            datasets.forEach((d) => d.data.push(null));
        }
    }

    // ------------------------------------------------------------------
    // Sampling interval – how frequently we poll <ping-eq> for new latency
    // values and push them into the spark-line chart.  halved from 1000 →
    // 500 ms (2 samples / s) to make the graph move twice as fast.
    // ------------------------------------------------------------------

    const SAMPLE_INTERVAL_MS = 500; // 2× faster than before

    // Push new RTT sample every SAMPLE_INTERVAL_MS for sparkline
    setInterval(() => {
        if (!rttChart) return;
        const el = document.getElementById('pingBars');
        if (!el || typeof el.getLastSample !== 'function') return;
        const sample = el.getLastSample();
        if (!Number.isFinite(sample) || sample <= 0) return;

        // Jitter uses current stddev from ring stats; fallback 0.
        const stats = el.getStats ? el.getStats() : {};
        const jitter = Number.isFinite(stats.stddev) ? stats.stddev : 0;

        const upper = sample + jitter;
        const lower = Math.max(0, sample - jitter);

        const tsLabel = new Date().toLocaleTimeString();
        const { labels, datasets } = rttChart.data;

        labels.push(tsLabel);
        datasets[0].data.push(sample);   // latency line
        datasets[1].data.push(upper);    // upper bound
        datasets[2].data.push(lower);    // lower bound

        // Maintain a constant CAP-sized buffer (prefilled on start) so the
        // X-spacing never changes – this avoids the visual "compression"
        // while the chart is still warming up.
        const maxPoints = 120; // must match CAP above
        if (labels.length > maxPoints) {
            labels.shift();
            datasets.forEach((d) => d.data.shift());
        }

        // Dynamic y-axis based on upper/lower values.
        // ------------------------------------------------------------------
        // Dynamic axis scaling – ignore the very first handful of samples so
        // an initial spike does not flatten subsequent values, *and* only
        // scale based on a sliding window of the most recent samples.  This
        // prevents a single early outlier from dominating the chart for a
        // full two-minute history.
        // ------------------------------------------------------------------

        const SAMPLES_PER_SEC = 1000 / SAMPLE_INTERVAL_MS; // 2 with 500 ms

        const WARMUP_SAMPLES = Math.round(5 * SAMPLES_PER_SEC);   // ignore first 5 s
        const WINDOW_SIZE    = Math.round(30 * SAMPLES_PER_SEC);  // 30 s window

        // Build a view onto the active data, excluding warm-up region and
        // limiting to the sliding window.
        const total = labels.length;
        const startIdx = Math.max(WARMUP_SAMPLES, total - WINDOW_SIZE);

        const windowUpper = datasets[1].data.slice(startIdx);
        const windowLower = datasets[2].data.slice(startIdx);
        const windowVals  = [...windowUpper, ...windowLower];

        // Fallback safety – if we do not have enough points yet, resort to
        // whatever values are present so the chart is not blank.
        const safeVals = windowVals.length ? windowVals : [...datasets[1].data, ...datasets[2].data];

        let maxVal = 100;
        let minVal = 0;

        if (safeVals.length) {
            maxVal = Math.max(...safeVals);
            minVal = Math.min(...safeVals);
        }

        const padding = 5; // ms top/bottom padding
        rttChart.options.scales.y.min = Math.max(0, Math.floor(minVal - padding));
        rttChart.options.scales.y.max = Math.ceil(maxVal + padding);

        rttChart.update('none');
    }, 1000);

    // ------------------------------------------------------------------
    // Periodically refresh the Network chip with live RTT / jitter stats.
    // ------------------------------------------------------------------

    setInterval(() => {
        const el = document.getElementById('pingBars');
        const base = window.__currentDebugData;
        if (!base || !el || typeof el.getStats !== 'function') return;

        const stats = el.getStats();
        if (!stats.samples) return;

        base.network = {
            ...collectors.getNetworkInfo(),
            rttStats: {
                meanMs: Math.round(stats.mean),
                jitterMs: Math.round(stats.stddev),
                minMs: Math.round(stats.min),
                maxMs: Math.round(stats.max),
                samples: stats.samples,
            },
            measured: base.network?.measured,
        };

        ui.displaySystemStatus(base);
    }, 2000); // every 2 seconds
};

// ------------------------------------------------------------------
// Socket.IO live updates
// ------------------------------------------------------------------

function initializeLiveUpdates() {
    // Ensure client library is present
    if (typeof io === 'undefined') return;

    // Reuse a single Socket.IO instance for the whole page so widgets can share it.
    const socket = window.sharedSocket || io(); // connects to same host/port automatically
    window.sharedSocket = socket;
    const timelineChart = ui.initializeTimeline();
    if (!timelineChart) return;

    socket.on('new_payload', payload => {
        if (!payload || !payload.timestamp) return;

        const label = new Date(payload.timestamp).toLocaleTimeString();

        timelineChart.data.labels.push(label);
        timelineChart.data.datasets[0].data.push(payload.lcp ?? null);
        timelineChart.data.datasets[1].data.push(payload.errorCount ?? 0);

        // keep last 50 points to avoid memory bloat
        const maxPoints = 50;
        if (timelineChart.data.labels.length > maxPoints) {
            timelineChart.data.labels.shift();
            timelineChart.data.datasets.forEach(ds => ds.data.shift());
        }

        timelineChart.update('none');
    });
}