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

async function handleStandaloneRequest(req, res) {
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
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      res.status(statusCode).json(data);
    } else if (res.writeHead) {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } else {
      res.statusCode = statusCode;
      if (res.setHeader) res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    }
  };

  // TEST UPSTREAM FROM VERCEL
  if (pathname === '/api/v1/test-upstream') {
    try {
      const mac = searchParams.get('mac') || '00:1E:C2:89:37:1A';
      const r = await fetch('https://tv.stream4k.ac/stalker_portal/server/load.php?type=stb&action=handshake&token=&mac=' + encodeURIComponent(mac), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3'
        }
      });
      const txt = await r.text();
      sendJson(200, { status: r.status, body: txt });
    } catch(err) {
      sendJson(500, { error: err.message });
    }
    return true;
  }

  // 0. SLIXTV APP INTEGRATION (PROFILE LOADER & DEVICE VERIFICATION)
  if (pathname === '/api.php' || pathname === '/api/api.php' || pathname.endsWith('/api.php')) {
    const rawParam = searchParams.get('profile') || searchParams.get('p') || '';
    const profileName = rawParam.toLowerCase().trim();

    let prof = null;
    if (profileName) {
      prof = (db.profiles || []).find(p => (p.name || '').toLowerCase() === profileName || p.id === profileName) ||
             (db.hierarchyProfiles || []).find(p => (p.name || '').toLowerCase() === profileName || p.id === profileName);
      
      if (!prof) {
        prof = (db.profiles || []).find(p => (p.name || '').toLowerCase().includes(profileName)) ||
               (db.hierarchyProfiles || []).find(p => (p.name || '').toLowerCase().includes(profileName));
      }
    }

    if (!prof && (db.profiles || []).length > 0) {
      prof = db.profiles[0];
    }

    if (prof) {
      let rawPortals = (prof.portals && prof.portals.length) ? prof.portals : [];
      if (!rawPortals.length && Array.isArray(prof.profilePortals)) {
        rawPortals = prof.profilePortals.map(pp => ({
          id: pp.portalId || (pp.portal && pp.portal.id),
          name: (pp.portal && pp.portal.name) || pp.name,
          url: (pp.portal && pp.portal.url) || pp.url,
          portalCode: (pp.portal && pp.portal.portalCode) || pp.portalCode,
          isDefault: pp.isDefault
        }));
      }
      if (!rawPortals.length) rawPortals = db.portals || [];

      const result = rawPortals.map((p, idx) => {
        const portalId = p.id || p.portalId;
        const livePortal = (db.portals || []).find(dp => (portalId && dp.id === portalId) || (dp.name && p.name && dp.name.toLowerCase() === p.name.toLowerCase()));
        let effectiveUrl = (livePortal && livePortal.url) ? livePortal.url : (p.url || 'http://play.suntv.biz');
        // Fix legacy dead URLs
        if (effectiveUrl.includes('stream4k.me')) effectiveUrl = 'https://tv.stream4k.ac';
        if (effectiveUrl.includes('glotv.me')) effectiveUrl = 'http://play.suntv.biz';
        const isDef = p.isDefault === true || (!rawPortals.some(x => x.isDefault === true) && idx === 0);
        return {
          name: (livePortal && livePortal.name) || p.name || prof.name,
          code: (livePortal && livePortal.portalCode) || p.portalCode || p.code || 'SLIXTV',
          url: effectiveUrl,
          is_default: isDef
        };
      });
      sendJson(200, result);
      return true;
    }

    const fallback = (db.portals || []).filter(p => p.isActive !== false).map(p => {
      let url = p.url;
      if (url.includes('stream4k.me')) url = 'https://tv.stream4k.ac';
      if (url.includes('glotv.me')) url = 'http://play.suntv.biz';
      return {
        name: p.name,
        code: p.portalCode || 'SLIXTV',
        url: url,
        is_default: true
      };
    });
    sendJson(200, fallback);
    return true;
  }

  if (pathname.includes('check-device.php')) {
    const mac = (searchParams.get('mac_address') || searchParams.get('mac') || '').toUpperCase().trim();
    const codeMatch = (db.codes || []).find(c => 
      (c.referenceMac && c.referenceMac.toUpperCase() === mac) ||
      (c.macAddress && c.macAddress.toUpperCase() === mac)
    );

    // If it's a legacy MAC (00:1E:99:...) and NOT explicitly registered in db.codes, return false so the Android app auto-migrates to 00:1E:C2:...
    if (mac.startsWith('00:1E:99:') && !codeMatch) {
      sendJson(200, {
        status: "success",
        isRegistered: false,
        message: "Legacy MAC not registered, proceed with modern migration"
      });
      return true;
    }

    sendJson(200, {
      status: "success",
      isRegistered: true,
      message: "Device is registered and active"
    });
    return true;
  }

  if (pathname.includes('device_api.php')) {
    const action = searchParams.get('action') || (req.body && req.body.action) || '';
    if (action === 'get_share_counts') {
      sendJson(200, {
        status: "success",
        data: {
          current_shares: 1,
          max_shares: 5,
          is_allowed: true
        }
      });
      return true;
    }
    sendJson(200, {
      status: "success",
      message: "Operation completed successfully"
    });
    return true;
  }

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

  // 4. RESELLER & ADMIN CODE ACTIONS
  if (pathname.includes('/codes/') && !pathname.endsWith('/codes')) {
    const parts = pathname.split('/');
    const codesIdx = parts.indexOf('codes');
    const codeId = codesIdx !== -1 ? parts[codesIdx + 1] : parts[5];
    const action = codesIdx !== -1 ? (parts[codesIdx + 2] || '') : (parts[6] || '');

    const codeItem = db.codes.find(c => c.id === codeId || c.code === codeId);
    if (!codeItem) {
      sendJson(404, { success: false, message: "Code not found" });
      return true;
    }

    const body = req.body || {};

    // ACTIVATE CODE
    if (action === 'activate' && req.method === 'POST') {
      const now = new Date();
      const activationType = body.activationType || 'FULL';
      const months = parseInt(body.months || (activationType === 'TRIAL' ? '3' : '12'), 10);
      
      const expiry = new Date(now);
      expiry.setDate(expiry.getDate() + (activationType === 'TRIAL' ? (codeItem.validityDays || 90) : months * 30));

      codeItem.customerName = body.customerName || codeItem.customerName || "Customer";
      codeItem.customerPhone = body.customerPhone || codeItem.customerPhone || "";
      codeItem.activationType = activationType;
      codeItem.validityDays = activationType === 'TRIAL' ? (codeItem.validityDays || 90) : months * 30;
      codeItem.resellerActivatedAt = now.toISOString();
      codeItem.activatedAt = now.toISOString();
      codeItem.expiresAt = expiry.toISOString();
      
      if (body.referenceMac) {
        codeItem.referenceMac = body.referenceMac.trim();
        codeItem.macAddress = body.referenceMac.trim().toLowerCase();
        codeItem.status = 'ACTIVE';
      } else {
        codeItem.status = 'ASSIGNED';
      }

      if (body.profileId) {
        const foundProf = db.profiles.find(p => p.id === body.profileId);
        codeItem.profile = foundProf || { id: body.profileId, name: 's4k' };
      }

      codeItem.canRenew = true;
      codeItem.canExtend = true;
      saveDb();

      sendJson(200, {
        success: true,
        message: "Code activated successfully",
        data: codeItem
      });
      return true;
    }

    // RENEW CODE
    if (action === 'renew' && req.method === 'POST') {
      const months = parseInt(body.months || '12', 10);
      const curExpiry = codeItem.expiresAt ? new Date(codeItem.expiresAt) : new Date();
      curExpiry.setDate(curExpiry.getDate() + (months * 30));
      codeItem.expiresAt = curExpiry.toISOString();
      codeItem.status = 'ACTIVE';
      codeItem.canRenew = true;
      saveDb();
      sendJson(200, { success: true, message: "Code renewed successfully", data: codeItem });
      return true;
    }

    // EXTEND CODE
    if (action === 'extend' && req.method === 'POST') {
      const months = parseInt(body.months || '1', 10);
      const curExpiry = codeItem.expiresAt ? new Date(codeItem.expiresAt) : new Date();
      curExpiry.setDate(curExpiry.getDate() + (months * 30));
      codeItem.expiresAt = curExpiry.toISOString();
      saveDb();
      sendJson(200, { success: true, message: "Code extended successfully", data: codeItem });
      return true;
    }

    // CHANGE PROFILE
    if (action === 'profile' && (req.method === 'PATCH' || req.method === 'POST')) {
      const foundProf = db.profiles.find(p => p.id === body.profileId);
      codeItem.profile = foundProf || { id: body.profileId, name: 's4k' };
      saveDb();
      sendJson(200, { success: true, message: "Profile updated successfully", data: codeItem });
      return true;
    }

    // UNLINK DEVICE
    if (action === 'unlink' || action === 'request-unlink' || action === 'unlink-device' || req.method === 'DELETE') {
      codeItem.macAddress = null;
      codeItem.referenceMac = null;
      codeItem.status = 'AVAILABLE';
      saveDb();
      sendJson(200, { success: true, message: "Device unlinked successfully", data: codeItem });
      return true;
    }

    // RESET DEVICE
    if (action === 'reset-device') {
      codeItem.macAddress = null;
      codeItem.referenceMac = null;
      codeItem.customerName = null;
      codeItem.customerPhone = null;
      codeItem.activatedAt = null;
      codeItem.expiresAt = null;
      codeItem.status = 'AVAILABLE';
      saveDb();
      sendJson(200, { success: true, message: "Code fully reset", data: codeItem });
      return true;
    }

    // BLOCK / UNBLOCK / EXPIRE
    if (action === 'block') {
      codeItem.status = 'BLOCKED';
      saveDb();
      sendJson(200, { success: true, message: "Code blocked", data: codeItem });
      return true;
    }

    if (action === 'unblock') {
      codeItem.status = 'ACTIVE';
      saveDb();
      sendJson(200, { success: true, message: "Code unblocked", data: codeItem });
      return true;
    }

    if (action === 'expire') {
      codeItem.status = 'EXPIRED';
      saveDb();
      sendJson(200, { success: true, message: "Code expired", data: codeItem });
      return true;
    }

    // GET SINGLE CODE
    if (!action && req.method === 'GET') {
      sendJson(200, { success: true, data: codeItem });
      return true;
    }

    // GENERAL EDIT (PATCH / PUT)
    if (req.method === 'PATCH' || req.method === 'PUT') {
      if (body.customerName !== undefined) codeItem.customerName = body.customerName;
      if (body.customerPhone !== undefined) codeItem.customerPhone = body.customerPhone;
      if (body.status !== undefined) codeItem.status = body.status;
      if (body.referenceMac !== undefined) {
        codeItem.referenceMac = body.referenceMac;
        codeItem.macAddress = body.referenceMac ? body.referenceMac.toLowerCase() : null;
      }
      saveDb();
      sendJson(200, { success: true, data: codeItem });
      return true;
    }
  }

  // 5. PROFILES & PORTALS
  // Helper to ensure profile and portal structures are completely synced and compliant with dashboard UI
  function syncProfilePortals(prof) {
    if (!prof) return;
    prof.source = 'own'; // Must be 'own' so reseller can edit and delete any profile
    prof.isActive = prof.isActive !== false;

    let sourcePortals = [];
    if (Array.isArray(prof.portals) && prof.portals.length) {
      sourcePortals = prof.portals;
    } else if (Array.isArray(prof.profilePortals) && prof.profilePortals.length) {
      sourcePortals = prof.profilePortals.map(pp => ({
        portalId: pp.portalId || (pp.portal && pp.portal.id),
        id: pp.portalId || (pp.portal && pp.portal.id),
        name: (pp.portal && pp.portal.name) || pp.name,
        url: (pp.portal && pp.portal.url) || pp.url,
        portalCode: (pp.portal && pp.portal.portalCode) || pp.portalCode,
        isDefault: pp.isDefault
      }));
    }

    const cleanPortals = [];
    const cleanProfilePortals = [];

    sourcePortals.forEach((item, idx) => {
      const portalId = item.portalId || item.id;
      if (!portalId) return;

      const live = (db.portals || []).find(p => p.id === portalId) ||
                   (db.portals || []).find(p => p.name && item.name && p.name.toLowerCase() === item.name.toLowerCase()) ||
                   {};

      const isDefault = item.isDefault !== undefined ? item.isDefault : (idx === 0);
      let portalUrl = live.url || item.url || '';
      if (portalUrl.includes('glotv.me')) portalUrl = 'http://play.suntv.biz';
      if (portalUrl.includes('stream4k.me')) portalUrl = 'https://tv.stream4k.ac';

      const pObj = {
        id: portalId,
        name: live.name || item.name || 'Portal',
        url: portalUrl,
        portalCode: live.portalCode || item.portalCode || item.code || 'SLIXTV',
        isActive: live.isActive !== false,
        isDefault: isDefault
      };

      cleanPortals.push(pObj);
      cleanProfilePortals.push({
        id: `pp-${prof.id}-${portalId}`,
        profileId: prof.id,
        portalId: portalId,
        isDefault: isDefault,
        portal: {
          id: portalId,
          name: pObj.name,
          url: pObj.url,
          portalCode: pObj.portalCode,
          isActive: pObj.isActive
        }
      });
    });

    prof.portals = cleanPortals;
    prof.profilePortals = cleanProfilePortals;
    const def = cleanPortals.find(p => p.isDefault) || cleanPortals[0];
    prof.defaultPortal = def ? { id: def.id, name: def.name } : null;
  }

  function syncAllProfiles() {
    (db.profiles || []).forEach(syncProfilePortals);
    (db.hierarchyProfiles || []).forEach(syncProfilePortals);
  }

  // 5A. PORTALS (LIST & CREATE)
  if (pathname === '/api/v1/hierarchy/portals' || pathname === '/api/v1/admin/portals' || pathname === '/api/v1/admin/portals/active') {
    if (req.method === 'POST') {
      const body = req.body || {};
      const newPortal = {
        id: (body.id) || (require('crypto').randomUUID ? require('crypto').randomUUID() : ('portal-' + Date.now())),
        name: (body.name || 'New Portal').trim(),
        url: (body.url || '').trim(),
        portalCode: body.portalCode || Math.random().toString(36).substring(2, 9).toUpperCase(),
        isActive: body.isActive !== false,
        ownerId: "d937da3c-9ddd-47e3-9409-90e12349f251",
        createdById: "d937da3c-9ddd-47e3-9409-90e12349f251",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        usedByProfiles: []
      };
      db.portals.push(newPortal);
      syncAllProfiles();
      saveDb();
      sendJson(200, { success: true, data: newPortal });
      return true;
    }

    sendJson(200, {
      success: true,
      data: db.portals || [],
      pagination: { page: 1, limit: 50, total: (db.portals || []).length, totalPages: 1 }
    });
    return true;
  }

  // 5B. PORTALS BY ID (GET, UPDATE, TOGGLE, DELETE, REPLACEMENTS)
  if (pathname.startsWith('/api/v1/hierarchy/portals/') || pathname.startsWith('/api/v1/admin/portals/')) {
    const portalPrefix = pathname.startsWith('/api/v1/hierarchy/portals/') 
      ? '/api/v1/hierarchy/portals/' 
      : '/api/v1/admin/portals/';
    const sub = pathname.slice(portalPrefix.length);
    const parts = sub.split('/');
    const portalId = parts[0];
    const subAction = parts[1];

    let portal = (db.portals || []).find(p => p.id === portalId);
    if (!portal) {
      for (const prof of (db.profiles || [])) {
        if (prof.portals) {
          const found = prof.portals.find(p => p.id === portalId);
          if (found) {
            portal = {
              id: found.id,
              name: found.name || 'Portal',
              url: found.url || '',
              portalCode: found.portalCode || '',
              isActive: found.isActive !== false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              deletedAt: null,
              usedByProfiles: [prof.name]
            };
            db.portals.push(portal);
            saveDb();
            break;
          }
        }
      }
    }

    if (subAction === 'replacements') {
      if (req.method === 'GET') {
        sendJson(200, { success: true, data: [] });
        return true;
      }
      if (req.method === 'POST') {
        sendJson(200, { success: true, data: req.body || {} });
        return true;
      }
      sendJson(200, { success: true });
      return true;
    }

    if (subAction === 'toggle-status' && (req.method === 'PATCH' || req.method === 'POST')) {
      if (portal) {
        portal.isActive = !portal.isActive;
        portal.updatedAt = new Date().toISOString();
        syncAllProfiles();
        saveDb();
        sendJson(200, { success: true, data: portal });
      } else {
        sendJson(404, { success: false, message: 'Portal not found' });
      }
      return true;
    }

    if (req.method === 'GET') {
      if (portal) {
        sendJson(200, { success: true, data: portal });
      } else {
        sendJson(404, { success: false, message: 'Portal not found' });
      }
      return true;
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      if (portal) {
        Object.assign(portal, req.body || {});
        portal.updatedAt = new Date().toISOString();
        syncAllProfiles();
        saveDb();
        sendJson(200, { success: true, data: portal });
      } else {
        sendJson(404, { success: false, message: 'Portal not found' });
      }
      return true;
    }

    if (req.method === 'DELETE') {
      db.portals = (db.portals || []).filter(p => p.id !== portalId);
      syncAllProfiles();
      saveDb();
      sendJson(200, { success: true, message: 'Portal deleted successfully' });
      return true;
    }
  }

  // 5C. PROFILES (LIST & CREATE)
  if (pathname === '/api/v1/hierarchy/profiles' || pathname === '/api/v1/reseller/profiles' || pathname === '/api/v1/admin/profiles' || pathname === '/api/v1/admin/profiles/active') {
    syncAllProfiles();
    const list = (db.hierarchyProfiles && db.hierarchyProfiles.length) ? db.hierarchyProfiles : (db.profiles || []);
    
    if (req.method === 'POST') {
      const body = req.body || {};
      const newId = (body.id) || (require('crypto').randomUUID ? require('crypto').randomUUID() : ('prof-' + Date.now()));
      const newProfile = {
        id: newId,
        name: (body.name || 'New Profile').trim(),
        description: body.description || '',
        isActive: body.isActive !== false,
        source: 'own',
        ownerId: "d937da3c-9ddd-47e3-9409-90e12349f251",
        createdById: "d937da3c-9ddd-47e3-9409-90e12349f251",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        portals: body.portals || [],
        profilePortals: []
      };
      syncProfilePortals(newProfile);
      
      // Update both profiles and hierarchyProfiles
      if (!db.profiles) db.profiles = [];
      if (!db.hierarchyProfiles) db.hierarchyProfiles = [];
      db.profiles.push(newProfile);
      db.hierarchyProfiles.push(newProfile);
      saveDb();
      sendJson(200, { success: true, data: newProfile });
      return true;
    }

    sendJson(200, {
      success: true,
      data: list,
      pagination: { page: 1, limit: 50, total: list.length, totalPages: 1 }
    });
    return true;
  }

  // 5D. PROFILES BY ID (GET, UPDATE, TOGGLE, DELETE)
  if (pathname.startsWith('/api/v1/hierarchy/profiles/') || pathname.startsWith('/api/v1/admin/profiles/')) {
    const profPrefix = pathname.startsWith('/api/v1/hierarchy/profiles/') 
      ? '/api/v1/hierarchy/profiles/' 
      : '/api/v1/admin/profiles/';
    const sub = pathname.slice(profPrefix.length);
    const parts = sub.split('/');
    const profileId = parts[0];
    const subAction = parts[1];

    let profile = (db.profiles || []).find(p => p.id === profileId) || 
                  (db.hierarchyProfiles || []).find(p => p.id === profileId);

    if (profile) {
      syncProfilePortals(profile);
    }

    if (subAction === 'toggle-status' && (req.method === 'PATCH' || req.method === 'POST')) {
      if (profile) {
        profile.isActive = !profile.isActive;
        profile.updatedAt = new Date().toISOString();
        const other = (db.hierarchyProfiles || []).find(p => p.id === profileId);
        if (other && other !== profile) Object.assign(other, profile);
        saveDb();
        sendJson(200, { success: true, data: profile });
      } else {
        sendJson(404, { success: false, message: 'Profile not found' });
      }
      return true;
    }

    if (req.method === 'GET') {
      if (profile) {
        sendJson(200, { success: true, data: profile });
      } else {
        sendJson(404, { success: false, message: 'Profile not found' });
      }
      return true;
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      if (profile) {
        const body = req.body || {};
        const oldName = profile.name;
        if (body.name !== undefined) profile.name = body.name.trim();
        if (body.description !== undefined) profile.description = body.description;
        if (body.isActive !== undefined) profile.isActive = body.isActive;
        if (body.portals !== undefined) profile.portals = body.portals;

        syncProfilePortals(profile);
        profile.updatedAt = new Date().toISOString();

        // If profile name changed, update codes that used this profile
        if (oldName && profile.name && oldName !== profile.name) {
          (db.codes || []).forEach(c => {
            if (c.profile && (c.profile.id === profile.id || c.profile.name === oldName)) {
              c.profile.name = profile.name;
              c.profile.id = profile.id;
            }
          });
        }

        // Keep db.profiles and db.hierarchyProfiles in sync
        const matchH = (db.hierarchyProfiles || []).find(p => p.id === profileId);
        if (matchH && matchH !== profile) Object.assign(matchH, profile);
        const matchP = (db.profiles || []).find(p => p.id === profileId);
        if (matchP && matchP !== profile) Object.assign(matchP, profile);

        saveDb();
        sendJson(200, { success: true, data: profile });
      } else {
        sendJson(404, { success: false, message: 'Profile not found' });
      }
      return true;
    }

    if (req.method === 'DELETE') {
      db.profiles = (db.profiles || []).filter(p => p.id !== profileId);
      if (db.hierarchyProfiles) {
        db.hierarchyProfiles = db.hierarchyProfiles.filter(p => p.id !== profileId);
      }
      saveDb();
      sendJson(200, { success: true, message: 'Profile deleted successfully' });
      return true;
    }
  }

  // 5E. PORTAL MONITOR & PORTAL ISSUES
  if (pathname.startsWith('/api/v1/admin/portal-monitor')) {
    if (pathname.includes('/stats')) {
      sendJson(200, {
        success: true,
        data: {
          total: (db.portals || []).length,
          online: (db.portals || []).filter(p => p.isActive).length,
          offline: 0,
          degraded: 0
        }
      });
      return true;
    }
    if (pathname.includes('/alert-settings')) {
      sendJson(200, {
        success: true,
        data: { emailAlerts: false, telegramAlerts: false }
      });
      return true;
    }
    sendJson(200, { success: true, data: db.portals || [] });
    return true;
  }

  if (pathname.startsWith('/api/v1/admin/portal-issues')) {
    if (pathname.includes('/unread-count')) {
      sendJson(200, { success: true, data: { count: 0 } });
      return true;
    }
    sendJson(200, { success: true, data: db.portalIssueReports || [] });
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

  // PARTNER CREDITS PURCHASE CONFIG
  if (pathname === '/api/v1/partner/credits/purchase-config') {
    sendJson(200, {
      success: true,
      data: {
        enabled: false,
        currency: "USD",
        unitPrice: 5,
        minPurchase: 10,
        stripeEnabled: false,
        cryptoEnabled: false
      }
    });
    return true;
  }

  // PARTNER ASSISTANT SUMMARY
  if (pathname === '/api/v1/partner/assistant/summary') {
    const total = db.codes.length;
    const inUse = db.codes.filter(c => c.status === 'ACTIVE' || c.status === 'ASSIGNED').length;
    const unused = Math.max(0, total - inUse);
    sendJson(200, {
      success: true,
      data: {
        enabled: false,
        credits: (db.credits && db.credits.balance) || 0,
        codes: {
          unused,
          inUse,
          withPartners: 0,
          total
        },
        requests: {
          myOpen: 0,
          incoming: 0,
          total: 0
        }
      }
    });
    return true;
  }

  if (pathname === '/api/v1/partner/assistant/lookup') {
    const q = (searchParams.get('q') || '').toLowerCase().trim();
    const found = db.codes.find(c => 
      (c.code && c.code.toLowerCase() === q) ||
      (c.macAddress && c.macAddress.toLowerCase() === q) ||
      (c.code && c.code.toLowerCase().includes(q))
    );
    if (found) {
      sendJson(200, { success: true, data: found });
    } else {
      sendJson(404, { success: false, message: "No code in your network matches that." });
    }
    return true;
  }

  if (pathname === '/api/v1/partner/assistant/expiring') {
    const days = parseInt(searchParams.get('days') || '30', 10);
    const now = Date.now();
    const threshold = now + days * 24 * 60 * 60 * 1000;
    const expiring = db.codes.filter(c => {
      if (!c.expiresAt) return false;
      const t = new Date(c.expiresAt).getTime();
      return t > now && t <= threshold;
    }).map(c => ({
      ...c,
      daysLeft: Math.max(1, Math.round((new Date(c.expiresAt).getTime() - now) / (24 * 60 * 60 * 1000)))
    }));
    sendJson(200, {
      success: true,
      data: {
        total: expiring.length,
        items: expiring.slice(0, 20)
      }
    });
    return true;
  }

  if (pathname === '/api/v1/customer/assistant/summary') {
    sendJson(200, { success: true, data: { enabled: false } });
    return true;
  }

  if (pathname === '/api/v1/partner/requests/badge') {
    sendJson(200, {
      success: true,
      data: {
        mine: 0,
        incoming: 0,
        count: 0
      }
    });
    return true;
  }

  if (pathname === '/api/v1/partner/requests') {
    sendJson(200, {
      success: true,
      data: [],
      meta: { page: 1, limit: 20, total: 0 }
    });
    return true;
  }

  if (pathname === '/api/v1/announcements/web') {
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

  // Common user/partner endpoints queried by dashboard
  if (pathname === '/api/v1/users/me/profiles') {
    sendJson(200, { success: true, data: db.profiles || [] });
    return true;
  }

  if (pathname === '/api/v1/users/me/avatars') {
    sendJson(200, { success: true, data: [] });
    return true;
  }

  if (pathname === '/api/v1/users/me/profile-urls') {
    sendJson(200, { success: true, data: [] });
    return true;
  }

  if (pathname === '/api/v1/partner/credits/purchase-config') {
    sendJson(200, {
      success: true,
      data: {
        packages: [],
        exchangeRates: {},
        minPurchase: 10,
        currency: "USD"
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
