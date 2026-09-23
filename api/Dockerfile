# syntax=docker/dockerfile:1
# Build context: repository root (the image also contains ./samples).

FROM php:8.4-fpm-alpine AS base
RUN apk add --no-cache icu-libs libpng libjpeg-turbo libwebp freetype \
 && apk add --no-cache --virtual .build-deps $PHPIZE_DEPS icu-dev libpng-dev libjpeg-turbo-dev libwebp-dev freetype-dev \
 && docker-php-ext-configure gd --with-jpeg --with-webp \
 && docker-php-ext-install -j"$(nproc)" gd intl opcache \
 && apk del .build-deps \
 && rm /usr/local/etc/php-fpm.d/zz-docker.conf
COPY api/docker/php.ini /usr/local/etc/php/conf.d/zz-euskalduo.ini
COPY api/docker/fpm.conf /usr/local/etc/php-fpm.d/zz-euskalduo.conf
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /app
ENV APP_ENV=prod APP_DEBUG=0 DATA_DIR=/data UPLOAD_DIR=/uploads SAMPLE_DIR=/app/samples
RUN mkdir -p /data /uploads && chown www-data:www-data /data /uploads

FROM base AS dev
# Used for running the test suite: docker compose run --rm api-test
ENV APP_ENV=test
COPY api/composer.json api/composer.lock ./
RUN composer install --no-interaction --no-progress --no-scripts
COPY api/ ./
COPY samples/ ./samples/
CMD ["vendor/bin/phpunit"]

FROM base AS prod
COPY api/composer.json api/composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress --no-scripts --classmap-authoritative
COPY api/bin ./bin
COPY api/public ./public
COPY api/src ./src
COPY --chmod=755 api/docker/entrypoint.sh /usr/local/bin/euskalduo-entrypoint
COPY samples/ ./samples/
RUN composer dump-autoload --no-dev --classmap-authoritative \
 && APP_SECRET=build php -r 'require "vendor/autoload.php"; (new App\Kernel("prod", false))->boot();' \
 && chown -R www-data:www-data var
USER www-data
EXPOSE 9000
CMD ["euskalduo-entrypoint"]
