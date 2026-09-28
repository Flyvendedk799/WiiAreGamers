const https = require('https');
const WebSocket = require('ws');

console.log('Sending start stream command...');
const req = https.request('https://wii.mast3kmedia.dk/api/start', { method: 'POST' }, (res) => {
    console.log('Stream started. Connecting to wss://wii.mast3kmedia.dk/mjpeg-stream...');
    const ws = new WebSocket('wss://wii.mast3kmedia.dk/mjpeg-stream');

    let frameCount = 0;
    let lastFrameTime = 0;
    const intervals = [];

    ws.on('open', () => {
        console.log('Connected! Analyzing frame pacing for 5 seconds...');
    });

    ws.on('message', (data) => {
        const now = Date.now();
        frameCount++;

        if (lastFrameTime > 0) {
            const interval = now - lastFrameTime;
            intervals.push(interval);
        }
        lastFrameTime = now;

        if (frameCount === 150) { // 5 seconds at 30fps
            ws.close();
            analyzeResults(intervals, frameCount);
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket Error:', err.message);
    });
});

req.on('error', (e) => {
    console.error('HTTP Request Error:', e);
});
req.end();

function analyzeResults(intervals, frameCount) {
    if (intervals.length === 0) {
        console.log('No frames received!');
        return;
    }

    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const max = Math.max(...intervals);
    const min = Math.min(...intervals);
    
    const variance = intervals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    console.log(`\n--- Stream Diagnostic Results ---`);
    console.log(`Total Frames: ${frameCount}`);
    console.log(`Average Framerate: ${(1000 / avg).toFixed(2)} FPS`);
    console.log(`Target Pacing (30 FPS): ~33.3 ms`);
    console.log(`Average Pacing: ${avg.toFixed(2)} ms`);
    console.log(`Worst Stutter (Max interval): ${max} ms`);
    console.log(`Fastest Interval (Min): ${min} ms`);
    console.log(`Jitter (Std Dev): ${stdDev.toFixed(2)} ms`);
    
    if (max > 100) {
        console.log(`\n❌ FAILED: Massive stutter detected! A frame took ${max}ms to arrive.`);
    } else if (stdDev > 20) {
        console.log(`\n❌ FAILED: High jitter detected! Stream is unstable.`);
    } else {
        console.log(`\n✅ PASSED: Stream is perfectly smooth.`);
    }
}
