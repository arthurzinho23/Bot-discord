const https = require('https');

// URL da sua aplicação (Ex: https://seu-bot.onrender.com)
const URL = process.env.APP_URL || 'https://substitua-pela-sua-url-aqui.com';

console.log('⏰ Despertador do Bot iniciado!');

// Função que pinga o servidor a cada 5 minutos
setInterval(() => {
    https.get(URL, (res) => {
        console.log('💤 Ping enviado para evitar hibernação. Status:', res.statusCode);
    }).on('error', (err) => {
        console.error('❌ Erro no Despertador:', err.message);
    });
}, 300000); // 300.000ms = 5 minutos

// Mantém o processo vivo
setInterval(() => {}, 1000);
