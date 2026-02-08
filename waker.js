// --- WAKER.JS: SISTEMA ANTI-SONO ---
// Este script é importado automaticamente pelo index.js.
// Ele pinga o próprio bot a cada 3 minutos para evitar que o Render/Replit o coloque em suspensão (Sleep Mode).

import https from 'https';
import http from 'http';

// Tenta pegar a URL externa (Render/Heroku) ou usa localhost como fallback
// DICA: No Render, configure a variável de ambiente RENDER_EXTERNAL_URL com a url do seu app (ex: https://meu-bot.onrender.com)
const URL = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';

console.log(`⏰ [WAKER] Sistema de vigília iniciado. Alvo: ${URL}`);

const ping = () => {
    const isHttps = URL.startsWith('https');
    const protocol = isHttps ? https : http;
    
    const start = Date.now();
    const req = protocol.get(URL, (res) => {
        const duration = Date.now() - start;
        // Apenas loga se o status for 200 para não poluir, ou se for erro
        if (res.statusCode === 200) {
            // Ping silencioso para sucesso
            // console.log(`[WAKER] Ping OK (${duration}ms) - Bot acordado.`);
        } else {
            console.warn(`[WAKER] Aviso: Recebido status ${res.statusCode} do servidor.`);
        }
    });

    req.on('error', (err) => {
        console.error(`[WAKER] ERRO AO PINGAR: ${err.message}. Verifique se o bot está rodando.`);
    });
    
    req.end();
};

// Ping inicial (aguarda 5s para o server subir)
setTimeout(ping, 5000);

// Pinga a cada 3 minutos (180.000ms) - Mais frequente que os 15min de timeout padrão
setInterval(() => {
    console.log(`[WAKER] Enviando ping de manutenção...`);
    ping();
}, 180000);