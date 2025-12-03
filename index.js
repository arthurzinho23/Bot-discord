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
const { GoogleGenAI } = require("@google/genai");

// --- CONFIGURAÇÃO ---
const CONFIG = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    ENTRY_CHANNEL_ID: '1445105097796223078', // ID do canal de entrada
    EXIT_CHANNEL_ID: '1445105144869032129',  // ID do canal de saída
    MIN_AGE_DAYS: 7,
    PORT: process.env.PORT || 3000
};

// --- SERVIDOR WEB (Necessário para o Render não dar erro) ---
const app = express();

app.get('/', (req, res) => {
    res.json({ 
        status: 'Online', 
        bot: 'Guardian', 
        ia: CONFIG.GEMINI_KEY ? 'Ativa' : 'Desativada (Sem Key)' 
    });
});

app.get('/ping', (req, res) => res.send('Pong!'));

app.listen(CONFIG.PORT, () => {
    console.log(`🌍 Web Server rodando na porta ${CONFIG.PORT}`);
});

// --- CLIENTE DISCORD ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.GuildMember, Partials.User]
});

// --- CONFIGURAÇÃO DA IA ---
let aiClient = null;

if (CONFIG.GEMINI_KEY) {
    try {
        aiClient = new GoogleGenAI({ apiKey: CONFIG.GEMINI_KEY });
        console.log("🧠 IA Gemini conectada.");
    } catch (e) {
        console.error("Erro ao iniciar IA:", e);
    }
} else {
    console.log("⚠️ SEM API KEY: O bot funcionará apenas para moderação.");
}

// --- EVENTOS ---

client.once(Events.ClientReady, c => {
    console.log(`✅ Bot logado como ${c.user.tag}`);
    client.user.setActivity('🛡️ Segurança Ativa');
});

// Chat Inteligente
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!message.mentions.has(client.user)) return;

    // Se não tiver chave, avisa e não faz nada
    if (!aiClient) {
        return message.reply("Minha inteligência artificial não está configurada (Falta API Key), mas estou protegendo o servidor!");
    }

    try {
        await message.channel.sendTyping();
        const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim();
        
        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt || "Olá!",
            config: { systemInstruction: "Você é um assistente de Discord útil e breve." }
        });
        
        const text = response.text || "Não consegui formular uma resposta.";
        
        if (text.length > 2000) {
            message.reply(text.substring(0, 1990) + "...");
        } else {
            message.reply(text);
        }
    } catch (error) {
        console.error("Erro IA:", error);
        message.reply("Erro ao processar mensagem.");
    }
});

// Entrada de Membro
client.on(Events.GuildMemberAdd, async member => {
    try {
        const channel = member.guild.channels.cache.get(CONFIG.ENTRY_CHANNEL_ID);
        if (!channel) return;

        const diffDays = Math.floor((Date.now() - member.user.createdAt) / 86400000);
        const isSuspicious = diffDays < CONFIG.MIN_AGE_DAYS;

        const embed = new EmbedBuilder()
            .setColor(isSuspicious ? 0xED4245 : 0x57F287)
            .setTitle(isSuspicious ? '⛔ CONTA SUSPEITA' : '✅ Novo Membro')
            .setDescription(`${member} entrou.\nIdade da conta: **${diffDays} dias**`)
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();

        channel.send({ embeds: [embed] });
    } catch (e) { console.error(e); }
});

// Saída de Membro
client.on(Events.GuildMemberRemove, async member => {
    const channel = member.guild.channels.cache.get(CONFIG.EXIT_CHANNEL_ID);
    if (channel) {
        channel.send(`📤 **${member.user.tag}** saiu do servidor.`);
    }
});

if (!CONFIG.DISCORD_TOKEN) {
    console.log("❌ ERRO: Coloque o DISCORD_TOKEN nas variáveis de ambiente do Render.");
} else {
    client.login(CONFIG.DISCORD_TOKEN);
}