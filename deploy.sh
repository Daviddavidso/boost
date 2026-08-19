#!/bin/bash
# ————————————————————————————————————————————————
# Заливка BOOST на хостинг по FTP.
#
#   bash deploy.sh          — залить сайт целиком
#   bash deploy.sh data     — залить только каталог (data.js)
#
# Доступы лежат рядом в .ftp.env (в гит не попадает):
#
#   FTP_HOST="37.140.192.32"
#   FTP_USER="u3607904"
#   FTP_PASS="пароль"
#   FTP_DIR="/www/домен.ru"        # корень сайта на хостинге
#   ADMIN_PASS="пароль от админки"  # уедет в config.php на сервере
# ————————————————————————————————————————————————

set -u
cd "$(dirname "$0")" || exit 1

ENV_FILE=".ftp.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Нет файла $ENV_FILE — положите туда доступы (образец в шапке deploy.sh)."
  exit 1
fi
# shellcheck disable=SC1090
source "./$ENV_FILE"

: "${FTP_HOST:?не задан FTP_HOST}"
: "${FTP_USER:?не задан FTP_USER}"
: "${FTP_PASS:?не задан FTP_PASS}"
: "${FTP_DIR:?не задан FTP_DIR}"

BASE="ftp://${FTP_HOST}${FTP_DIR%/}/"
OK=0
FAIL=0

put() {                       # put <локальный файл> <путь на сервере>
  local src="$1" dst="$2"
  if curl -sS --connect-timeout 20 --max-time 120 --ftp-create-dirs \
        -T "$src" "${BASE}${dst}" --user "$FTP_USER:$FTP_PASS" >/dev/null; then
    echo "  ✓ $dst"
    OK=$((OK + 1))
  else
    echo "  ✗ $dst"
    FAIL=$((FAIL + 1))
  fi
}

chmod_remote() {              # chmod_remote <путь> <права>
  curl -sS --connect-timeout 20 --max-time 60 \
       -Q "SITE CHMOD $2 ${FTP_DIR%/}/$1" "$BASE" \
       --user "$FTP_USER:$FTP_PASS" >/dev/null 2>&1 \
    && echo "  ✓ права $2 на $1" \
    || echo "  · права на $1 поставить не вышло — выставьте вручную в файловом менеджере"
}

# ——— только каталог ———
if [ "${1:-}" = "data" ]; then
  echo "Заливаю каталог в $FTP_DIR"
  put "data.js" "data.js"
  chmod_remote "data.js" 664
  echo "Готово: $OK успешно, $FAIL с ошибкой"
  exit $(( FAIL > 0 ))
fi

# ——— весь сайт ———
echo "Заливаю сайт в $FTP_DIR"

# Сначала выясняем, исполняется ли на хостинге PHP. Тариф Host-Lite его вообще
# не даёт («Данному пользователю запрещено использовать PHP»), и тогда любой
# .php отдаётся исходным текстом — config.php показал бы пароль от админки
# всему интернету, а api.php просто светил бы код. Проверяем отдельным
# пробником, а не самим api.php: его на статичном тарифе мы не заливаем.
SITE_URL="${SITE_URL:-https://$(basename "${FTP_DIR%/}")}"
PHP_LIVE=0
PROBE="_phpcheck.php"
TMP_PROBE="$(mktemp)"
printf '<?php echo "PHP-OK"; ?>' > "$TMP_PROBE"
if curl -sS --connect-timeout 20 --max-time 60 -T "$TMP_PROBE" \
      "${BASE}${PROBE}" --user "$FTP_USER:$FTP_PASS" >/dev/null 2>&1; then
  if curl -sS --max-time 20 "${SITE_URL}/${PROBE}" 2>/dev/null | grep -q '^PHP-OK'; then
    PHP_LIVE=1
  fi
  curl -sS --max-time 30 -Q "DELE ${FTP_DIR%/}/${PROBE}" "$BASE" \
       --user "$FTP_USER:$FTP_PASS" >/dev/null 2>&1
fi
rm -f "$TMP_PROBE"

if [ "$PHP_LIVE" = "1" ]; then
  echo "  · PHP на хостинге работает — заливаю бэкенд панели"
else
  echo "  ! PHP на хостинге НЕ работает (тариф без PHP)."
  echo "    api.php и config.php не заливаю: первый светил бы код,"
  echo "    второй — пароль от админки. Панель работает как черновик в браузере."
fi

# ВНИМАНИЕ ПРО data.js. Каталог на боевом правит клиент через админку, и там
# он новее нашей локальной копии. Обычная заливка его НЕ трогает — иначе
# правки клиента молча затрутся. Залить каталог принудительно:
#   bash deploy.sh --with-data
WITH_DATA=""
if [ "${1:-}" = "--with-data" ]; then WITH_DATA="data.js"; fi

for f in index.html .htaccess $WITH_DATA; do
  put "$f" "$f"
done

if [ "$PHP_LIVE" = "1" ]; then
  put "api.php" "api.php"
  # data.php отдаёт каталог мимо кеша nginx, check.php — страница
  # самопроверки для клиента. Без PHP оба файла бесполезны.
  put "data.php" "data.php"
  put "check.php" "check.php"
fi

# Панель уезжает на сервер под именем panel.html: reg.ru заворачивает любой
# путь со словом "admin" в антибот-проверку и /admin.html уходит в вечный
# редирект (?attempt=1, ?attempt=2, …).
put "admin.html" "panel.html"

for f in assets/*.css assets/*.js; do
  [ -f "$f" ] && put "$f" "$f"
done

for f in assets/logos/*; do
  [ -f "$f" ] && put "$f" "$f"
done

# config.php собираем на лету: пароль от админки живёт в .ftp.env,
# в репозиторий он не попадает. Заливаем только если PHP жив (см. проверку выше).
if [ -n "${ADMIN_PASS:-}" ] && [ "$PHP_LIVE" = "1" ]; then
  TMP_CFG="$(mktemp)"
  cat > "$TMP_CFG" <<PHP
<?php
/* Настройки панели управления BOOST. Файл закрыт .htaccess. */

return [
    'password' => '${ADMIN_PASS}',
];
PHP
  put "$TMP_CFG" "config.php"
  rm -f "$TMP_CFG"
elif [ -z "${ADMIN_PASS:-}" ]; then
  echo "  · ADMIN_PASS не задан — config.php не трогаю"
fi

# README на хостинг не заливаем: в нём пароль по умолчанию.

echo
echo "Права:"
chmod_remote "data.js" 664

echo
echo "Готово: $OK успешно, $FAIL с ошибкой"
echo "Проверьте: сайт открывается, /panel.html пускает по паролю,"
echo "а /config.php отдаёт 403 (или 404, если PHP выключен)."
exit $(( FAIL > 0 ))
