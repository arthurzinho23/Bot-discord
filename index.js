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
    OPENAI_KEY: process.env.OPENAI_API_KEY, // Apenas OpenAI
    ENTRY_CHANNEL_ID: '1445105097796223078', 
    EXIT_CHANNEL_ID: '1445105144869032129', 
    MIN_AGE_DAYS: 7,
    PORT: process.env.PORT || 3000
};

// --- SERVIDOR WEB ---
const app = express();

app.get('/', (req, res) => {
    const statusIA = CONFIG.OPENAI_KEY ? "🟢 OpenAI Ativo" : "🔴 OpenAI Offline";
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

// --- CONFIGURAÇÃO OPENAI ---
let aiClient = null;

if (CONFIG.OPENAI_KEY) {
    try {
        aiClient = new OpenAI({ apiKey: CONFIG.OPENAI_KEY });
        console.log("🧠 IA Configurada: OpenAI (ChatGPT)");
    } catch (e) { console.error("Erro OpenAI:", e.message); }
} else {
    console.log("⚠️ Nenhuma API Key encontrada (OPENAI_API_KEY). Chat desligado.");
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
        return message.reply("❌ OpenAI não configurada. Verifique OPENAI_API_KEY no Render.");
    }

    await message.channel.sendTyping();

    try {
        const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim() || "Olá!";
        const systemPrompt = "Você é um bot moderador do Discord chamado Guardian. Seja breve, útil e um pouco sério.";

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
        console.error("Erro IA:", error);
        await message.reply("Erro ao processar mensagem via OpenAI.");
    }
});

// Eventos de Moderação (Mantidos)
client.on(Events.GuildMemberAdd, async member => {
    const channel = member.guild.channels.cache.get(CONFIG.ENTRY_CHANNEL_ID);
    if (!channel) return;

    const createdAt = member.user.createdAt;
    const diffDays = Math.floor((Date.now() - createdAt) / 86400000);
    const isSuspicious = diffDays < CONFIG.MIN_AGE_DAYS;

    const embed = new EmbedBuilder()
        .setColor(isSuspicious ? 0xED4245 : 0x57F287)
        .setTitle(isSuspicious ? '⛔ CONTA SUSPEITA' : '✅ Novo Membro')
        .setDescription(`${member} entrou.`)
        .addFields(
            { name: 'Idade da Conta', value: `${diffDays} dias`, inline: true },
            { name: 'ID', value: member.id, inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

    const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`kick_${member.id}`).setLabel('KICK').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`ban_${member.id}`).setLabel('BAN').setStyle(ButtonStyle.Danger)
            );

    channel.send({ embeds: [embed], components: isSuspicious ? [row] : [] });
});

client.on(Events.GuildMemberRemove, async member => {
    const channel = member.guild.channels.cache.get(CONFIG.EXIT_CHANNEL_ID);
    if (!channel) return;
    const embed = new EmbedBuilder()
        .setColor(0x99AAB5).setTitle('📤 Saiu').setDescription(`${member.user.tag} saiu.`).setTimestamp();
    channel.send({ embeds: [embed] });
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) 
        return interaction.reply({ content: 'Sem permissão.', ephemeral: true });

    const [action, targetId] = interaction.customId.split('_');
    const member = interaction.guild.members.cache.get(targetId);

    if (action === 'kick' && member) {
        await member.kick('Bot Action');
        interaction.reply({ content: 'Expulso.', ephemeral: true });
    }
    if (action === 'ban') {
        await interaction.guild.members.ban(targetId);
        interaction.reply({ content: 'Banido.', ephemeral: true });
    }
});

client.login(CONFIG.DISCORD_TOKEN);