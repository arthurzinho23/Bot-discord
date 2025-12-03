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
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    GEMINI_KEY: process.env.GEMINI_API_KEY, 
    ENTRY_CHANNEL: '1445105097796223078',
    EXIT_CHANNEL: '1445105144869032129',
    MIN_AGE_DAYS: 7,
    AUTO_KICK: false,
    PORT: process.env.PORT || 3000
};

// --- IMPORTANTE: ATIVE 'SERVER MEMBERS INTENT' NO DISCORD DEV PORTAL ---

// Servidor Web para manter online no Render
const app = express();
app.get('/', (req, res) => res.send({ status: 'Guardian Online', mode: 'Car Edition' }));
app.listen(CONFIG.PORT, () => {
    console.log(`🌐 Web Server na porta ${CONFIG.PORT}`);
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) setInterval(() => https.get(`${renderUrl}`), 5 * 60 * 1000);
});

// Configuração IA
let aiClient;
if (CONFIG.GEMINI_KEY) {
    try {
        aiClient = new GoogleGenAI({ apiKey: CONFIG.GEMINI_KEY });
        console.log('🧠 IA Motor V8 (Gemini) Ligado.');
    } catch (err) { console.error('Erro IA:', err.message); }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // NECESSÁRIO PARA ENTRADA/SAÍDA
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.GuildMember, Partials.User]
});

// --- COMANDOS E IA ---
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // COMANDO DE LOCKDOWN (ANTI-RAID)
    if (message.content === '!lock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Sem CNH para fechar a pista.');
        
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.reply('🔒 **PISTA FECHADA!** O chat está trancado para evitar acidentes (Raid).');
    }

    if (message.content === '!unlock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Sem CNH para abrir a pista.');
        
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        return message.reply('🔓 **PISTA LIBERADA!** Podem acelerar (falar) novamente.');
    }

    // LÓGICA DE IA (MENÇÃO)
    if (message.mentions.has(client.user)) {
        if (!aiClient) return message.reply("❌ Motor fundiu (Sem API Key).");
        await message.channel.sendTyping();

        try {
            const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim();
            const systemPrompt = `
                Você é o Guardian, um bot moderador viciado em carros e mecânica.
                Personalidade: Engraçado, usa gírias de gearhead (lasanha, manco, AP turbo), odeia carros franceses velhos.
                Regra: Respostas curtas (max 2 frases). Se for algo sério, ajude mas faça analogia com carros.
            `;

            const response = await aiClient.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { systemInstruction: systemPrompt, maxOutputTokens: 150 }
            });

            await message.reply(response.text || "Falha na ignição.");
        } catch (error) {
            console.error("Erro IA:", error);
            message.reply("Pane elétrica no sistema.");
        }
    }
});

const createBar = (days) => {
    const p = Math.min(days / 30, 1);
    return '█'.repeat(Math.floor(p * 10)) + '░'.repeat(10 - Math.floor(p * 10));
};

// --- ENTRADA (DEBUGADA) ---
client.on(Events.GuildMemberAdd, async member => {
    console.log(`>> Novo Piloto: ${member.user.tag}`); // Log para debug

    try {
        // Tenta buscar o canal mesmo se não estiver no cache
        let channel = member.guild.channels.cache.get(CONFIG.ENTRY_CHANNEL);
        if (!channel) {
            try { channel = await member.guild.channels.fetch(CONFIG.ENTRY_CHANNEL); } catch(e) {}
        }

        if (!channel?.isTextBased()) return console.log("Canal de entrada não encontrado/inválido");

        const days = Math.floor((Date.now() - member.user.createdAt) / 86400000);
        const isSus = days < CONFIG.MIN_AGE_DAYS;

        const embed = new EmbedBuilder()
            .setColor(isSus ? 0xED4245 : 0x57F287)
            .setAuthor({ name: 'Novo Piloto na Pista', iconURL: member.user.displayAvatarURL() })
            .setTitle(isSus ? '⚠️ CLONAGEM DETECTADA (Conta Nova)' : '✅ Vistoria Aprovada')
            .setDescription(`${member} acabou de estacionar.`)
            .addFields(
                { name: 'Motorista', value: `${member.user.tag}`, inline: true },
                { name: 'Tempo de Carta', value: `${days} dias\n${createBar(days)}`, inline: true }
            )
            .setThumbnail(member.user.displayAvatarURL());

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`kick_${member.id}`).setLabel('GUINCHAR').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ban_${member.id}`).setLabel('APREENDER').setStyle(ButtonStyle.Danger)
        );

        await channel.send({ 
            content: isSus ? '||@here|| 🚨 ALERTA DE BLITZ (Raid)' : null,
            embeds: [embed], 
            components: [row] 
        });

        if (CONFIG.AUTO_KICK && isSus) await member.kick("Conta muito nova (Auto-Guincho)");

    } catch (e) { console.error('Erro na Entrada:', e); }
});

// --- SAÍDA (DEBUGADA) ---
client.on(Events.GuildMemberRemove, async member => {
    let channel = member.guild.channels.cache.get(CONFIG.EXIT_CHANNEL);
    if (!channel) {
        try { channel = await member.guild.channels.fetch(CONFIG.EXIT_CHANNEL); } catch(e) {}
    }
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setColor(0x99AAB5)
        .setAuthor({ name: 'SAÍDA', iconURL: member.user.displayAvatarURL() })
        .setDescription(`${member.user.tag} vendeu o carro e saiu.`)
        .setTimestamp();

    channel.send({ embeds: [embed] });
});

// --- BOTÕES ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) 
        return interaction.reply({ content: '❌ Você não é dono da oficina.', ephemeral: true });

    const [action, targetId] = interaction.customId.split('_');
    const member = interaction.guild.members.cache.get(targetId);

    try {
        if (action === 'kick' && member) {
            await member.kick('Bot Button');
            interaction.reply({ content: 'Guinchado com sucesso.', ephemeral: true });
        }
        if (action === 'ban') {
            await interaction.guild.members.ban(targetId);
            interaction.reply({ content: 'Apreendido com sucesso.', ephemeral: true });
        }
    } catch (e) { interaction.reply({ content: 'Erro: O alvo tem blindagem (Cargo maior).', ephemeral: true }); }
});

client.login(CONFIG.TOKEN);