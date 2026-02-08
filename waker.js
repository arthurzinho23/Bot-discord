// --- WAKER.JS: MANTENHA O BOT ACORDADO ---
// Este script é essencial para plataformas como Render, Replit ou Glitch.
// Ele faz um "ping" no servidor HTTP do bot a cada 5 minutos para impedir que ele entre em suspensão.

import https from 'https';
import http from 'http';
import 'dotenv/config';

// Tenta pegar a URL externa (Render/Heroku) ou usa localhost
const URL = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';

console.log(`⏰ Waker iniciado! Vou manter o bot acordado pingando: ${URL}`);

const ping = () => {
    const protocol = URL.startsWith('https') ? https : http;
    
    const req = protocol.get(URL, (res) => {
        console.log(`[PING] ${new Date().toLocaleTimeString('pt-BR')} - Status: ${res.statusCode} - Bot Acordado!`);
    });

    req.on('error', (err) => {
        console.error(`[ERRO] Falha ao acordar o bot: ${err.message}`);
    });
    
    req.end();
};

// Ping imediato ao iniciar
ping();

// Repetir a cada 5 minutos (300.000ms)
// A maioria dos free tiers dorme após 15min de inatividade.
setInterval(ping, 300000);