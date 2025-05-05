## A. Immediate (0-2 weeks) – “Deeper capture, quick visuals”

    1. Core Web Vitals  ✅ *COMPLETED 2025-05-04*
        • LCP, FID, CLS gathered via `web-vitals@3` CDN bundle.  
        • Added `performance.webVitals` to JSON payload.  
        • “Vitals” tab shows colour-coded cards (green / amber / red).

    2. Network & device context  ✅ *COMPLETED 2025-05-04*
        • navigator.connection (effectiveType, rtt, downlink, saveData) captured.  
        • Battery API (level %, charging) captured asynchronously.  
        • Screen orientation + colour-depth added to browser info.  
        • Overview tab now displays network/battery chips alongside existing status chips.
    3. Mini waterfall chart  ⬜ *TODO*
        • Re-use the resource entries you already collect.
        • Draw an HTTP waterfall with Chart.js “bar with offset” mode; hover shows DNS/TTFB/transfer
    durations.
    4. Dark-mode + theme switcher  ⬜ *TODO*
        • PicoCSS supports data-theme attr; let users toggle “light / dark / synthwave”.

---------------------------------------------------------------------------------------------------
---

## B. Near-term (2-4 weeks) – “Rich interactive dashboard”

    1. Live timeline panel  ✅ *COMPLETED 2025-05-04*
        • /collect now broadcasts minimal metrics over Socket.IO (fallback stub when dep missing).  
        • Front-end connects via socket.io and updates a live line+bar chart in the new “Timeline” tab:  
          – LCP plotted continuously, error spikes shown as red bars.  
          – Keeps rolling window of latest 50 points.
    2. ~Comparison mode~  ❌ *Removed*
        After discussion this feature was deemed low-value and has been removed from the roadmap.
        Effort will be redirected to more impactful items (feature-support matrix, treemap, alerting).
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

### Key code changes already landed

• Added `web-vitals` via CDN in `templates/index.html`; no extra build step needed.  
• `static/script.js`  
    – collectors.getWebVitals(), getNetworkInfo(), getBatteryInfo()  
    – UI helpers to render Vitals and chips.  
• `templates/index.html`  
    – New “Vitals” tab and script include.  

### Upcoming code to write

• Theme switcher – small toggler manipulating `document.documentElement.dataset.theme`.  
• Feature-support matrix (WebGPU, AVIF…) in a coloured grid.  
• Resource-type treemap using d3.treemap to visualise JS vs CSS vs Images bytes.  
• Optional alerting banner when Core Web Vitals slip beyond thresholds.