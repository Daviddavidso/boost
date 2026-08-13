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

for f in index.html admin.html data.js api.php .htaccess; do
  put "$f" "$f"
done

for f in assets/*.css assets/*.js; do
  [ -f "$f" ] && put "$f" "$f"
done

for f in assets/logos/*; do
  [ -f "$f" ] && put "$f" "$f"
done

# config.php собираем на лету: пароль от админки живёт в .ftp.env,
# в репозиторий он не попадает.
if [ -n "${ADMIN_PASS:-}" ]; then
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
else
  echo "  · ADMIN_PASS не задан — config.php не трогаю"
fi

# README на хостинг не заливаем: в нём пароль по умолчанию.

echo
echo "Права:"
chmod_remote "data.js" 664

echo
echo "Готово: $OK успешно, $FAIL с ошибкой"
echo "Проверьте: сайт открывается, /admin.html пускает по паролю,"
echo "а /config.php отдаёт 403."
exit $(( FAIL > 0 ))
