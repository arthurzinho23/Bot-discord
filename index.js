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
const https = require('https');
const { GoogleGenAI } = require("@google/genai");

// --- CONFIGURAÇÃO ---
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    GEMINI_KEY: process.env.GEMINI_API_KEY, 
    ENTRY_CHANNEL: '1445105097796223078',
    EXIT_CHANNEL: '1445105144869032129',
    MIN_AGE_DAYS: 7,
    AUTO_KICK: false, // Mude para true se quiser expulsar contas novas automaticamente
    PORT: process.env.PORT || 3000
};

// --- SERVIDOR WEB (Manter Online) ---
const app = express();
app.get('/', (req, res) => res.send({ status: 'Guardian Online', mode: 'Standard' }));
app.listen(CONFIG.PORT, () => {
    console.log(`🌐 Sistema Online na porta ${CONFIG.PORT}`);
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) setInterval(() => https.get(`${renderUrl}`), 5 * 60 * 1000);
});

// --- INTELIGÊNCIA ARTIFICIAL ---
let aiClient;
if (CONFIG.GEMINI_KEY) {
    try {
        aiClient = new GoogleGenAI({ apiKey: CONFIG.GEMINI_KEY });
        console.log('🧠 IA Gemini Conectada.');
    } catch (err) { console.error('Erro ao conectar IA:', err.message); }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // OBRIGATÓRIO PARA ENTRADA/SAÍDA
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.GuildMember, Partials.User]
});

// --- COMANDOS E IA ---
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // COMANDOS DE SEGURANÇA (!lock / !unlock)
    if (message.content === '!lock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Sem permissão.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.reply('🔒 **BLOQUEIO DE EMERGÊNCIA:** Este canal foi trancado.');
    }

    if (message.content === '!unlock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Sem permissão.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        return message.reply('🔓 **DESBLOQUEADO:** O canal está aberto novamente.');
    }

    // CHAT COM IA
    if (message.mentions.has(client.user)) {
        if (!aiClient) return message.reply("⚠️ **Erro:** Minha API Key não foi configurada no sistema.");
        await message.channel.sendTyping();

        try {
            const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim();
            
            // Prompt SÉRIO e PROFISSIONAL
            const systemPrompt = `
                Você é o Guardian, um bot moderador do Discord.
                Personalidade: Profissional, direto, útil e educado.
                Função: Ajudar membros e proteger o servidor.
                Regra: Não use gírias. Seja claro. Respostas curtas (máx 3 frases).
            `;

            const response = await aiClient.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { systemInstruction: systemPrompt }
            });

            await message.reply(response.text || "Não consegui processar sua solicitação.");
        } catch (error) {
            console.error("Erro IA:", error);
            message.reply("❌ Ocorreu um erro interno ao processar a mensagem.");
        }
    }
});

// --- SISTEMA DE BOAS-VINDAS (MELHORADO) ---
client.on(Events.GuildMemberAdd, async member => {
    try {
        // Busca canal de forma robusta
        let channel = member.guild.channels.cache.get(CONFIG.ENTRY_CHANNEL);
        if (!channel) {
            try { channel = await member.guild.channels.fetch(CONFIG.ENTRY_CHANNEL); } catch(e) { return; }
        }
        if (!channel?.isTextBased()) return;

        const createdAt = member.user.createdAt;
        const accountAgeDays = Math.floor((Date.now() - createdAt) / 86400000);
        const isSuspicious = accountAgeDays < CONFIG.MIN_AGE_DAYS;
        
        // Formatação de Data (DD/MM/AAAA)
        const dateString = createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

        const embed = new EmbedBuilder()
            .setColor(isSuspicious ? 0xED4245 : 0x57F287) // Vermelho se for suspeito, Verde se ok
            .setAuthor({ name: 'Entrada Registrada', iconURL: member.user.displayAvatarURL() })
            .setTitle(isSuspicious ? '⚠️ ALERTA: CONTA RECENTE' : '✅ Novo Membro')
            .setDescription(`${member} (${member.user.tag}) entrou no servidor.`)
            .addFields(
                { name: '🆔 ID do Usuário', value: ```${member.id}```, inline: true },
                { name: '📅 Criada em', value: `${dateString}`, inline: true },
                { name: '⏳ Idade da Conta', value: `${accountAgeDays} dias`, inline: true }
            )
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ text: `Membro #${member.guild.memberCount}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`kick_${member.id}`).setLabel('Expulsar').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ban_${member.id}`).setLabel('Banir').setStyle(ButtonStyle.Danger)
        );

        await channel.send({ 
            content: isSuspicious ? `||@here|| 🚨 **ATENÇÃO: Conta com menos de ${CONFIG.MIN_AGE_DAYS} dias!**` : null,
            embeds: [embed], 
            components: isSuspicious ? [row] : [] 
        });

        if (CONFIG.AUTO_KICK && isSuspicious) {
            await member.kick("Proteção Automática: Conta muito nova.");
        }

    } catch (e) { console.error('Erro Log Entrada:', e); }
});

// --- SISTEMA DE SAÍDA (MELHORADO) ---
client.on(Events.GuildMemberRemove, async member => {
    try {
        let channel = member.guild.channels.cache.get(CONFIG.EXIT_CHANNEL);
        if (!channel) {
            try { channel = await member.guild.channels.fetch(CONFIG.EXIT_CHANNEL); } catch(e) { return; }
        }
        if (!channel?.isTextBased()) return;

        // Tentar pegar papéis que a pessoa tinha
        const roles = member.roles.cache
            .filter(r => r.name !== '@everyone')
            .map(r => r.name)
            .join(', ') || 'Nenhum';

        const embed = new EmbedBuilder()
            .setColor(0x99AAB5) // Cinza
            .setAuthor({ name: 'Saída Registrada', iconURL: member.user.displayAvatarURL() })
            .setDescription(`${member.user.tag} saiu do servidor.`)
            .addFields(
                { name: '🆔 ID', value: `${member.id}`, inline: true },
                { name: '🏅 Cargos Anteriores', value: roles.length > 100 ? roles.substring(0, 97) + '...' : roles, inline: false }
            )
            .setTimestamp();

        channel.send({ embeds: [embed] });
    } catch(e) { console.error('Erro Log Saída:', e); }
});

// --- GERENCIADOR DE BOTÕES ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) 
        return interaction.reply({ content: '❌ Você não tem permissão para isso.', ephemeral: true });

    const [action, targetId] = interaction.customId.split('_');

    try {
        if (action === 'kick') {
            await interaction.guild.members.kick(targetId, 'Bot Moderator Action');
            interaction.reply({ content: '✅ Usuário expulso.', ephemeral: true });
        }
        if (action === 'ban') {
            await interaction.guild.members.ban(targetId);
            interaction.reply({ content: '✅ Usuário banido.', ephemeral: true });
        }
    } catch (e) { interaction.reply({ content: '❌ Erro: Não consigo punir este usuário (Cargo superior?).', ephemeral: true }); }
});

client.login(CONFIG.TOKEN);