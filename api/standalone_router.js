const fs = require('fs');
const path = require('path');

// Load database
let db;
try {
  const dbPath = path.join(__dirname, '..', 'data', 'db.json');
  if (fs.existsSync(dbPath)) {
    db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  }
} catch (e) {
  console.error('[SlixTV DB Error]:', e.message);
}

// Fallback in-memory DB if file not found
if (!db) {
  db = {
    user: {
      id: "d937da3c-9ddd-47e3-9409-90e12349f251",
      email: "davidcooper271995@gmail.com",
      firstName: "Adnan",
      lastName: "S4k",
      role: "RESELLER",
      status: "ACTIVE",
      twoFactorEnabled: false,
      emailVerified: true
    },
    codes: [],
    profiles: [{ id: "e824daae-73a5-444f-a500-2bcf50353ca0", name: "s4k" }],
    portals: [{ id: "portal-1", name: "Glo", url: "http://glotv.me", code: "8RB0WCK", status: "ACTIVE" }],
    dealers: [],
    quota: { total: 200, used: 12, available: 188 },
    credits: { balance: 0, creditUnit: "month" },
    ledger: [],
    parent: { name: "Jerry 4k" },
    settings: {
      sidebarColors: { "dashboard": "#1F80E0", "codes": "#1F80E0", "slixtv-pro": "#1F80E0", "portals": "#00D2FF" },
      sidebarDescriptions: { "codes": "Manage your activation codes and client devices" }
    },
    channelHealthReports: [],
    portalIssueReports: []
  };
}

function saveDb() {
  try {
    const dbPath = path.join(__dirname, '..', 'data', 'db.json');
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    // Read-only filesystem in Vercel lambdas is safe to ignore for writes
  }
}

function handleStandaloneRequest(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization, X-Api-Key, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead ? res.writeHead(200).end() : res.status(200).end();
    return true;
  }

  const urlObj = new URL(req.url, 'http://localhost');
  const pathname = urlObj.pathname;
  const searchParams = urlObj.searchParams;

  const sendJson = (statusCode, data) => {
    if (res.writeHead) {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } else {
      res.status(statusCode).json(data);
    }
  };

  // 1. AUTHENTICATION
  if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
    if (res.setHeader) {
      res.setHeader('Set-Cookie', 'refreshToken=slixtv-session-token; Path=/; HttpOnly; SameSite=Lax');
    }
    sendJson(200, {
      success: true,
      data: {
        user: db.user,
        accessToken: "slixtv-auth-token-verified"
      }
    });
    return true;
  }

  if (pathname === '/api/v1/auth/me') {
    sendJson(200, {
      success: true,
      data: db.user
    });
    return true;
  }

  if (pathname === '/api/v1/auth/refresh') {
    sendJson(200, {
      success: true,
      data: {
        accessToken: "slixtv-auth-token-refreshed"
      }
    });
    return true;
  }

  if (pathname === '/api/v1/auth/logout') {
    sendJson(200, {
      success: true,
      message: "Logged out from SlixTV successfully"
    });
    return true;
  }

  // 2. RESELLER DASHBOARD
  if (pathname === '/api/v1/reseller/dashboard') {
    const total = db.codes.length;
    const active = db.codes.filter(c => c.status === 'ACTIVE').length;
    const allocated = db.codes.filter(c => c.status === 'ASSIGNED').length;
    const available = Math.max(0, total - (active + allocated));

    const recent = db.codes
      .filter(c => c.resellerActivatedAt || c.customerName)
      .slice(0, 10);

    sendJson(200, {
      success: true,
      data: {
        stats: {
          total,
          allocated,
          activated: active,
          active,
          expired: 0,
          blocked: 0,
          available: Math.max(0, available)
        },
        credits: db.credits || { balance: 0, creditUnit: "month" },
        recentActivations: recent,
        expiringSoon: []
      }
    });
    return true;
  }

  // 3. RESELLER CODES (PAGINATION, SEARCH & FILTER)
  if (pathname === '/api/v1/reseller/codes') {
    if (req.method === 'GET') {
      const page = parseInt(searchParams.get('page') || '1', 10);
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const statusFilter = searchParams.get('status');
      const search = (searchParams.get('search') || searchParams.get('q') || '').toLowerCase().trim();

      let filtered = db.codes;

      if (statusFilter && statusFilter !== 'ALL') {
        filtered = filtered.filter(c => (c.status || '').toUpperCase() === statusFilter.toUpperCase());
      }

      if (search) {
        filtered = filtered.filter(c => 
          (c.code && c.code.toLowerCase().includes(search)) ||
          (c.customerName && c.customerName.toLowerCase().includes(search)) ||
          (c.customerPhone && c.customerPhone.includes(search)) ||
          (c.macAddress && c.macAddress.toLowerCase().includes(search))
        );
      }

      const total = filtered.length;
      const totalPages = Math.ceil(total / limit);
      const start = (page - 1) * limit;
      const paginated = filtered.slice(start, start + limit);

      sendJson(200, {
        success: true,
        data: paginated,
        pagination: {
          page,
          limit,
          total,
          totalPages: totalPages || 1
        }
      });
      return true;
    }

    // CREATE NEW CODES
    if (req.method === 'POST') {
      const newCodeStr = 'SLX' + Math.random().toString(36).substring(2, 9).toUpperCase();
      const newCodeObj = {
        id: "slx-" + Date.now(),
        code: newCodeStr,
        type: "RESELLER",
        status: "AVAILABLE",
        validityDays: 90,
        activationType: "TRIAL",
        customerName: null,
        customerPhone: null,
        createdAt: new Date().toISOString(),
        profile: db.profiles[0] || { name: "s4k" },
        canRenew: false,
        canExtend: true
      };
      db.codes.unshift(newCodeObj);
      saveDb();
      sendJson(201, { success: true, data: newCodeObj });
      return true;
    }
  }

  // 4. RESELLER CODE ACTIONS (UNLINK / EDIT)
  if (pathname.startsWith('/api/v1/reseller/codes/')) {
    const parts = pathname.split('/');
    const codeId = parts[5];
    const action = parts[6];

    const codeItem = db.codes.find(c => c.id === codeId || c.code === codeId);
    if (!codeItem) {
      sendJson(404, { success: false, message: "Code not found" });
      return true;
    }

    if (action === 'unlink' || req.method === 'DELETE') {
      codeItem.macAddress = null;
      codeItem.referenceMac = null;
      codeItem.status = 'AVAILABLE';
      saveDb();
      sendJson(200, { success: true, message: "Device unlinked successfully", data: codeItem });
      return true;
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = req.body || {};
      if (body.customerName !== undefined) codeItem.customerName = body.customerName;
      if (body.customerPhone !== undefined) codeItem.customerPhone = body.customerPhone;
      if (body.status !== undefined) codeItem.status = body.status;
      saveDb();
      sendJson(200, { success: true, data: codeItem });
      return true;
    }
  }

  // 5. PROFILES & PORTALS
  if (pathname === '/api/v1/reseller/profiles' || pathname === '/api/v1/hierarchy/profiles') {
    sendJson(200, { success: true, data: db.profiles });
    return true;
  }

  if (pathname === '/api/v1/hierarchy/portals') {
    sendJson(200, { success: true, data: db.portals });
    return true;
  }

  // 6. HIERARCHY
  if (pathname === '/api/v1/hierarchy/dashboard') {
    sendJson(200, { success: true, data: db.hierarchyDashboard });
    return true;
  }

  if (pathname === '/api/v1/hierarchy/my-parent') {
    sendJson(200, { success: true, data: db.parent });
    return true;
  }

  if (pathname === '/api/v1/hierarchy/dealers') {
    sendJson(200, { success: true, data: db.dealers, meta: { total: db.dealers.length } });
    return true;
  }

  if (pathname === '/api/v1/hierarchy/quota') {
    sendJson(200, { success: true, data: db.quota });
    return true;
  }

  if (pathname === '/api/v1/hierarchy/credits') {
    sendJson(200, { success: true, data: db.credits });
    return true;
  }

  if (pathname === '/api/v1/hierarchy/credits/ledger') {
    sendJson(200, { success: true, data: db.ledger });
    return true;
  }

  // 7. SETTINGS & BRANDING
  if (pathname === '/api/v1/admin/settings/sidebar-colors') {
    sendJson(200, {
      success: true,
      data: {
        "dashboard": "#1F80E0",
        "codes": "#1F80E0",
        "slixtv-pro": "#1F80E0",
        "portals": "#00D2FF"
      }
    });
    return true;
  }

  if (pathname === '/api/v1/admin/settings/sidebar-descriptions' || pathname === '/api/v1/reseller/settings') {
    sendJson(200, { success: true, data: db.settings });
    return true;
  }

  if (pathname === '/api/v1/partner/requests/badge') {
    sendJson(200, { success: true, data: { count: 0 } });
    return true;
  }

  if (pathname === '/api/v1/partner/requests' || pathname === '/api/v1/announcements/web') {
    sendJson(200, { success: true, data: [] });
    return true;
  }

  if (pathname === '/api/v1/admin/client-logs') {
    sendJson(200, { success: true });
    return true;
  }

  // 8. APP MOBILE TELEMETRY (CONNECTED DIRECTLY TO SLIXTV APP)
  if (pathname === '/api/v1/mobile/channel-health' && req.method === 'POST') {
    const report = req.body || {};
    report.receivedAt = new Date().toISOString();
    db.channelHealthReports.unshift(report);
    if (db.channelHealthReports.length > 200) db.channelHealthReports.pop();
    saveDb();
    sendJson(200, { success: true, message: "Channel health received by SlixTV server" });
    return true;
  }

  if (pathname === '/api/v1/mobile/portal-issues' && req.method === 'POST') {
    const issue = req.body || {};
    issue.receivedAt = new Date().toISOString();
    db.portalIssueReports.unshift(issue);
    if (db.portalIssueReports.length > 200) db.portalIssueReports.pop();
    saveDb();
    sendJson(200, { success: true, message: "Portal issue logged by SlixTV server" });
    return true;
  }

  if (pathname === '/api/v1/app/check-update') {
    sendJson(200, {
      success: true,
      data: {
        updateRequired: false,
        forceUpdate: false,
        latestVersion: "2.6.5",
        downloadUrl: "https://slixtv-backend.vercel.app/SlixTV.apk",
        message: "SlixTV is running the latest version"
      }
    });
    return true;
  }

  // Unhandled API Route -> clean 404
  if (pathname.startsWith('/api/')) {
    sendJson(404, {
      success: false,
      message: `Endpoint ${pathname} not found on SlixTV standalone server`,
      error: { code: 'ENDPOINT_NOT_FOUND' }
    });
    return true;
  }

  return false;
}

module.exports = {
  handleStandaloneRequest,
  db
};
