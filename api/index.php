<?php
/**
 * SlixTV - Management Dashboard REST API Router
 * Handles all /api/v1/* requests and manages data/db.json
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH");
header("Access-Control-Allow-Headers: X-Requested-With, Content-Type, Authorization, X-Api-Key, Accept, Origin");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dbPath = dirname(__DIR__) . '/data/db.json';

function getDb() {
    global $dbPath;
    if (file_exists($dbPath)) {
        $data = json_decode(file_get_contents($dbPath), true);
        if (is_array($data)) return $data;
    }
    return [
        'user' => [
            'id' => 'd937da3c-9ddd-47e3-9409-90e12349f251',
            'email' => 'admin@slixtv.com',
            'firstName' => 'SlixTV',
            'lastName' => 'Admin',
            'role' => 'RESELLER',
            'status' => 'ACTIVE'
        ],
        'codes' => [],
        'profiles' => [],
        'portals' => [],
        'hierarchyProfiles' => []
    ];
}

function saveDb($db) {
    global $dbPath;
    $dir = dirname($dbPath);
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
    }
    file_put_contents($dbPath, json_encode($db, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function sendResponse($code, $data) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

$db = getDb();
$method = $_SERVER['REQUEST_METHOD'];

// Parse URL path
$requestUri = $_SERVER['REQUEST_URI'];
$parsed = parse_url($requestUri);
$path = $parsed['path'] ?? '';

// Strip /api if passed
$subPath = preg_replace('#^/api#', '', $path);
$subPath = '/' . ltrim($subPath, '/');

// Parse request body
$rawBody = file_get_contents('php://input');
$body = [];
if (!empty($rawBody)) {
    $decodedBody = json_decode($rawBody, true);
    if (is_array($decodedBody)) {
        $body = $decodedBody;
    }
}

// 1. AUTHENTICATION
if ($subPath === '/v1/auth/login' && $method === 'POST') {
    header('Set-Cookie: refreshToken=slixtv-session-token; Path=/; HttpOnly; SameSite=Lax');
    sendResponse(200, [
        'success' => true,
        'data' => [
            'user' => $db['user'] ?? [],
            'accessToken' => 'slixtv-auth-token-verified'
        ]
    ]);
}

if ($subPath === '/v1/auth/me') {
    sendResponse(200, [
        'success' => true,
        'data' => $db['user'] ?? []
    ]);
}

if ($subPath === '/v1/auth/refresh') {
    sendResponse(200, [
        'success' => true,
        'data' => [
            'accessToken' => 'slixtv-auth-token-refreshed'
        ]
    ]);
}

if ($subPath === '/v1/auth/logout') {
    sendResponse(200, [
        'success' => true,
        'message' => 'Logged out successfully'
    ]);
}

// 2. RESELLER DASHBOARD
if ($subPath === '/v1/reseller/dashboard') {
    $codes = $db['codes'] ?? [];
    $total = count($codes);
    $active = 0;
    $allocated = 0;
    $recent = [];

    foreach ($codes as $c) {
        $st = $c['status'] ?? '';
        if ($st === 'ACTIVE') $active++;
        elseif ($st === 'ASSIGNED') $allocated++;

        if (!empty($c['resellerActivatedAt']) || !empty($c['customerName'])) {
            if (count($recent) < 10) {
                $recent[] = $c;
            }
        }
    }

    $available = max(0, $total - ($active + $allocated));

    sendResponse(200, [
        'success' => true,
        'data' => [
            'stats' => [
                'total' => $total,
                'allocated' => $allocated,
                'activated' => $active,
                'active' => $active,
                'expired' => 0,
                'blocked' => 0,
                'available' => $available
            ],
            'credits' => $db['credits'] ?? ['balance' => 0, 'creditUnit' => 'month'],
            'recentActivations' => $recent,
            'expiringSoon' => []
        ]
    ]);
}

// 3. CODES (LIST & CREATE)
if ($subPath === '/v1/reseller/codes' || $subPath === '/v1/hierarchy/codes') {
    if ($method === 'GET') {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, (int)($_GET['limit'] ?? 50));
        $statusFilter = strtoupper($_GET['status'] ?? 'ALL');
        $search = strtolower(trim($_GET['search'] ?? $_GET['q'] ?? ''));

        $filtered = [];
        foreach ($db['codes'] ?? [] as $c) {
            if ($statusFilter !== 'ALL' && strtoupper($c['status'] ?? '') !== $statusFilter) {
                continue;
            }
            if ($search !== '') {
                $match = (stripos($c['code'] ?? '', $search) !== false) ||
                         (stripos($c['customerName'] ?? '', $search) !== false) ||
                         (stripos($c['customerPhone'] ?? '', $search) !== false) ||
                         (stripos($c['macAddress'] ?? '', $search) !== false) ||
                         (stripos($c['referenceMac'] ?? '', $search) !== false);
                if (!$match) continue;
            }
            $filtered[] = $c;
        }

        $total = count($filtered);
        $totalPages = ceil($total / $limit);
        $start = ($page - 1) * $limit;
        $paginated = array_slice($filtered, $start, $limit);

        sendResponse(200, [
            'success' => true,
            'data' => $paginated,
            'pagination' => [
                'page' => $page,
                'limit' => $limit,
                'total' => $total,
                'totalPages' => $totalPages ? $totalPages : 1
            ]
        ]);
    }

    if ($method === 'POST') {
        $newCodeStr = 'SLX' . strtoupper(substr(md5(uniqid(mt_rand(), true)), 0, 7));
        $newCode = [
            'id' => 'slx-' . round(microtime(true) * 1000),
            'code' => $newCodeStr,
            'type' => 'RESELLER',
            'status' => 'AVAILABLE',
            'validityDays' => 90,
            'activationType' => 'TRIAL',
            'customerName' => null,
            'customerPhone' => null,
            'createdAt' => date('c'),
            'profile' => $db['profiles'][0] ?? ['name' => 's4k'],
            'canRenew' => false,
            'canExtend' => true
        ];
        array_unshift($db['codes'], $newCode);
        saveDb($db);
        sendResponse(201, ['success' => true, 'data' => $newCode]);
    }
}

// 4. CODE ACTIONS (/v1/reseller/codes/{id}/{action} or /v1/hierarchy/codes/{id}/{action})
if (preg_match('#^/v1/(reseller|hierarchy)/codes/([^/]+)(?:/([^/]+))?#', $subPath, $m)) {
    $codeId = $m[2];
    $action = $m[3] ?? '';

    $codeIdx = -1;
    foreach ($db['codes'] as $i => $c) {
        if (($c['id'] ?? '') === $codeId || ($c['code'] ?? '') === $codeId) {
            $codeIdx = $i;
            break;
        }
    }

    if ($codeIdx === -1) {
        sendResponse(404, ['success' => false, 'message' => 'Code not found']);
    }

    $c = &$db['codes'][$codeIdx];

    if ($action === 'activate' && $method === 'POST') {
        $actType = $body['activationType'] ?? 'FULL';
        $months = (int)($body['months'] ?? ($actType === 'TRIAL' ? 3 : 12));
        $days = ($actType === 'TRIAL') ? ($c['validityDays'] ?? 90) : ($months * 30);
        
        $c['customerName'] = $body['customerName'] ?? ($c['customerName'] ?? 'Customer');
        $c['customerPhone'] = $body['customerPhone'] ?? ($c['customerPhone'] ?? '');
        $c['activationType'] = $actType;
        $c['validityDays'] = $days;
        $c['resellerActivatedAt'] = date('c');
        $c['activatedAt'] = date('c');
        $c['expiresAt'] = date('c', strtotime("+$days days"));

        if (!empty($body['referenceMac'])) {
            $c['referenceMac'] = trim($body['referenceMac']);
            $c['macAddress'] = strtolower(trim($body['referenceMac']));
            $c['status'] = 'ACTIVE';
        } else {
            $c['status'] = 'ASSIGNED';
        }

        if (!empty($body['profileId'])) {
            foreach ($db['profiles'] as $p) {
                if (($p['id'] ?? '') === $body['profileId']) {
                    $c['profile'] = $p;
                    break;
                }
            }
        }
        $c['canRenew'] = true;
        $c['canExtend'] = true;
        saveDb($db);
        sendResponse(200, ['success' => true, 'message' => 'Code activated successfully', 'data' => $c]);
    }

    if ($action === 'renew' && $method === 'POST') {
        $months = (int)($body['months'] ?? 12);
        $curExp = !empty($c['expiresAt']) ? strtotime($c['expiresAt']) : time();
        $c['expiresAt'] = date('c', strtotime("+$months months", $curExp));
        $c['status'] = 'ACTIVE';
        $c['canRenew'] = true;
        saveDb($db);
        sendResponse(200, ['success' => true, 'message' => 'Code renewed successfully', 'data' => $c]);
    }

    if ($action === 'extend' && $method === 'POST') {
        $months = (int)($body['months'] ?? 1);
        $curExp = !empty($c['expiresAt']) ? strtotime($c['expiresAt']) : time();
        $c['expiresAt'] = date('c', strtotime("+$months months", $curExp));
        saveDb($db);
        sendResponse(200, ['success' => true, 'message' => 'Code extended successfully', 'data' => $c]);
    }

    if ($action === 'profile' && in_array($method, ['PATCH', 'POST'])) {
        foreach ($db['profiles'] as $p) {
            if (($p['id'] ?? '') === ($body['profileId'] ?? '')) {
                $c['profile'] = $p;
                break;
            }
        }
        saveDb($db);
        sendResponse(200, ['success' => true, 'message' => 'Profile updated successfully', 'data' => $c]);
    }

    if (in_array($action, ['unlink', 'request-unlink', 'unlink-device']) || ($action === '' && $method === 'DELETE')) {
        $c['macAddress'] = null;
        $c['referenceMac'] = null;
        $c['status'] = 'AVAILABLE';
        saveDb($db);
        sendResponse(200, ['success' => true, 'message' => 'Device unlinked successfully', 'data' => $c]);
    }

    if ($action === 'reset-device') {
        $c['macAddress'] = null;
        $c['referenceMac'] = null;
        $c['customerName'] = null;
        $c['customerPhone'] = null;
        $c['status'] = 'AVAILABLE';
        saveDb($db);
        sendResponse(200, ['success' => true, 'message' => 'Device reset successfully', 'data' => $c]);
    }

    if ($action === '') {
        if ($method === 'GET') {
            sendResponse(200, ['success' => true, 'data' => $c]);
        }
    }
}

// 5. PORTALS (/v1/hierarchy/portals or /v1/admin/portals)
if (preg_match('#^/v1/(hierarchy|admin)/portals(?:/([^/]+))?(?:/([^/]+))?#', $subPath, $m)) {
    $portalId = $m[2] ?? '';
    $action = $m[3] ?? '';

    if (empty($portalId)) {
        if ($method === 'POST') {
            $newPortal = [
                'id' => $body['id'] ?? ('portal-' . round(microtime(true) * 1000)),
                'name' => trim($body['name'] ?? 'New Portal'),
                'url' => trim($body['url'] ?? ''),
                'portalCode' => $body['portalCode'] ?? strtoupper(substr(md5(uniqid()), 0, 7)),
                'isActive' => ($body['isActive'] ?? true) !== false,
                'createdAt' => date('c'),
                'updatedAt' => date('c'),
                'usedByProfiles' => []
            ];
            $db['portals'][] = $newPortal;
            saveDb($db);
            sendResponse(200, ['success' => true, 'data' => $newPortal]);
        }
        sendResponse(200, [
            'success' => true,
            'data' => $db['portals'] ?? [],
            'pagination' => ['page' => 1, 'limit' => 50, 'total' => count($db['portals'] ?? []), 'totalPages' => 1]
        ]);
    }

    // Portal by ID
    $pIdx = -1;
    foreach ($db['portals'] as $i => $p) {
        if (($p['id'] ?? '') === $portalId) {
            $pIdx = $i;
            break;
        }
    }

    if ($pIdx === -1 && $method !== 'POST') {
        sendResponse(404, ['success' => false, 'message' => 'Portal not found']);
    }

    if ($action === 'toggle-status') {
        $db['portals'][$pIdx]['isActive'] = !($db['portals'][$pIdx]['isActive'] ?? true);
        $db['portals'][$pIdx]['updatedAt'] = date('c');
        saveDb($db);
        sendResponse(200, ['success' => true, 'data' => $db['portals'][$pIdx]]);
    }

    if ($method === 'GET') {
        sendResponse(200, ['success' => true, 'data' => $db['portals'][$pIdx]]);
    }

    if (in_array($method, ['PUT', 'PATCH'])) {
        foreach ($body as $k => $v) {
            $db['portals'][$pIdx][$k] = $v;
        }
        $db['portals'][$pIdx]['updatedAt'] = date('c');
        saveDb($db);
        sendResponse(200, ['success' => true, 'data' => $db['portals'][$pIdx]]);
    }

    if ($method === 'DELETE') {
        array_splice($db['portals'], $pIdx, 1);
        saveDb($db);
        sendResponse(200, ['success' => true, 'message' => 'Portal deleted successfully']);
    }
}

// 6. PROFILES (/v1/hierarchy/profiles, /v1/reseller/profiles, /v1/admin/profiles)
if (preg_match('#^/v1/(hierarchy|reseller|admin)/profiles(?:/([^/]+))?#', $subPath, $m)) {
    $profId = $m[2] ?? '';

    if (empty($profId)) {
        if ($method === 'POST') {
            $newId = $body['id'] ?? ('prof-' . round(microtime(true) * 1000));
            $assignedPortals = $body['portals'] ?? [];
            if (empty($assignedPortals)) {
                $assignedPortals = [
                    [
                        'id' => 'c0388fe4-eb83-4849-b286-4225586d133a',
                        'name' => 'Stream4k',
                        'url' => 'https://tv.stream4k.ac',
                        'portalCode' => 'S4KPRO',
                        'isActive' => true,
                        'isDefault' => true
                    ]
                ];
            }
            $newProfile = [
                'id' => $newId,
                'name' => trim($body['name'] ?? 'New Profile'),
                'description' => trim($body['description'] ?? ''),
                'isActive' => ($body['isActive'] ?? true) !== false,
                'source' => 'own',
                'createdAt' => date('c'),
                'updatedAt' => date('c'),
                'portals' => $assignedPortals,
                'profilePortals' => []
            ];
            $db['profiles'][] = $newProfile;
            $db['hierarchyProfiles'][] = $newProfile;
            saveDb($db);
            sendResponse(200, ['success' => true, 'data' => $newProfile]);
        }

        $list = (!empty($db['hierarchyProfiles'])) ? $db['hierarchyProfiles'] : ($db['profiles'] ?? []);
        sendResponse(200, [
            'success' => true,
            'data' => $list,
            'pagination' => ['page' => 1, 'limit' => 50, 'total' => count($list), 'totalPages' => 1]
        ]);
    }

    // Profile by ID
    $foundIdx = -1;
    foreach ($db['profiles'] as $i => $p) {
        if (($p['id'] ?? '') === $profId) {
            $foundIdx = $i;
            break;
        }
    }

    if ($method === 'GET') {
        if ($foundIdx !== -1) {
            sendResponse(200, ['success' => true, 'data' => $db['profiles'][$foundIdx]]);
        }
        sendResponse(404, ['success' => false, 'message' => 'Profile not found']);
    }

    if (in_array($method, ['PUT', 'PATCH'])) {
        if ($foundIdx !== -1) {
            foreach ($body as $k => $v) {
                $db['profiles'][$foundIdx][$k] = $v;
            }
            $db['profiles'][$foundIdx]['updatedAt'] = date('c');
            saveDb($db);
            sendResponse(200, ['success' => true, 'data' => $db['profiles'][$foundIdx]]);
        }
        sendResponse(404, ['success' => false, 'message' => 'Profile not found']);
    }

    if ($method === 'DELETE') {
        if ($foundIdx !== -1) {
            array_splice($db['profiles'], $foundIdx, 1);
            if (!empty($db['hierarchyProfiles'])) {
                foreach ($db['hierarchyProfiles'] as $hi => $hp) {
                    if (($hp['id'] ?? '') === $profId) {
                        array_splice($db['hierarchyProfiles'], $hi, 1);
                        break;
                    }
                }
            }
            saveDb($db);
            sendResponse(200, ['success' => true, 'message' => 'Profile deleted successfully']);
        }
        sendResponse(404, ['success' => false, 'message' => 'Profile not found']);
    }
}

// 7. DASHBOARD & SYSTEM STATS
if ($subPath === '/v1/hierarchy/dashboard') {
    sendResponse(200, [
        'success' => true,
        'data' => $db['hierarchyDashboard'] ?? []
    ]);
}

if ($subPath === '/v1/hierarchy/my-parent') {
    sendResponse(200, [
        'success' => true,
        'data' => $db['parent'] ?? ['name' => 'SlixTV SuperAdmin', 'role' => 'SUPER_ADMIN']
    ]);
}

if (strpos($subPath, '/v1/admin/portal-monitor') !== false) {
    sendResponse(200, [
        'success' => true,
        'data' => [
            'totalPortals' => count($db['portals'] ?? []),
            'healthyPortals' => count($db['portals'] ?? []),
            'failingPortals' => 0,
            'recentChecks' => []
        ]
    ]);
}

if (strpos($subPath, '/v1/admin/portal-issues') !== false) {
    sendResponse(200, [
        'success' => true,
        'data' => ['unreadCount' => 0]
    ]);
}

if ($subPath === '/v1/users/credits') {
    sendResponse(200, [
        'success' => true,
        'data' => $db['credits'] ?? ['balance' => 1000, 'creditUnit' => 'month']
    ]);
}

// Fallback: endpoint not found
sendResponse(404, [
    'success' => false,
    'message' => "Endpoint $subPath not found on SlixTV PHP Server"
]);
