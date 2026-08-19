<?php
/*
  Отдаёт каталог витрины браузеру ВСЕГДА свежим.

  Зачем этот файл. На хостингах (reg.ru, Beget и др.) статику .js раздаёт nginx
  со своим кешем — на reg.ru это 45 суток, и никакой .htaccess его не меняет.
  Из-за этого правка из админки уезжала на сервер, но посетитель (и сам клиент)
  ещё полтора месяца видел старый каталог: «поменял ссылку — на сайте ничего
  не изменилось».

  PHP идёт мимо этого кеша, поэтому страница грузит каталог через data.php.
  Трафик при этом не растёт: браузеру отдаётся ETag, и пока каталог не менялся,
  сервер отвечает «304 Not Modified» — несколько байт вместо всего файла.

  Файл самодостаточный: ставить ничего не нужно, только PHP на хостинге.
*/

declare(strict_types=1);

ini_set('display_errors', '0');

$file = __DIR__ . '/data.js';

header('Content-Type: application/javascript; charset=utf-8');
// no-cache = «можно хранить, но каждый раз спрашивай сервер». Это и даёт
// мгновенное появление правок, и экономит трафик за счёт ответов 304.
header('Cache-Control: no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

if (!is_file($file)) {
    http_response_code(404);
    echo "/* каталог не найден: data.js */\n";
    exit;
}

clearstatcache(true, $file);
$mtime = (int) filemtime($file);
$size  = (int) filesize($file);
$etag  = '"' . dechex($mtime) . '-' . dechex($size) . '"';

header('ETag: ' . $etag);
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');

$inm = trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''));
$ims = trim((string) ($_SERVER['HTTP_IF_MODIFIED_SINCE'] ?? ''));
// W/"..." — слабый ETag от прокси, сравниваем без префикса.
if ($inm !== '' && (ltrim($inm, 'W/') === $etag || $inm === $etag)) {
    http_response_code(304);
    exit;
}
if ($inm === '' && $ims !== '' && ($t = strtotime($ims)) !== false && $t >= $mtime) {
    http_response_code(304);
    exit;
}

// Сжатие: каталоги бывают под мегабайт, на мобильном интернете это заметно.
$gzip = false;
if (function_exists('gzencode')
    && stripos((string) ($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''), 'gzip') !== false
    && !ini_get('zlib.output_compression')) {
    $gzip = true;
}

if ($gzip) {
    $body = (string) file_get_contents($file);
    $body = (string) gzencode($body, 6);
    header('Content-Encoding: gzip');
    header('Vary: Accept-Encoding');
    header('Content-Length: ' . strlen($body));
    echo $body;
} else {
    header('Content-Length: ' . $size);
    readfile($file);
}
