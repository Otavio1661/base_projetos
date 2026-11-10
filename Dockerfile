# PHP 8.5.12 com Apache (versão corrigida p/ CVE-2026-109618/9; não usar < 8.5.12)
FROM php:8.5.12-apache

# unzip/zip para o Composer baixar pacotes como dist
RUN apt-get update && apt-get install -y --no-install-recommends unzip libzip-dev \
    && docker-php-ext-install zip \
    && rm -rf /var/lib/apt/lists/*

# Instala extensões necessárias para MySQL
RUN docker-php-ext-install mysqli pdo pdo_mysql

# Mitigação CVE-2026-115560 (sem correção oficial ainda)
RUN echo 'session.upload_progress.enabled=0' > /usr/local/etc/php/conf.d/zz-seguranca.ini

# Habilita mod_rewrite do Apache
RUN a2enmod rewrite

# Ajusta DocumentRoot para a pasta public
RUN sed -i 's!/var/www/html!/var/www/html/public!g' /etc/apache2/sites-available/000-default.conf

# Copia arquivos do projeto
COPY . /var/www/html/

# Copia o Composer para dentro do container
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Ajusta permissões
RUN chown -R www-data:www-data /var/www/html

# Instala dependências do Composer (dentro do container)
RUN composer install --no-dev --optimize-autoloader --working-dir=/var/www/html

# Porta que o Apache vai expor
EXPOSE 80

# Comando padrão
CMD ["apache2-foreground"]
