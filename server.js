const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4000;
const TARGET_HOST = process.env.TARGET_HOST || 'cast4k.cc';

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

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(reqUrl.pathname);

  // 1. Proxy API requests to backend
  if (pathname.startsWith('/api/')) {
    console.log(`[PROXY] ${req.method} ${pathname}`);
    
    const headers = { ...req.headers, host: TARGET_HOST };
    headers['accept-encoding'] = 'identity';

    const proxyReq = https.request({
      hostname: TARGET_HOST,
      port: 443,
      path: req.url,
      method: req.method,
      headers: headers
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error(`[PROXY ERROR] ${err.message}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy Gateway Error', message: err.message }));
    });

    req.pipe(proxyReq);
    return;
  }

  // 2. Serve static files
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }
  
  const filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    } else {
      // 3. SPA Fallback: Any unknown route (e.g. /dashboard, /login, /admin) -> index.html
      const indexPath = path.join(__dirname, 'index.html');
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
  console.log(` SlixTV Dashboard is running locally!`);
  console.log(` Local URL:   http://localhost:${PORT}`);
  console.log(` Dashboard:   http://localhost:${PORT}/dashboard`);
  console.log(` API Proxy:   https://${TARGET_HOST}/api/`);
  console.log(`=======================================================`);
});
