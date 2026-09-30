const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
  /app\.post\('\/api\/press-ab', \(req, res\) => \{/,
  `app.post('/api/press-ab', (req, res) => {
    const slot = req.query.slot ? parseInt(req.query.slot) : 0;
    if (remoteHostSocket) {
        remoteHostSocket.emit('remote-action', { action: 'press-ab', slot });
        return res.json({ status: 'relayed', slot });
    }`
);

code = code.replace(
  /app\.all\('\/api\/press-button', \(req, res\) => \{/,
  `app.all('/api/press-button', (req, res) => {
    const btn = req.query.btn || req.body?.btn || 'A';
    const slot = req.query.slot ? parseInt(req.query.slot) : 0;
    if (remoteHostSocket) {
        remoteHostSocket.emit('remote-action', { action: 'press-button', btn, slot });
        return res.json({ status: 'relayed', btn, slot });
    }`
);

code = code.replace(
  /app\.all\('\/api\/swing', \(req, res\) => \{/,
  `app.all('/api/swing', (req, res) => {
    const slot = req.query.slot ? parseInt(req.query.slot) : 0;
    if (remoteHostSocket) {
        remoteHostSocket.emit('remote-action', { action: 'swing', slot });
        return res.json({ status: 'relayed', slot });
    }`
);

fs.writeFileSync('server.js', code);
console.log('Injected!');
