/* whatsapp-bridge.js
   Bridge HTTP -> whatsapp-web.js
   Coloque na raiz do projeto e rode `npm install` e `node whatsapp-bridge.js`
*/

const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode');

const app = express();
app.use(bodyParser.json({ limit: '2mb' }));

// Persistência de sessão em pasta do projeto (maximiza tempo de sessão)
const sessionPath = path.join(__dirname, 'whatsapp-session');

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'apiwhatsapp',
    dataPath: sessionPath
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

let latestQr = null;
let isReady = false;

client.on('qr', (qr) => {
  console.log('[whatsapp] QR RECEIVED - acesse /qr para ver a imagem');
  latestQr = qr;
});

client.on('ready', () => {
  console.log('[whatsapp] Cliente pronto');
  latestQr = null;
  isReady = true;
});

client.on('authenticated', () => {
  console.log('[whatsapp] Autenticado com sucesso');
});

client.on('auth_failure', msg => {
  console.error('[whatsapp] AUTH FAILURE', msg);
  isReady = false;
});

client.on('disconnected', (reason) => {
  console.log('[whatsapp] Desconectado', reason);
  isReady = false;
});

client.initialize().catch(err => {
  console.error('[whatsapp] Erro ao inicializar cliente:', err);
});

app.get('/qr', async (req, res) => {
  if (!latestQr) return res.status(404).json({ message: 'No QR available (maybe already authenticated).' });
  try {
    const dataUrl = await qrcode.toDataURL(latestQr);
    const img = dataUrl.split(',')[1];
    const imgBuf = Buffer.from(img, 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': imgBuf.length
    });
    res.end(imgBuf);
  } catch (e) {
    console.error('[whatsapp] Erro ao gerar QR:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/status', (req, res) => {
  res.json({ ready: isReady });
});

app.post('/send', async (req, res) => {
  const { number, message } = req.body;

  if (!number || !message) return res.status(400).json({ error: 'number and message required' });

  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp client not ready' });
  }

  // Normaliza número (apenas dígitos)
  let normalized = String(number).replace(/[^0-9]/g, '');
  if (normalized.length < 4) return res.status(400).json({ error: 'Número inválido' });

  // Código do país padrão (opcional) - configure via env WHATSAPP_DEFAULT_CC
  const defaultCC = process.env.WHATSAPP_DEFAULT_CC || null;
  const tried = [];

  async function tryResolve(num) {
    try {
      const n = await client.getNumberId(num);
      return n || null;
    } catch (e) {
      console.error('[whatsapp] getNumberId error for', num, e && e.message ? e.message : e);
      return null;
    }
  }

  try {
    // 1) tenta com o número informado
    tried.push(normalized);
    let numberId = await tryResolve(normalized);

    // 2) se não encontrado, tenta com código de país padrão (se configurado)
    if (!numberId && defaultCC) {
      const withCc = defaultCC + normalized;
      tried.push(withCc);
      numberId = await tryResolve(withCc);
      if (numberId) normalized = withCc; // atualiza para envio
    }

    // 3) se ainda não encontrou, retorna erro claro
    if (!numberId) {
      console.warn('[whatsapp] number not registered. tried:', tried);
      return res.status(404).json({ error: 'Número não cadastrado no WhatsApp', tried });
    }

    const jid = numberId._serialized || `${normalized}@c.us`;

    // Envia a mensagem
    const sendResult = await client.sendMessage(jid, message);
    return res.json({ status: 'sent', id: sendResult && sendResult.id ? sendResult.id._serialized : null });
  } catch (err) {
    // Log completo para diagnóstico
    console.error('[whatsapp] Send error', err && err.stack ? err.stack : err);

    const msg = err && err.message ? err.message : String(err);

    // Caso comum: erro vindo do contexto do puppeteer/WhatsApp (ex: No LID for user)
    if (msg && msg.indexOf && msg.indexOf('No LID for user') !== -1) {
      return res.status(500).json({ error: 'No LID for user', detail: 'Número inválido ou usuário não está no WhatsApp (verifique DDI e se a conta existe).' });
    }

    return res.status(500).json({ error: 'send_failed', detail: msg });
  }
});

app.get('/', (req, res) => res.json({ ok: true, ready: isReady }));

const PORT = process.env.WHATSAPP_BRIDGE_PORT || 3000;
app.listen(PORT, () => console.log(`[bridge] Listening on http://localhost:${PORT}`));
