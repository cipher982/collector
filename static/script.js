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
            screenResolution: `${window.screen.width}x${window.screen.height}`
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
            }))
        };
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
    }
};

// UI handling
const ui = {
    displayDebugInfo(data) {
        const debugOutput = document.getElementById("debugOutput");
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
function collectData() {
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
        errors
    };

    ui.displayDebugInfo(data);

    // Send data after delay to capture load errors
    setTimeout(() => submitData(data), CONFIG.COLLECTION_DELAY);
}

// Initialize
window.onload = collectData;