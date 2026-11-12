<?php
/**
 * SlixTV - Stalker Portal Anti-Rate-Limit & Firewall Reverse Proxy
 * Supports Stream4k, Glo / SunTV, and custom portals.
 */

// Enable CORS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH");
header("Access-Control-Allow-Headers: X-Requested-With, Content-Type, Authorization, X-Api-Key, Accept, Origin");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$uri = $_SERVER['REQUEST_URI'];
$parsedUri = parse_url($uri);
$path = $parsedUri['path'] ?? '';
$query = isset($parsedUri['query']) ? '?' . $parsedUri['query'] : '';

// 1. Determine upstream host
$upstreamHost = 'https://tv.stream4k.ac';

if (stripos($path, '/glo') !== false || stripos($path, 'suntv') !== false || (isset($_GET['portal']) && $_GET['portal'] === 'glo')) {
    $upstreamHost = 'http://play.suntv.biz';
} else {
    // Check if custom portal key is in path, e.g. /portal/{id}/...
    if (preg_match('#/portal/([^/]+)#i', $path, $matches)) {
        $portalKey = strtolower($matches[1]);
        if ($portalKey === 'glo' || strpos($portalKey, 'suntv') !== false) {
            $upstreamHost = 'http://play.suntv.biz';
        } elseif ($portalKey !== 's4k') {
            $dbPath = __DIR__ . '/data/db.json';
            if (file_exists($dbPath)) {
                $db = json_decode(file_get_contents($dbPath), true);
                if (!empty($db['portals'])) {
                    foreach ($db['portals'] as $p) {
                        if (
                            (!empty($p['id']) && strtolower($p['id']) === $portalKey) ||
                            (!empty($p['portalCode']) && strtolower($p['portalCode']) === $portalKey) ||
                            (!empty($p['name']) && strtolower($p['name']) === $portalKey)
                        ) {
                            if (!empty($p['url'])) {
                                $parsedHost = parse_url($p['url']);
                                if (!empty($parsedHost['scheme']) && !empty($parsedHost['host'])) {
                                    $port = !empty($parsedHost['port']) ? ':' . $parsedHost['port'] : '';
                                    $upstreamHost = $parsedHost['scheme'] . '://' . $parsedHost['host'] . $port;
                                } else {
                                    $upstreamHost = rtrim($p['url'], '/');
                                }
                            }
                            break;
                        }
                    }
                }
            }
        }
    }
}

// 2. Determine upstream stalker path
$upstreamPath = '/stalker_portal/server/load.php';
if (stripos($path, '/c/') !== false || preg_match('#/c$#i', $path)) {
    $upstreamPath = '/stalker_portal/c/';
}

$targetUrl = rtrim($upstreamHost, '/') . $upstreamPath . $query;

// 3. Prepare headers
$headers = [];
$incomingHeaders = getallheaders();

$hasUserAgent = false;
foreach ($incomingHeaders as $k => $v) {
    $lk = strtolower($k);
    if (in_array($lk, ['host', 'connection', 'content-length', 'accept-encoding'])) {
        continue;
    }
    if ($lk === 'user-agent') {
        $hasUserAgent = true;
        if (stripos($v, 'okhttp') !== false) {
            $v = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';
        }
    }
    $headers[] = "$k: $v";
}

if (!$hasUserAgent) {
    $headers[] = 'User-Agent: Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';
}

// 4. Forward request using cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (in_array($method, ['POST', 'PUT', 'PATCH'])) {
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    $rawInput = file_get_contents('php://input');
    if ($rawInput) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $rawInput);
    }
}

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Failed to reach upstream IPTV server',
        'message' => $curlErr,
        'target' => $targetUrl
    ]);
    exit;
}

if ($contentType) {
    header("Content-Type: $contentType");
} else {
    header("Content-Type: application/json");
}

http_response_code($httpCode ? $httpCode : 200);
echo $response;
