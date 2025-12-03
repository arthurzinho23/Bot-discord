const { 
    Client, 
    GatewayIntentBits, 
    Events, 
    EmbedBuilder, 
    Partials, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');
const express = require('express');
const { OpenAI } = require("openai");

// --- CONFIGURAÇÃO ---
const CONFIG = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    // Tenta ler ambos os nomes comuns para garantir
    OPENAI_KEY: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY,
    ENTRY_CHANNEL_ID: '1445105097796223078', 
    EXIT_CHANNEL_ID: '1445105144869032129', 
    MIN_AGE_DAYS: 7,
    PORT: process.env.PORT || 3000
};

// --- SERVIDOR WEB ---
const app = express();

app.get('/', (req, res) => {
    const statusIA = CONFIG.OPENAI_KEY ? "🟢 OpenAI Configurada" : "🔴 Falta API Key";
    res.json({ 
        status: 'Online', 
        bot: 'Guardian', 
        ia_status: statusIA,
        uptime: process.uptime() 
    });
});

app.get('/ping', (req, res) => res.send('Pong!'));

app.listen(CONFIG.PORT, () => {
    console.log(`🌍 Servidor Web rodando na porta ${CONFIG.PORT}`);
});

// --- CLIENTE OPENAI ---
let aiClient = null;

if (CONFIG.OPENAI_KEY) {
    try {
        aiClient = new OpenAI({ apiKey: CONFIG.OPENAI_KEY });
        console.log("🧠 IA Configurada: OpenAI");
    } catch (e) { 
        console.error("Erro Config OpenAI:", e.message); 
    }
} else {
    console.log("⚠️ Nenhuma API Key encontrada (OPENAI_API_KEY ou OPENAI_KEY).");
}

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

client.once(Events.ClientReady, c => {
    console.log(`✅ Bot logado como ${c.user.tag}`);
    client.user.setActivity('🛡️ Protegendo o Servidor');
});

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!message.mentions.has(client.user)) return;

    if (!aiClient) {
        return message.reply("❌ **Erro de Configuração:** Não encontrei a 'OPENAI_API_KEY' nas variáveis de ambiente do Render.");
    }

    await message.channel.sendTyping();

    try {
        const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim() || "Olá!";
        const systemPrompt = "Você é um bot moderador do Discord chamado Guardian. Seja breve.";

        console.log(`💬 Processando mensagem: "${prompt}"`);

        const completion = await aiClient.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            model: "gpt-3.5-turbo",
        });
        
        const replyText = completion.choices[0].message.content || "Sem resposta.";

        if (replyText.length > 2000) {
            const chunks = replyText.match(/[\s\S]{1,1900}/g) || [];
            for (const chunk of chunks) await message.reply(chunk);
        } else {
            await message.reply(replyText);
        }

    } catch (error) {
        console.error("❌ Erro OpenAI Detalhado:", error);
        
        // MENSAGEM DE ERRO DETALHADA PARA O CHAT
        let userMsg = "❌ Erro ao conectar na OpenAI.";
        
        if (error.status === 401) userMsg += " (Chave API Inválida/Incorreta)";
        if (error.status === 429) userMsg += " (Cota Excedida / Sem Créditos)";
        if (error.status === 404) userMsg += " (Modelo não encontrado/acessível)";
        
        await message.reply(`${userMsg}
` + "```" + error.message + "```");
    }
});

// ... (Mantenha o resto dos eventos de GuildMemberAdd/Remove iguais)
// Se precisar, copie do código anterior, a parte de IA é a principal mudança aqui.

client.login(CONFIG.DISCORD_TOKEN);