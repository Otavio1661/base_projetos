/**
 * ============================================
 * r4.js - Biblioteca de Criptografia e Requisições
 * ============================================
 * 
 * @author Otavio
 * @github https://github.com/Otavio1661
 * @version 1.0.0
 * @created 2025-12-17
 * 
 * Biblioteca JavaScript para criptografia de dados
 * usando AES-GCM 256 bits e requisições HTTP seguras.
 * 
 * ============================================
 */

const r4 = {
    // Função para criptografar dados usando AES
    encryptData: async function(data) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(JSON.stringify(data));
        
        // Gerar uma chave de criptografia a partir de uma senha
        const cryptoKey = window.BASE_CRIPTOGRAFIA;
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            encoder.encode(cryptoKey), // Chave base (deve ser a mesma no backend)
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );
        
        // Gerar salt aleatório
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        
        // Derivar chave usando PBKDF2
        const key = await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt"]
        );
        
        // Gerar IV aleatório
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        
        // Criptografar dados
        const encryptedBuffer = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            dataBuffer
        );
        
        // Converter para base64 para transmissão
        const encryptedArray = new Uint8Array(encryptedBuffer);
        const saltBase64 = btoa(String.fromCharCode(...salt));
        const ivBase64 = btoa(String.fromCharCode(...iv));
        const encryptedBase64 = btoa(String.fromCharCode(...encryptedArray));
        
        return {
            x: encryptedBase64,  // data
            y: saltBase64,       // salt
            z: ivBase64          // iv
        };
    },

    fetch: async function(url, method = 'GET', data = null) {
        const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(await this.encryptData(data))
            });

        return response.json();
    }
};
