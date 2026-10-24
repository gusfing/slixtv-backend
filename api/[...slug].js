const https = require('https');

const TARGET_HOST = 'cast4k.cc';

module.exports = async (req, res) => {
  // 1. Enable CORS for all incoming requests (App, Web, External)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization, X-Api-Key, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. Clean Vercel internal query parameters ('slug', 'match') from path
  const urlObj = new URL(req.url, 'http://localhost');
  urlObj.searchParams.delete('slug');
  urlObj.searchParams.delete('match');
  const targetPath = urlObj.pathname + (urlObj.searchParams.toString() ? '?' + urlObj.searchParams.toString() : '');

  // 3. Prepare headers for proxying
  const forwardedHeaders = { ...req.headers };
  delete forwardedHeaders.host;
  forwardedHeaders['host'] = TARGET_HOST;
  forwardedHeaders['accept-encoding'] = 'identity'; // Avoid brotli/gzip double compression issues

  const options = {
    hostname: TARGET_HOST,
    port: 443,
    path: targetPath,
    method: req.method,
    headers: forwardedHeaders,
    timeout: 30000
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);

    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    }

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Vercel API Proxy Error]:', err.message);
    res.status(502).json({
      error: 'SlixTV Proxy Gateway Error',
      message: err.message
    });
  });

  // Forward request body if present
  if (req.body) {
    if (typeof req.body === 'object') {
      proxyReq.write(JSON.stringify(req.body));
    } else {
      proxyReq.write(req.body);
    }
  }

  req.pipe(proxyReq);
};
