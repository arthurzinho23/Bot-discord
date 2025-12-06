const { Client, GatewayIntentBits, Events, EmbedBuilder, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const http = require('http');
const express = require('express');

// --- 🛡️ SISTEMA "MANTER VIVO" (ANTI-SLEEP) ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send({ status: '🛡️ Guardian Online', uptime: process.uptime() });
});

app.listen(port, () => {
    console.log(`🌐 Web Server rodando na porta ${port}`);
    // Auto-Ping a cada 10 minutos
    setInterval(() => {
        const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
        http.get(url).on('error', (err) => console.log('Ping erro (normal na inicialização)'));
    }, 10 * 60 * 1000);
});
// -----------------------------------------------------------

console.log('🔄 INICIANDO SISTEMA...');

// ⚙️ CONFIGURAÇÃO
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN, 
    LOG_CHANNEL: '1445105144869032129', // Canal de Logs de Entrada/Saída
    COTACAO_CHANNEL: '1446631169054740602', // ID do CANAL DE FÓRUM/TÓPICOS
    MIN_AGE_DAYS: 7
};

// --- PREVENÇÃO DE ERROS ---
process.on('uncaughtException', (error) => {
    console.error('❌ ERRO:', error);
    if (error.message.includes('DisallowedIntents')) {
        console.error('⚠️ ATENÇÃO: ATIVE "MESSAGE CONTENT INTENT" NO SITE DO DISCORD!');
    }
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // <--- OBRIGATÓRIO PARA LER SEM MENÇÃO
    ],
    partials: [Partials.GuildMember, Partials.User, Partials.Channel]
});

client.once(Events.ClientReady, c => {
    console.log(`✅ BOT ONLINE: ${c.user.tag}`);
    client.user.setActivity('👀 Monitorando Cotações');
});

// ---------------------------------------------------------
// 💰 SISTEMA DE RESPOSTA AUTOMÁTICA (COTAÇÃO EM TÓPICOS)
// ---------------------------------------------------------
client.on(Events.MessageCreate, async (message) => {
    // 1. Ignorar mensagens do próprio bot ou de outros bots
    if (message.author.bot) return;

    // 2. Verificar se a mensagem veio do Canal de Cotação (ou de um tópico dentro dele)
    // message.channel.id = ID do tópico onde a msg foi enviada
    // message.channel.parentId = ID do Canal de Fórum Pai
    const isCotacaoChannel = 
        message.channel.id === CONFIG.COTACAO_CHANNEL || 
        message.channel.parentId === CONFIG.COTACAO_CHANNEL;

    if (isCotacaoChannel) {
        
        // --- LÓGICA DE RESPOSTA ---
        // Aqui você define se ele responde a TUDO ou apenas palavras-chave.
        
        const conteudo = message.content.toLowerCase();
        
        // Exemplo: Se quiser responder apenas se tiverem palavras chaves, descomente a linha abaixo:
        // if (!conteudo.includes('preço') && !conteudo.includes('cotação') && !conteudo.includes('orçamento')) return;

        // EFEITO VISUAL "Digitando..."
        await message.channel.sendTyping();

        // RESPOSTA
        // Você pode mudar essa mensagem conforme sua necessidade
        const embedCotacao = new EmbedBuilder()
            .setColor(0x00FF00) // Verde
            .setTitle('💰 Solicitação Recebida!')
            .setDescription(`Olá **${message.author.username}**, vi que você está interessado no tópico.`)
            .addFields(
                { name: 'O que fazer agora?', value: 'Nossa equipe analisará seu pedido. Por favor, aguarde ou forneça mais detalhes abaixo.' }
            )
            .setFooter({ text: 'Sistema de Atendimento Automático' });

        // Envia a resposta respondendo à mensagem do usuário
        try {
            await message.reply({ embeds: [embedCotacao] });
            console.log(`💬 Respondi uma cotação para ${message.author.tag}`);
        } catch (err) {
            console.error('Erro ao responder cotação:', err);
        }
    }
});

// ---------------------------------------------------------
// 🛡️ SISTEMA DE SEGURANÇA (MANTIDO DO CÓDIGO ANTERIOR)
// ---------------------------------------------------------
const createProgressBar = (days, minDays) => {
    const percentage = Math.min(days / minDays, 1);
    return '█'.repeat(Math.floor(percentage * 10)) + '░'.repeat(10 - Math.floor(percentage * 10));
};

client.on(Events.GuildMemberAdd, async member => {
    try {
        const diffDays = Math.floor((new Date() - member.user.createdAt) / (1000 * 60 * 60 * 24));
        const isSuspicious = diffDays < CONFIG.MIN_AGE_DAYS;
        const color = isSuspicious ? 0xED4245 : 0x57F287; 

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(isSuspicious ? '⛔ CONTA DE RISCO' : '✅ CONTA SEGURA')
            .setDescription(`Usuário: ${member.user} entrou.\nIdade: **${diffDays} dias**\n${createProgressBar(diffDays, 30)}`)
            .setThumbnail(member.user.displayAvatarURL());

        const channel = member.guild.channels.cache.get(CONFIG.LOG_CHANNEL);
        if (channel) channel.send({ embeds: [embed] });

    } catch (e) { console.error(e); }
});

client.login(CONFIG.TOKEN);