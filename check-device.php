<?php
/**
 * SlixTV - Device Verification Endpoint
 * Called by Android Client App: /check-device.php?mac_address={MAC}
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: X-Requested-With, Content-Type, Authorization, X-Api-Key, Accept, Origin");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$mac = strtoupper(trim($_GET['mac_address'] ?? $_GET['mac'] ?? ''));

$dbFile = __DIR__ . '/data/db.json';
$db = ['codes' => []];

if (file_exists($dbFile)) {
    $decoded = json_decode(file_get_contents($dbFile), true);
    if (is_array($decoded)) {
        $db = array_merge($db, $decoded);
    }
}

$codeMatch = null;
if (!empty($mac)) {
    foreach ($db['codes'] as $c) {
        $refMac = strtoupper($c['referenceMac'] ?? '');
        $macAddr = strtoupper($c['macAddress'] ?? '');
        if ($refMac === $mac || $macAddr === $mac) {
            $codeMatch = $c;
            break;
        }
    }
}

if ($codeMatch) {
    $isActive = ($codeMatch['status'] ?? '') === 'ACTIVE';
    $isExpired = false;
    if (!empty($codeMatch['expiresAt'])) {
        $expTime = strtotime($codeMatch['expiresAt']);
        if ($expTime && $expTime < time()) {
            $isExpired = true;
        }
    }

    echo json_encode([
        'success' => true,
        'status' => $isExpired ? 'EXPIRED' : ($codeMatch['status'] ?? 'ACTIVE'),
        'data' => [
            'code' => $codeMatch['code'] ?? '',
            'macAddress' => $codeMatch['macAddress'] ?? $mac,
            'customerName' => $codeMatch['customerName'] ?? '',
            'activationType' => $codeMatch['activationType'] ?? 'FULL',
            'expiresAt' => $codeMatch['expiresAt'] ?? '',
            'profile' => $codeMatch['profile'] ?? null
        ]
    ], JSON_UNESCAPED_SLASHES);
} else {
    echo json_encode([
        'success' => false,
        'status' => 'UNREGISTERED',
        'message' => 'Device MAC is not activated yet',
        'data' => [
            'macAddress' => $mac
        ]
    ], JSON_UNESCAPED_SLASHES);
}

