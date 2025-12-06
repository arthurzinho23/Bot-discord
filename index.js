const { Client, GatewayIntentBits, Events, EmbedBuilder, Partials } = require('discord.js');
const http = require('http');
const express = require('express');

// --- 🛡️ SISTEMA "MANTER VIVO" (ANTI-SLEEP) ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send({ status: '🤖 Bot Calculadora ON', uptime: process.uptime() }));

app.listen(port, () => {
    console.log(`🌐 Web Server rodando na porta ${port}`);
    // Auto-Ping para não dormir
    setInterval(() => {
        const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
        http.get(url).on('error', (err) => console.log('Ping interno ok.'));
    }, 5 * 60 * 1000); // 5 minutos
});
// -----------------------------------------------------------

console.log('🔄 INICIANDO SISTEMA...');

// ⚙️ CONFIGURAÇÃO
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN, 
    LOG_CHANNEL: '1445105144869032129', 
    COTACAO_CHANNEL: '1446631169054740602', // ID do Fórum/Tópicos
    VIP_ROLE_ID: '1441086318229848185',    // ID do Cargo VIP (Taxa de 10%)
    MIN_AGE_DAYS: 7
};

// --- PREVENÇÃO DE ERROS ---
process.on('uncaughtException', (error) => {
    console.error('❌ ERRO:', error);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // OBRIGATÓRIO PARA LER O VALOR
    ],
    partials: [Partials.GuildMember, Partials.User, Partials.Channel]
});

client.once(Events.ClientReady, c => {
    console.log(`✅ BOT ONLINE: ${c.user.tag}`);
    client.user.setActivity('💸 Calculando Valores');
});

// --- FUNÇÃO PARA ENCONTRAR O VALOR NA FRASE ---
function extrairValor(texto) {
    // Procura por padrões como: 100k, 100.000, 1.5m, 500
    // O Regex busca números seguidos opcionalmente de k ou m
    const regex = /([0-9]+[.,]?[0-9]*)\s*(k|m)?/i;
    const match = texto.replace(/\s/g, '').match(regex);

    if (!match) return 0;

    let numeroLimpo = match[1].replace(/\./g, '').replace(',', '.'); // Troca ponto de milhar e vírgula
    let multiplicador = 1;
    let sufixo = match[2] ? match[2].toLowerCase() : '';

    if (sufixo === 'k') multiplicador = 1000;
    if (sufixo === 'm') multiplicador = 1000000;

    // Ajuste para caso o javascript entenda 100.000 como 100 decimal (comum no Brasil usar ponto para milhar)
    // Se tiver ponto e o número for pequeno (ex: 1.5), é decimal. Se for 100.000, é milhar.
    // Simplificação: assumimos que ponto é milhar se não tiver sufixo K/M e tiver mais de 3 casas, 
    // mas a limpeza acima (.replace) já tira os pontos, então 100.000 vira 100000.
    
    return parseFloat(numeroLimpo) * multiplicador;
}

// ---------------------------------------------------------
// 💰 SISTEMA DE CÁLCULO
// ---------------------------------------------------------
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // Verifica se está no canal certo ou nos tópicos dele
    const isCotacaoChannel = 
        message.channel.id === CONFIG.COTACAO_CHANNEL || 
        message.channel.parentId === CONFIG.COTACAO_CHANNEL;

    if (isCotacaoChannel) {
        // Tenta achar um número na mensagem
        const valorVeiculo = extrairValor(message.content);

        // Se o valor for muito baixo (ex: zero) ou não achou número, ignora para não floodar
        if (!valorVeiculo || valorVeiculo <= 0) return;

        // EFEITO VISUAL "Digitando..."
        await message.channel.sendTyping();

        // --- CÁLCULO DA TAXA ---
        const temCargoVip = message.member.roles.cache.has(CONFIG.VIP_ROLE_ID);
        const porcentagem = temCargoVip ? 10 : 15; // 10% VIP, 15% Normal
        
        const taxa = valorVeiculo * (porcentagem / 100);
        const valorFinal = valorVeiculo + taxa;

        // Formatação em Reais
        const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

        // Definição visual (VIP vs Normal)
        const cor = temCargoVip ? 0xFFD700 : 0x2B2D31; // Dourado ou Cinza Escuro
        const titulo = temCargoVip ? '👑 Cotação VIP Aplicada' : '📋 Cotação Padrão';
        const rodape = temCargoVip ? 'Benefício de taxa reduzida ativo.' : 'Dica: VIPs pagam apenas 10% de taxa.';

        const embed = new EmbedBuilder()
            .setColor(cor)
            .setTitle(titulo)
            .setDescription(`Cálculo automático para **${message.author.username}**`)
            .addFields(
                { name: 'Valor Base', value: `\`${fmt.format(valorVeiculo)}\``, inline: true },
                { name: `Taxa da Cidade (${porcentagem}%)`, value: `\`+ ${fmt.format(taxa)}\``, inline: true },
                { name: '💰 VALOR FINAL DE VENDA', value: `## ${fmt.format(valorFinal)}`, inline: false }
            )
            .setFooter({ text: rodape })
            .setTimestamp();

        // Envia a resposta
        try {
            await message.reply({ embeds: [embed] });
        } catch (err) {
            console.error('Erro ao enviar mensagem:', err);
        }
    }
});

// ---------------------------------------------------------
// 🛡️ SISTEMA DE LOGS DE ENTRADA (Opcional, mantido simples)
// ---------------------------------------------------------
client.on(Events.GuildMemberAdd, async member => {
    try {
        const channel = member.guild.channels.cache.get(CONFIG.LOG_CHANNEL);
        if (channel) {
            const diffDays = Math.floor((new Date() - member.user.createdAt) / (1000 * 60 * 60 * 24));
            channel.send({ content: `📥 **Entrada:** ${member.user.tag} (Conta criada há ${diffDays} dias)` });
        }
    } catch (e) {}
});

client.login(CONFIG.TOKEN);