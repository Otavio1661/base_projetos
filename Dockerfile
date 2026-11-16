# PHP 8.5.12 FPM (versão corrigida p/ CVE-2026-109618/9; não usar < 8.5.12)
# O servidor web é o Nginx (ver docker-compose.yml e docker/nginx/default.conf)
FROM php:8.5.12-fpm

# unzip/zip para o Composer baixar pacotes como dist
RUN apt-get update && apt-get install -y --no-install-recommends unzip libzip-dev \
    && docker-php-ext-install zip \
    && rm -rf /var/lib/apt/lists/*

# Extensões necessárias para MySQL
RUN docker-php-ext-install mysqli pdo pdo_mysql

# Ajustes de segurança/performance do PHP (todos os SAPIs) e endurecimento SÓ do PHP-FPM
# (disable_functions, allow_url_fopen=Off, open_basedir — no pool, para não quebrar composer/geradores na CLI).
# "php-fpm -t" valida a configuração já no build (erro de sintaxe derruba o build, não a produção).
COPY docker/php/zz-app.ini /usr/local/etc/php/conf.d/zz-app.ini
COPY docker/php/zz-fpm-seguranca.conf /usr/local/etc/php-fpm.d/zz-seguranca.conf
RUN php-fpm -t

# Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html
COPY . /var/www/html/

# Dependências de produção (dentro do container). storage/ (uploads, chave de dev, nonces anti-replay)
# é a única pasta onde o PHP precisa escrever; o resto do código fica só para leitura do www-data.
RUN composer install --no-dev --optimize-autoloader --working-dir=/var/www/html \
    && mkdir -p /var/www/html/storage/cache/nonces \
    && chown -R root:www-data /var/www/html \
    && chmod -R g-w,o-rwx /var/www/html \
    && chown -R www-data:www-data /var/www/html/storage \
    && chmod -R u+rwX,g-rwx,o-rwx /var/www/html/storage

EXPOSE 9000
CMD ["php-fpm"]
