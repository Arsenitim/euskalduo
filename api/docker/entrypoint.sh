#!/bin/sh
set -e
# Generate a persistent APP_SECRET in the data volume unless one is provided.
if [ -z "${APP_SECRET}" ]; then
    if [ ! -s "${DATA_DIR}/app-secret" ]; then
        (umask 077 && php -r 'echo bin2hex(random_bytes(32));' > "${DATA_DIR}/app-secret")
    fi
    APP_SECRET="$(cat "${DATA_DIR}/app-secret")"
    export APP_SECRET
fi
php bin/init.php
exec php-fpm
