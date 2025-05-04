## A. Immediate (0-2 weeks) – “Deeper capture, quick visuals”

    1. Core Web Vitals
        • Grab LCP, FID, CLS via the web-vitals npm micro-library (2 kB) and push them in the
existing JSON payload.
        • UI: gauge cards that light green/yellow/red vs Google good-thresholds.
    2. Network & device context
        • navigator.connection (RTT, downlink, effectiveType)
        • Battery status (level, charging)
        • Device orientation + screen colour-depth
        • Add status chips in the Overview tab (“4 G • 50 ms RTT • 78 % battery”).
    3. Mini waterfall chart
        • Re-use the resource entries you already collect.
        • Draw an HTTP waterfall with Chart.js “bar with offset” mode; hover shows DNS/TTFB/transfer
    durations.
    4. Dark-mode + theme switcher
        • PicoCSS supports data-theme attr; let users toggle “light / dark / synthwave”.

---------------------------------------------------------------------------------------------------
---

## B. Near-term (2-4 weeks) – “Rich interactive dashboard”

    1. Live timeline panel
        • Create a WebSocket endpoint (/ws) that echoes new events; update charts without refresh.
        • Stack-area chart of LCP over time; vertical markers for JS error spikes.
    2. Comparison mode
        • Add a second payload capture button (“snapshot”).
        • Side-by-side diff view that highlights changed fields between two captures (great to see
what fingerprint pieces stay stable).
    3. Feature-support matrix
        • Run modern-feature detection (e.g., WebGPU, AVIF, SharedArrayBuffer).
        • Visualise as coloured grid like “Can I use” but for the current browser.
    4. Resource-type treemap
        • Use d3-treemap to show where bytes go (JS vs CSS vs images) per page load.

---------------------------------------------------------------------------------------------------
---

## C. Mid-term (1-2 months) – “Exploratory / fun tech”

    1. 3-D globe of visits
        • Call a free geo-IP API client-side; plot dots via deck.gl on a WebGL globe.
    2. Audio & accelerometer fingerprints
        • AudioContext hash + sample microphone entropy (without recording audio).
        • Motion sensors (if on mobile) captured for a few seconds and plotted as sine waves.
    3. WebAssembly performance micro-bench
        • Compile a tiny WASM Fibonacci or compression routine, measure ops/s, add to payload.
        • Chart distribution of compute power across your devices.
    4. AR overlay
        • Using WebXR, render key metrics floating around the physical screen—pure demo value but
memorable.

---------------------------------------------------------------------------------------------------
---

## D. Stretch / R&D ideas

• Heat-map of CLS shifts: colour the DOM nodes that moved.
• Replay waterfall as an animation that “loads” the page again in UI.
• GPT-powered insight: send the latest JSON to OpenAI and have it summarise “Your page looks
sluggish on 3 G devices because …”.

---------------------------------------------------------------------------------------------------
---

## Key code changes distilled

• static/web-vitals.js  – import {getCLS, getFID, getLCP} and push to collectors.performance.
• static/script.js      – new collectors.getNetworkInfo(), getBatteryInfo().
• templates/index.html  – add tabs: “Vitals”, “Waterfall”, “Compare”.
• static/dashboard.js   – Chart.js live timeline, d3 treemap, diff viewer.