<?php
/**
 * SlixTV - Client App Profile Loader & Portal Resolver
 * Called by Android Client App: /api.php?profile={name}
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: X-Requested-With, Content-Type, Authorization, X-Api-Key, Accept, Origin");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$rawParam = $_GET['profile'] ?? $_GET['p'] ?? '';
$profileName = strtolower(trim($rawParam));

// Load database
$dbFile = __DIR__ . '/data/db.json';
$db = [
    'profiles' => [],
    'hierarchyProfiles' => [],
    'portals' => [],
    'codes' => []
];

if (file_exists($dbFile)) {
    $decoded = json_decode(file_get_contents($dbFile), true);
    if (is_array($decoded)) {
        $db = array_merge($db, $decoded);
    }
}

// Find profile
$prof = null;
$allProfiles = array_merge($db['profiles'] ?? [], $db['hierarchyProfiles'] ?? []);

if (!empty($profileName)) {
    foreach ($allProfiles as $p) {
        $pName = strtolower($p['name'] ?? '');
        $pId = strtolower($p['id'] ?? '');
        if ($pName === $profileName || $pId === $profileName) {
            $prof = $p;
            break;
        }
    }

    if (!$prof) {
        foreach ($allProfiles as $p) {
            $pName = strtolower($p['name'] ?? '');
            if (strpos($pName, $profileName) !== false) {
                $prof = $p;
                break;
            }
        }
    }
}

// Find Stream4k fallback
$s4kProfile = null;
foreach ($allProfiles as $p) {
    $pName = strtolower($p['name'] ?? '');
    if ($pName === 's4k' || $pName === 'test') {
        $s4kProfile = $p;
        break;
    }
}

if (!$prof) {
    if (!empty($profileName)) {
        $prof = [
            'id' => 'dyn-' . $profileName,
            'name' => $profileName,
            'portals' => (!empty($s4kProfile['portals'])) ? $s4kProfile['portals'] : [
                [
                    'id' => 'c0388fe4-eb83-4849-b286-4225586d133a',
                    'name' => 'Stream4k',
                    'url' => 'https://tv.stream4k.ac',
                    'portalCode' => 'S4KPRO',
                    'isActive' => true,
                    'isDefault' => true
                ]
            ]
        ];
    } else {
        $prof = $s4kProfile ?? ($allProfiles[0] ?? null);
    }
}

// Base URL calculation
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['SERVER_PORT'] ?? 0) == 443 || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
$protocol = $isHttps ? 'https://' : 'http://';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$baseUrl = $protocol . $host;

// Resolve portals
$rawPortals = [];
if (!empty($prof['portals']) && is_array($prof['portals'])) {
    $rawPortals = $prof['portals'];
} elseif (!empty($prof['profilePortals']) && is_array($prof['profilePortals'])) {
    foreach ($prof['profilePortals'] as $pp) {
        $rawPortals[] = [
            'id' => $pp['portalId'] ?? ($pp['portal']['id'] ?? null),
            'name' => $pp['portal']['name'] ?? ($pp['name'] ?? 'Portal'),
            'url' => $pp['portal']['url'] ?? ($pp['url'] ?? ''),
            'portalCode' => $pp['portal']['portalCode'] ?? ($pp['portalCode'] ?? 'SLIXTV'),
            'isDefault' => !empty($pp['isDefault'])
        ];
    }
}

if (empty($rawPortals)) {
    $rawPortals = [
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

$hasDefault = false;
foreach ($rawPortals as $p) {
    if (!empty($p['isDefault'])) {
        $hasDefault = true;
        break;
    }
}

$result = [];
foreach ($rawPortals as $idx => $p) {
    $portalId = $p['id'] ?? ($p['portalId'] ?? '');
    
    // Check if live portal exists in db
    $livePortal = null;
    if (!empty($db['portals'])) {
        foreach ($db['portals'] as $dp) {
            if ((!empty($portalId) && ($dp['id'] ?? '') === $portalId) || (!empty($dp['name']) && !empty($p['name']) && strtolower($dp['name']) === strtolower($p['name']))) {
                $livePortal = $dp;
                break;
            }
        }
    }

    $effectiveUrl = !empty($livePortal['url']) ? $livePortal['url'] : (!empty($p['url']) ? $p['url'] : 'https://tv.stream4k.ac');

    // Route through anti-rate-limit proxy on current server
    if (stripos($effectiveUrl, 'stream4k') !== false || stripos($effectiveUrl, 'tv.stream4k.ac') !== false) {
        $effectiveUrl = $baseUrl . '/portal/s4k';
    } elseif (stripos($effectiveUrl, 'glotv.me') !== false || stripos($effectiveUrl, 'play.suntv.biz') !== false) {
        $effectiveUrl = $baseUrl . '/portal/glo';
    } elseif (!empty($portalId)) {
        $effectiveUrl = $baseUrl . '/portal/' . urlencode($portalId);
    }

    $isDef = !empty($p['isDefault']) || (!$hasDefault && $idx === 0);

    $result[] = [
        'name' => $livePortal['name'] ?? ($p['name'] ?? ($prof['name'] ?? 'Stream4k')),
        'code' => $livePortal['portalCode'] ?? ($p['portalCode'] ?? ($p['code'] ?? 'SLIXTV')),
        'url' => $effectiveUrl,
        'is_default' => $isDef
    ];
}

echo json_encode($result, JSON_UNESCAPED_SLASHES);
