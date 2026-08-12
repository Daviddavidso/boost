<?php
/*
  Бэкенд BOOST. Один файл, ставить ничего не нужно — только PHP на хостинге.

  Что умеет:
    GET  ?action=ping    — проверка, что бэкенд жив и data.js доступен на запись
    POST action=login    — вход в панель управления (отдаёт токен на 12 часов)
    POST action=save     — перезаписывает data.js каталогом из панели

  Пароль лежит в config.php рядом. Если файла нет — берётся значение по умолчанию.
*/

declare(strict_types=1);

// Любой warning из PHP, напечатанный до JSON, ломает ответ на стороне сайта.
// Поэтому в вывод ничего не пускаем — только в лог хостинга.
ini_set('display_errors', '0');
ini_set('log_errors', '1');

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const DEFAULT_PASSWORD = 'boost2026';
const SESSION_TTL      = 43200; // 12 часов

$ROOT      = __DIR__;
$DATA_FILE = $ROOT . '/data.js';
$CONFIG    = $ROOT . '/config.php';
$TOKENS    = $ROOT . '/.tokens';

$cfg = ['password' => DEFAULT_PASSWORD];
if (is_file($CONFIG)) {
    $loaded = include $CONFIG;
    if (is_array($loaded)) $cfg = array_merge($cfg, $loaded);
}

function out(array $payload, int $code = 200): void {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function body(): array {
    $raw = file_get_contents('php://input') ?: '';
    $j = json_decode($raw, true);
    if (is_array($j)) return $j;
    return $_POST;
}

/* ---------- Токены сессии ---------- */

function tokens_read(string $file): array {
    if (!is_file($file)) return [];
    $j = json_decode((string)file_get_contents($file), true);
    return is_array($j) ? $j : [];
}

function tokens_write(string $file, array $list): void {
    $now = time();
    $list = array_filter($list, fn($exp) => (int)$exp > $now);
    file_put_contents($file, json_encode($list), LOCK_EX);
    @chmod($file, 0600);
}

function token_issue(string $file): string {
    $t = bin2hex(random_bytes(24));
    $list = tokens_read($file);
    $list[$t] = time() + SESSION_TTL;
    tokens_write($file, $list);
    return $t;
}

function token_valid(string $file, string $t): bool {
    if ($t === '') return false;
    $list = tokens_read($file);
    if (!isset($list[$t])) return false;
    if ((int)$list[$t] < time()) { unset($list[$t]); tokens_write($file, $list); return false; }
    return true;
}

function token_from_request(): string {
    $h = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if ($h !== '') return (string)$h;
    $b = body();
    return isset($b['token']) ? (string)$b['token'] : '';
}

/* ---------- Действия ---------- */

$action = $_GET['action'] ?? (body()['action'] ?? '');

if ($action === 'ping') {
    out([
        'ok'         => true,
        'writable'   => is_writable($DATA_FILE) || is_writable($ROOT),
        'configured' => is_file($CONFIG),
    ]);
}

if ($action === 'login') {
    $b = body();
    $pass = (string)($b['password'] ?? '');
    // Небольшая задержка, чтобы перебор пароля был невыгодным.
    usleep(300000);
    if (!hash_equals((string)$cfg['password'], $pass)) {
        out(['ok' => false, 'error' => 'Неверный пароль'], 401);
    }
    out(['ok' => true, 'token' => token_issue($TOKENS), 'ttl' => SESSION_TTL]);
}

if ($action === 'save') {
    if (!token_valid($TOKENS, token_from_request())) {
        out(['ok' => false, 'error' => 'Сессия истекла, войдите заново'], 401);
    }
    $b = body();
    $data = $b['data'] ?? null;
    if (!is_array($data) || !isset($data['offers']) || !is_array($data['offers'])) {
        out(['ok' => false, 'error' => 'Каталог пустой или повреждён'], 400);
    }
    if (!isset($data['cats']) || !is_array($data['cats']) || count($data['cats']) === 0) {
        out(['ok' => false, 'error' => 'Список категорий пуст — оставьте хотя бы одну'], 400);
    }

    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) out(['ok' => false, 'error' => 'Не удалось собрать каталог'], 500);

    $out = "/* BOOST — каталог. Файл переписан панелью управления " . date('d.m.Y H:i') . ". */\n"
         . "window.SITE_DATA = " . $json . ";\n";

    // Бэкап предыдущей версии — на случай, если сохранилось не то.
    if (is_file($DATA_FILE)) @copy($DATA_FILE, $ROOT . '/data.backup.js');

    $tmp = $DATA_FILE . '.tmp';
    if (file_put_contents($tmp, $out, LOCK_EX) === false || !@rename($tmp, $DATA_FILE)) {
        @unlink($tmp);
        out(['ok' => false, 'error' => 'Нет прав на запись data.js. Поставьте файлу права 664.'], 500);
    }
    out(['ok' => true, 'updated' => date('Y-m-d H:i')]);
}

out(['ok' => false, 'error' => 'Неизвестное действие'], 400);
