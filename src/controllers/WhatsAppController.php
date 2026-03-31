<?php

namespace src\controllers;

use core\Controller as ctrl;

class WhatsAppController extends ctrl
{
    private $evolutionUrl;
    private $apiKey;
    private $instance;

    public function __construct()
    {
        $this->evolutionUrl = defined('EVOLUTION_URL') ? rtrim((string) EVOLUTION_URL, '/') : 'http://evolution-api:8080';
        $this->apiKey = defined('EVOLUTION_API_KEY') ? (string) EVOLUTION_API_KEY : '';
        $this->instance = defined('EVOLUTION_INSTANCE') ? (string) EVOLUTION_INSTANCE : 'default';
    }

    public function send()
    {
        $input = file_get_contents('php://input');
        $payload = json_decode($input, true);

        if (!is_array($payload)) {
            $payload = [];
        }

        $number = isset($payload['number']) ? preg_replace('/\D+/', '', (string) $payload['number']) : '';
        $text = isset($payload['text']) ? trim((string) $payload['text']) : '';
        $delay = isset($payload['delay']) ? (int) $payload['delay'] : 1200;

        if ($number === '' || $text === '') {
            $this->json([
                'status' => 'error',
                'message' => 'Campos obrigatórios: number e text'
            ], 400);
            return;
        }
        if (strlen($number) < 10 || strlen($number) > 15) {
            $this->json([
                'status' => 'error',
                'message' => 'Número inválido. Use DDI + DDD + número, apenas dígitos.'
            ], 400);
            return;
        }

        if ($this->apiKey === '') {
            $this->json([
                'status' => 'error',
                'message' => 'EVOLUTION_API_KEY não configurada'
            ], 500);
            return;
        }

        $url = $this->evolutionUrl . '/message/sendText/' . rawurlencode($this->instance);
        $body = json_encode([
            'number' => $number,
            'text' => $text,
            'delay' => $delay
        ]);

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'apikey: ' . $this->apiKey
        ]);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);

        $response = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            $this->json([
                'status' => 'error',
                'message' => 'Falha ao comunicar com Evolution API',
                'detail' => $curlError
            ], 502);
            return;
        }

        $decoded = json_decode((string) $response, true);

        if ($httpCode >= 200 && $httpCode < 300) {
            $this->json([
                'status' => 'sent',
                'response' => $decoded ?? $response
            ], 200);
            return;
        }

        $this->json([
            'status' => 'error',
            'code' => $httpCode,
            'response' => $decoded ?? $response
        ], ($httpCode >= 400 && $httpCode <= 599) ? $httpCode : 502);
    }
}
