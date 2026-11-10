# PHP 8.5.12 FPM (versão corrigida p/ CVE-2026-109618/9; não usar < 8.5.12)
# O servidor web é o Nginx (ver docker-compose.yml e docker/nginx/default.conf)
FROM php:8.5.12-fpm

# unzip/zip para o Composer baixar pacotes como dist
RUN apt-get update && apt-get install -y --no-install-recommends unzip libzip-dev \
    && docker-php-ext-install zip \
    && rm -rf /var/lib/apt/lists/*

# Extensões necessárias para MySQL
RUN docker-php-ext-install mysqli pdo pdo_mysql

# Ajustes de segurança/performance do PHP
COPY docker/php/zz-app.ini /usr/local/etc/php/conf.d/zz-app.ini

# Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html
COPY . /var/www/html/

# Dependências de produção (dentro do container)
RUN composer install --no-dev --optimize-autoloader --working-dir=/var/www/html \
    && chown -R www-data:www-data /var/www/html

EXPOSE 9000
CMD ["php-fpm"]
