# PHP 8.2 com Apache
FROM php:8.2-apache

# Instala extensões necessárias para MySQL
RUN docker-php-ext-install mysqli pdo pdo_mysql

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
RUN composer install --working-dir=/var/www/html

# Porta que o Apache vai expor
EXPOSE 80

# Comando padrão
CMD ["apache2-foreground"]
