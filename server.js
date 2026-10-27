const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleStandaloneRequest } = require('./api/standalone_router');

const PORT = process.env.PORT || 4000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(reqUrl.pathname);

  // 1. Standalone SlixTV API (Zero external calls to Cast4K)
  if (pathname.startsWith('/api/')) {
    console.log(`[SLIXTV API] ${req.method} ${pathname}`);
    
    // Buffer body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const data = Buffer.concat(buffers).toString();
      try {
        req.body = JSON.parse(data);
      } catch (e) {
        req.body = data;
      }
    }

    const handled = handleStandaloneRequest(req, res);
    if (!handled) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Endpoint not found on SlixTV' }));
    }
    return;
  }

  // 2. Serve static files
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }
  
  let filePath = path.join(__dirname, 'public', safePath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, safePath);
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    } else {
      // 3. SPA Fallback: Any unknown route (e.g. /dashboard, /login, /admin) -> index.html
      const indexPath = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
        ? path.join(__dirname, 'public', 'index.html')
        : path.join(__dirname, 'index.html');
      fs.readFile(indexPath, (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('500 - Could not read index.html');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` SlixTV Standalone Server is running!`);
  console.log(` Local URL:    http://localhost:${PORT}`);
  console.log(` Dashboard:    http://localhost:${PORT}/dashboard`);
  console.log(` Status:       100% Autonomous (Zero Cast4K Connection)`);
  console.log(` Codes Active: 200 Activation Codes Ready`);
  console.log(`=======================================================`);
});
