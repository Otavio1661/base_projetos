<?php

namespace App;

class Config
{
    // ----------------- Definições do banco de dados -----------------
    public const APP_DEBUG = APP_DEBUG;

    // ----------------- Definições de Criptografia -------------------
    public const BASE_CRIPTOGRAFIA = BASE_CRIPTOGRAFIA;

    // ----------------- Definições do banco de dados -----------------
    public const DB_HOST_LG = DB_HOST_LG;
    public const DB_HOST = DB_HOST;
    public const DB_PORT = DB_PORT;
    public const DB_DATABASE = DB_DATABASE;
    public const DB_USERNAME = DB_USERNAME;
    public const DB_PASSWORD = DB_PASSWORD;
    // ----------------------------------------------------------------

    /** /vitrine (documentação ao vivo): liberada com APP_DEBUG=true OU com VITRINE_PUBLICA=true (modo demonstração). */
    public static function vitrineLiberada(): bool
    {
        return self::APP_DEBUG === true || (defined('VITRINE_PUBLICA') && constant('VITRINE_PUBLICA') === true);
    }
}
