const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const replacement = `const wssIngest = new WebSocket.Server({ noServer: true, perMessageDeflate: false });

server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, \`http://\${request.headers.host}\`).pathname;
    
    if (pathname === '/video-stream') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else if (pathname === '/mjpeg-stream') {
        wssMjpeg.handleUpgrade(request, socket, head, (ws) => {
            wssMjpeg.emit('connection', ws, request);
        });
    } else if (pathname === '/host-ingest') {
        wssIngest.handleUpgrade(request, socket, head, (ws) => {
            ws.on('message', (data) => {
                // Relay incoming MJPEG frame from local bridge directly to mobile clients
                wssMjpeg.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 150000) {
                        client.send(data);
                    }
                });
            });
        });
    }`;

code = code.replace(
    /server\.on\('upgrade', \(request, socket, head\) => \{[\s\S]*?\}\);/,
    replacement + '\n});'
);

code = code.replace(
    /app\.post\('\/api\/start', \(req, res\) => \{/,
    `app.post('/api/start', (req, res) => {
    if (remoteHostSocket) {
        remoteHostSocket.emit('start-game');
        return res.json({ status: 'started_on_host' });
    }`
);

fs.writeFileSync('server.js', code);
console.log('Injected video bridge routes into server.js');
