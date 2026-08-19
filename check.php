<?php
/*
  Страница самопроверки витрины. Открывается по адресу вашсайт.ру/check.php

  Нужна для одного разговора: клиент пишет «поменял в панели — на сайте
  ничего не изменилось». Вместо переписки он открывает эту страницу и сразу
  видит, что именно не работает: не запускается PHP, нет прав на запись,
  каталог не обновлялся, или всё в порядке и дело в его браузере.
*/

declare(strict_types=1);
ini_set('display_errors', '0');

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

$root  = __DIR__;
$data  = $root . '/data.js';
$api   = $root . '/api.php';
$live  = $root . '/data.php';

$hasData   = is_file($data);
$writable  = $hasData ? is_writable($data) : is_writable($root);
$hasApi    = is_file($api);
$hasLive   = is_file($live);
$mtime     = $hasData ? (int) filemtime($data) : 0;
$size      = $hasData ? (int) filesize($data) : 0;
$offers    = 0;
if ($hasData) {
    $body = (string) file_get_contents($data);
    $offers = max(
        preg_match_all('/"(?:url|href|link)"\s*:/u', $body),
        preg_match_all('/\{\s*"?id"?\s*:/u', $body)
    );
}
$ageMin = $mtime ? (int) floor((time() - $mtime) / 60) : 0;

function row(string $title, bool $ok, string $good, string $bad): string {
    $mark  = $ok ? '✓' : '✗';
    $word  = $ok ? 'Работает' : 'Не работает';
    $text  = $ok ? $good : $bad;
    $cls   = $ok ? 'ok' : 'bad';
    return '<li class="' . $cls . '">'
         . '<span class="mark" aria-hidden="true">' . $mark . '</span>'
         . '<span class="body"><strong>' . htmlspecialchars($title, ENT_QUOTES) . ' — ' . $word . '.</strong> '
         . htmlspecialchars($text, ENT_QUOTES) . '</span></li>';
}

function humanAge(int $min): string {
    if ($min < 1)     return 'только что';
    if ($min < 60)    return $min . ' ' . plural($min, 'минуту', 'минуты', 'минут') . ' назад';
    $h = (int) floor($min / 60);
    if ($h < 24)      return $h . ' ' . plural($h, 'час', 'часа', 'часов') . ' назад';
    $d = (int) floor($h / 24);
    return $d . ' ' . plural($d, 'день', 'дня', 'дней') . ' назад';
}

function plural(int $n, string $one, string $few, string $many): string {
    $n = abs($n) % 100;
    if ($n >= 11 && $n <= 19) return $many;
    $n %= 10;
    if ($n === 1) return $one;
    if ($n >= 2 && $n <= 4) return $few;
    return $many;
}
?>
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Проверка сайта</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; padding: 24px 16px 48px;
    font: 17px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    color: #14161a; background: #fff;
  }
  main { max-width: 40rem; margin: 0 auto; }
  h1 { font-size: 1.6rem; line-height: 1.2; margin: 0 0 .4em; }
  p.lead { color: #454c57; margin: 0 0 1.6em; }
  ul { list-style: none; margin: 0 0 2em; padding: 0; }
  li { display: flex; gap: .7em; padding: .9em 0; border-top: 1px solid #dfe3e8; }
  li:last-child { border-bottom: 1px solid #dfe3e8; }
  .mark { font-size: 1.25em; line-height: 1.3; }
  .ok .mark  { color: #0a6b2e; }
  .bad .mark { color: #9c1a1a; }
  .bad .body strong { color: #9c1a1a; }
  dl { margin: 0 0 2em; }
  dt { font-weight: 700; margin-top: 1em; }
  dd { margin: .15em 0 0; color: #454c57; }
  .next { background: #f3f5f7; border-radius: 12px; padding: 16px 18px; }
  .next h2 { font-size: 1.1rem; margin: 0 0 .5em; }
  .next ol { margin: 0; padding-left: 1.2em; }
  .next li { display: list-item; border: 0; padding: .25em 0; }
  a { color: #0b4fbe; }
  a:focus-visible { outline: 3px solid #0b4fbe; outline-offset: 2px; border-radius: 3px; }
  @media (prefers-color-scheme: dark) {
    body { color: #eceff3; background: #14161a; }
    p.lead, dd { color: #b3bac4; }
    li { border-color: #333a44; }
    .ok .mark  { color: #58d18a; }
    .bad .mark { color: #ff8f8f; }
    .bad .body strong { color: #ff8f8f; }
    .next { background: #1e222a; }
    a { color: #8ab4ff; }
  }
</style>
</head>
<body>
<main>
  <h1>Проверка сайта</h1>
  <p class="lead">Эта страница показывает, доезжают ли правки из панели управления до сайта.
     Она нужна, когда кажется, что сохранение не сработало.</p>

  <h2>Что проверено</h2>
  <ul>
    <?= row('PHP на хостинге', true,
            'Хостинг умеет запускать программы — панель управления может сохранять правки.',
            'Если вы читаете это как текст программы, PHP на тарифе выключен — панель сохранять не сможет.') ?>
    <?= row('Файл каталога', $hasData,
            'Каталог на месте, размер ' . number_format($size / 1024, 0, ',', ' ') . ' КБ.',
            'Каталога data.js нет в папке сайта. Залейте его на хостинг.') ?>
    <?= row('Права на запись', (bool) $writable,
            'Панель управления может перезаписать каталог.',
            'У файла data.js нет прав на запись. В файловом менеджере хостинга поставьте ему права 664.') ?>
    <?= row('Панель управления', $hasApi,
            'Программа сохранения на месте.',
            'Нет файла api.php — сохранять правки некуда. Его нужно залить на хостинг.') ?>
    <?= row('Мгновенное обновление', $hasLive,
            'Сайт берёт каталог через data.php, поэтому правки видны сразу после сохранения.',
            'Нет файла data.php: браузеры будут показывать старый каталог до полутора месяцев. Залейте data.php на хостинг.') ?>
  </ul>

  <h2>Что сейчас на сайте</h2>
  <dl>
    <dt>Каталог последний раз менялся</dt>
    <dd><?= $mtime ? htmlspecialchars(date('d.m.Y в H:i', $mtime)) . ' — ' . humanAge($ageMin) : 'неизвестно' ?></dd>
    <dt>Позиций в каталоге</dt>
    <dd><?= $offers > 0 ? (int) $offers : 'не удалось посчитать' ?></dd>
  </dl>

  <div class="next">
    <h2>Правка не видна на сайте — что делать</h2>
    <ol>
      <li>Проверьте время выше: если каталог менялся только что, значит сохранение прошло.</li>
      <li>Откройте сайт заново и потяните страницу вниз для обновления — телефон мог показать её из памяти.</li>
      <li>Если время старое, зайдите в панель и нажмите «Сохранить» ещё раз, дождавшись зелёного ответа.</li>
      <li>Если наверху есть красные отметки — покажите эту страницу разработчику, там написано, что чинить.</li>
    </ol>
  </div>
</main>
</body>
</html>
