// Configuration
const CONFIG = {
    COLLECTION_DELAY: 3000,
    ENDPOINT: "/collect"
};

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
    getWebVitals() {
        return new Promise(resolve => {
            const vitals = {};

            // The global webVitals object is provided by the external script
            // included in index.html. Guard in case the CDN failed.
            if (typeof window.webVitals === "undefined") {
                resolve(vitals);
                return;
            }

            let remaining = 3;

            const done = () => {
                remaining -= 1;
                if (remaining === 0) {
                    resolve(vitals);
                }
            };

            window.webVitals.getLCP(metric => {
                vitals[metric.name] = metric.value;
                done();
            });
            window.webVitals.getFID(metric => {
                vitals[metric.name] = metric.value;
                done();
            });
            window.webVitals.getCLS(metric => {
                vitals[metric.name] = metric.value;
                done();
            });
        });
    }
};

// Enhanced UI handling
const ui = {
    initializeTabs() {
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(button.dataset.tab).classList.add('active');
            });
        });
    },

    displaySystemStatus(data) {
        const statusDiv = document.getElementById('systemStatus');
        const items = [
            { label: 'Online', value: data.browser.onLine ? 'Yes' : 'No', good: data.browser.onLine },
            { label: 'Cookies', value: data.browser.cookiesEnabled ? 'Enabled' : 'Disabled', good: data.browser.cookiesEnabled },
            { label: 'DNT', value: data.browser.doNotTrack === "1" ? "Enabled" : "Disabled", good: true },
            { label: 'Memory', value: `${data.browser.deviceMemory}GB`, good: data.browser.deviceMemory > 4 }
        ];

        // Network chip (if available)
        if (data.network && Object.keys(data.network).length) {
            const netLabel = `${data.network.effectiveType?.toUpperCase() || 'Net'} • ${data.network.rtt ?? '?'} ms RTT`;
            items.unshift({ label: 'Network', value: netLabel, good: data.network.rtt && data.network.rtt < 150 });
        }

        // Battery chip (if available)
        if (data.battery && Object.keys(data.battery).length) {
            const batteryLabel = `${data.battery.level}%${data.battery.charging ? ' ⚡︎' : ''}`;
            items.push({ label: 'Battery', value: batteryLabel, good: data.battery.level > 20 });
        }

        statusDiv.innerHTML = items.map(item => `
            <div>
                <span class="status-indicator ${item.good ? 'status-good' : 'status-warning'}"></span>
                <strong>${item.label}:</strong> ${item.value}
            </div>
        `).join('');
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
                    backgroundColor: 'rgba(45, 136, 255, 0.7)',
                    borderColor: 'rgba(45, 136, 255, 1)',
                    borderWidth: 1
                }, {
                    label: 'Size (KB)',
                    data: resourceData.sizes,
                    backgroundColor: 'rgba(255, 99, 132, 0.7)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#e0e0e0'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#e0e0e0'
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#e0e0e0'
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
                        backgroundColor: 'rgba(45, 136, 255, 0.7)',
                        borderColor: 'rgba(45,136,255,1)',
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
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#e0e0e0' },
                        title: { display: true, text: 'ms', color: '#e0e0e0' },
                    },
                    y: {
                        stacked: true,
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#e0e0e0' },
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
                        labels: { color: '#e0e0e0' },
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
    }
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
        network: collectors.getNetworkInfo(),
        battery: await collectors.getBatteryInfo(),
        errors
    };

    // Capture Core Web Vitals before rendering UI; they resolve quickly
    data.performance.webVitals = await collectors.getWebVitals();

    // Render UI sections
    ui.displaySystemStatus(data);
    ui.displayBrowserInfo(data);
    ui.displayPerformanceChart(data);
    ui.displayFingerprints(data);
    ui.displayWebVitals(data);
    ui.displayWaterfallChart(data);
    ui.displayDebugInfo(data);

    setTimeout(() => submitData(data), CONFIG.COLLECTION_DELAY);
}

// Initialize
window.onload = () => {
    ui.initializeTabs();
    collectData();
};