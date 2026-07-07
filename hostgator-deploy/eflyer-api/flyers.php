<?php
/**
 * CRM E-Flyer API Proxy
 * Deploy ke: /eflyer-v3/api/flyers.php (Hostgator)
 * Tidak mengubah sistem e-flyer yang sudah ada.
 *
 * Query params:
 *   key        — API key (wajib)
 *   q          — kata kunci (opsional)
 *   category   — nama kategori (opsional, case-insensitive)
 *   dept       — nama departemen (opsional)
 *   limit      — max hasil (default 60, max 100)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Config ───────────────────────────────────────────────────────────────────

// Ganti dengan API key yang sama di pengaturan CRM
define('API_KEY', getenv('EFLYER_API_KEY') ?: 'GANTI_API_KEY_INI');

// Base URL untuk file download (sesuaikan dengan domain live)
define('BASE_URL', 'https://rkzsurabaya.com/eflyer-v3/public/');

// ── Auth ─────────────────────────────────────────────────────────────────────

$key = $_GET['key'] ?? ($_SERVER['HTTP_X_API_KEY'] ?? '');
if (!hash_equals(API_KEY, (string) $key)) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// ── DB ───────────────────────────────────────────────────────────────────────

require_once __DIR__ . '/../db_helpers.php';

// ── Params ───────────────────────────────────────────────────────────────────

$q     = trim($_GET['q']       ?? '');
$cat   = trim($_GET['category'] ?? '');
$dept  = trim($_GET['dept']    ?? '');
$limit = min((int) ($_GET['limit'] ?? 60), 100);

// ── Query ────────────────────────────────────────────────────────────────────

$sql = "
    SELECT
        f.id,
        f.title,
        f.tags,
        f.published_at,
        f.updated_at,
        c.name  AS category,
        d.name  AS dept,
        ff.id        AS file_id,
        ff.mime_type,
        ff.file_name,
        ff.size_bytes
    FROM flyers f
    LEFT JOIN categories  c  ON c.id  = f.category_id
    LEFT JOIN departments d  ON d.id  = f.dept_id
    LEFT JOIN flyer_files ff ON ff.id = (
        SELECT ff2.id
        FROM   flyer_files ff2
        WHERE  ff2.flyer_id = f.id
        ORDER  BY ff2.version_no DESC, ff2.id DESC
        LIMIT  1
    )
    WHERE f.status    = 'published'
      AND f.is_public = 1
      AND (f.expires_at IS NULL OR f.expires_at >= NOW())
";

$params = [];

if ($q !== '') {
    $sql     .= " AND (f.title LIKE ? OR f.tags LIKE ?)";
    $params[] = "%$q%";
    $params[] = "%$q%";
}

if ($cat !== '') {
    $sql     .= " AND LOWER(c.name) LIKE ?";
    $params[] = '%' . strtolower($cat) . '%';
}

if ($dept !== '') {
    $sql     .= " AND LOWER(d.name) LIKE ?";
    $params[] = '%' . strtolower($dept) . '%';
}

$sql .= " ORDER BY f.published_at DESC, f.updated_at DESC LIMIT ?";
$params[] = $limit;

$rows = db_all($sql, $params);

// ── Build response ────────────────────────────────────────────────────────────

$base = rtrim(BASE_URL, '/');

$items = array_map(function ($r) use ($base) {
    $fileId   = (int) ($r['file_id'] ?? 0);
    $mime     = strtolower((string) ($r['mime_type'] ?? ''));
    $fileName = (string) ($r['file_name'] ?? '');
    $ext      = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

    $isImage = $fileId > 0 && (strpos($mime, 'image/') === 0 || in_array($ext, ['jpg','jpeg','png','gif','webp'], true));
    $isPdf   = $fileId > 0 && (strpos($mime, 'pdf') !== false || $ext === 'pdf');

    $cacheKey  = strtotime($r['updated_at'] ?? $r['published_at'] ?? 'now');
    $previewUrl  = $fileId ? "$base/download.php?inline=1&file_id=$fileId&v=" . urlencode((string) $cacheKey) : null;
    $downloadUrl = $fileId ? "$base/download.php?file_id=$fileId" : null;

    return [
        'id'           => (int) $r['id'],
        'title'        => $r['title'],
        'category'     => $r['category'] ?? null,
        'dept'         => $r['dept']     ?? null,
        'tags'         => $r['tags']     ?? null,
        'published_at' => $r['published_at'] ?? null,
        'file_type'    => $isImage ? 'image' : ($isPdf ? 'pdf' : ($fileId ? 'file' : null)),
        'mime_type'    => $fileId ? $mime     : null,
        'file_name'    => $fileId ? $fileName : null,
        'preview_url'  => $previewUrl,
        'download_url' => $downloadUrl,
    ];
}, $rows);

echo json_encode([
    'ok'    => true,
    'total' => count($items),
    'items' => $items,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
