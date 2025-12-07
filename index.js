const { 
    Client, 
    GatewayIntentBits, 
    Events, 
    EmbedBuilder, 
    Partials, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionFlagsBits,
    AuditLogEvent
} = require('discord.js');

const express = require('express');
const https = require('https');
const { GoogleGenAI } = require("@google/genai");

// --- CONFIGURAÇÃO ---
require('dotenv').config(); 

const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    GEMINI_KEY: process.env.GEMINI_API_KEY, 
    
    // IDs DE CANAIS
    ENTRY_CHANNEL: '1445105097796223078', // ✅ Canal de Entrada
    EXIT_CHANNEL: '1445105144869032129',  // ✅ Canal de Saída (Log Admin)
    COTACAO_CHANNEL: '1446631169054740602', // ✅ Canal de Cotação (Suporta Fórum)
    
    // IDs DE CARGOS
    BOOSTER_ROLE_ID: '1441086318229848185', // ✅ Cargo Booster (antigo VIP)
    
    MIN_AGE_DAYS: 7,
    AUTO_KICK: false,
    PORT: process.env.PORT || 3000
};

// Função para extrair números (Suporta 50k, 1m, R$ 50.000)
function extrairValor(texto) {
    if (!texto) return 0;
    // Normaliza o texto: minúsculo, remove R$, substitui vírgula por ponto
    const cleanText = texto.toLowerCase().replace(/r\$/g, '').replace(/\./g, '').replace(/,/g, '.');

    // Verifica sufixo 'k' (milhares) ex: 50k -> 50000
    if (cleanText.includes('k')) {
        const match = cleanText.match(/(\d+(\.\d+)?)k/);
        return match ? parseFloat(match[1]) * 1000 : 0;
    }
    
    // Verifica sufixo 'm' (milhões) ex: 1m -> 1000000
    if (cleanText.includes('m')) {
        const match = cleanText.match(/(\d+(\.\d+)?)m/);
        return match ? parseFloat(match[1]) * 1000000 : 0;
    }

    // Padrão numérico simples
    const match = cleanText.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
}

// Delay auxiliar
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- SERVIDOR WEB (Para manter online no Render) ---
const app = express();
app.get('/', (req, res) => res.send({ status: 'Guardian Online', mode: 'Admin Logs + Forum Support' }));
app.listen(CONFIG.PORT, () => {
    console.log(`🌐 Sistema Online na porta ${CONFIG.PORT}`);
    // Ping automático para evitar hibernação (opcional, pois o Render faz isso)
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) {
        setInterval(() => https.get(`${renderUrl}`).on('error', (err) => console.error('Ping Error:', err.message)), 5 * 60 * 1000);
    }
});

// --- IA ---
let aiClient;
if (CONFIG.GEMINI_KEY) {
    try {
        aiClient = new GoogleGenAI({ apiKey: CONFIG.GEMINI_KEY });
        console.log('🧠 IA Gemini Conectada.');
    } catch (err) { 
        console.error('Erro ao conectar IA:', err.message); 
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Essencial para ler o valor
        GatewayIntentBits.GuildModeration
    ],
    partials: [
        Partials.GuildMember, 
        Partials.User, 
        Partials.Channel, // Importante para canais de Fórum
        Partials.Message
    ]
});

// =========================================================
// 📌 MENSAGENS (COMANDOS + COTAÇÃO + IA)
// =========================================================
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // --- COMANDOS ---
    if (message.content === '!lock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Sem permissão.');
        // Em fórum, trancar pode ser diferente (setLocked), mas mantendo genérico:
        if (message.channel.isThread()) {
            await message.channel.setLocked(true);
            return message.reply('🔒 **Tópico Trancado.**');
        }
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.reply('🔒 **BLOQUEIO:** Canal trancado.');
    }

    if (message.content === '!unlock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Sem permissão.');
        if (message.channel.isThread()) {
            await message.channel.setLocked(false);
            return message.reply('🔓 **Tópico Destrancado.**');
        }
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        return message.reply('🔓 **DESBLOQUEIO:** Canal aberto.');
    }

    // --- COTAÇÃO (Compatível com FÓRUM) ---
    // Verifica se é o canal exato OU se o "pai" do canal (caso seja um tópico/thread) é o canal de cotação
    const isCotacaoChannel = 
        message.channel.id === CONFIG.COTACAO_CHANNEL || 
        message.channel.parentId === CONFIG.COTACAO_CHANNEL;

    if (isCotacaoChannel) {
        // Se for um tópico de fórum, combinamos o conteúdo da mensagem com o NOME do tópico (Título)
        // Isso ajuda se a pessoa colocou o preço no título: "Vendo Carro [50k]"
        let textoParaAnalise = message.content;
        
        if (message.channel.isThread()) {
            textoParaAnalise += ' ' + message.channel.name;
        }

        const valorVeiculo = extrairValor(textoParaAnalise);

        if (valorVeiculo > 0) {
            const isBooster = message.member.roles.cache.has(CONFIG.BOOSTER_ROLE_ID);
            const porcentagem = isBooster ? 10 : 15;
            const taxa = valorVeiculo * (porcentagem / 100);
            const valorFinal = valorVeiculo + taxa;
            const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
            const cor = isBooster ? 0xFF73FA : 0x2B2D31; 
            
            const embed = new EmbedBuilder()
                .setColor(cor)
                .setTitle(isBooster ? '🚀 Cotação Booster' : '📋 Cotação Padrão')
                .setDescription(`Cálculo para **${message.author.username}**`)
                .addFields(
                    { name: 'Valor Base', value: `\`${fmt.format(valorVeiculo)}\``, inline: true },
                    { name: `Taxa (${porcentagem}%)`, value: `\`+ ${fmt.format(taxa)}\``, inline: true },
                    { name: '💰 VALOR FINAL', value: `## ${fmt.format(valorFinal)}`, inline: false }
                )
                .setFooter({ text: isBooster ? 'Benefício de Booster aplicado.' : 'Boosters pagam apenas 10% de taxa.' })
                .setTimestamp();

            return await message.reply({ embeds: [embed] }).catch(console.error);
        }
    }

    // --- IA ---
    if (message.mentions.has(client.user)) {
        if (!aiClient) return message.reply("⚠️ **Erro:** Minha API Key não foi configurada.");
        await message.channel.sendTyping();
        try {
            const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim();
            if (!prompt) return message.reply("Fala comigo!");

            const systemPrompt = "Você é o Guardião, um bot moderador zoeiro e direto.";
            const response = await aiClient.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { systemInstruction: systemPrompt }
            });
            const text = response.text || "Sem resposta.";
            if (text.length > 2000) await message.reply(text.substring(0, 1997) + '...');
            else await message.reply(text);
        } catch (error) {
            console.error("Erro IA:", error);
            message.reply("❌ Erro no processamento.");
        }
    }
});

// =========================================================
// 👋 LOG DE ENTRADA (ADMINISTRAÇÃO)
// =========================================================
client.on(Events.GuildMemberAdd, async member => {
    try {
        const channel = member.guild.channels.cache.get(CONFIG.ENTRY_CHANNEL);
        if (!channel?.isTextBased()) return;

        const createdAt = member.user.createdAt;
        const diffDays = Math.floor((Date.now() - createdAt) / 86400000);
        const isSuspicious = diffDays < CONFIG.MIN_AGE_DAYS;
        const dateString = createdAt.toLocaleDateString('pt-BR');

        const embed = new EmbedBuilder()
            .setColor(isSuspicious ? 0xED4245 : 0x57F287)
            .setAuthor({ name: 'Registro de Entrada', iconURL: member.guild.iconURL() })
            .setTitle(isSuspicious ? '⚠️ Conta Recente Detectada' : '📥 Entrada de Membro')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setDescription(`O usuário ${member} (` + '\