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
    PORT: process.env.PORT || 3000,

    // ADICIONAR ESTES:
    COTACAO_CHANNEL: 'ID_DO_CANAL_COTACAO',
    VIP_ROLE_ID: 'ID_DO_CARGO_VIP'
};

// Função para extrair números enviados no chat
function extrairValor(texto) {
    const match = texto.replace(/\./g, '').match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
}

// --- SERVIDOR WEB ---
const app = express();
app.get('/', (req, res) => res.send({ status: 'Guardian Online', mode: 'Advanced Logging' }));
app.listen(CONFIG.PORT, () => {
    console.log(`🌐 Sistema Online na porta ${CONFIG.PORT}`);
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) setInterval(() => https.get(`${renderUrl}`), 5 * 60 * 1000);
});

// --- IA ---
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
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.GuildMember, Partials.User]
});

// =========================================================
// 📌 SISTEMA PRINCIPAL DE MENSAGENS (COM IA + COMANDOS + COTAÇÃO)
// =========================================================
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // ---------------------------------------
    // 🔒 COMANDOS DE SEGURANÇA
    // ---------------------------------------
    if (message.content === '!lock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) 
            return message.reply('❌ Sem permissão.');
        
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.reply('🔒 **BLOQUEIO DE EMERGÊNCIA:** Este canal foi trancado.');
    }

    if (message.content === '!unlock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) 
            return message.reply('❌ Sem permissão.');
        
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        return message.reply('🔓 **DESBLOQUEADO:** O canal está aberto novamente.');
    }

    // ---------------------------------------
    // 💰 SISTEMA DE COTAÇÃO
    // ---------------------------------------
    const isCotacaoChannel = 
        message.channel.id === CONFIG.COTACAO_CHANNEL || 
        message.channel.parentId === CONFIG.COTACAO_CHANNEL;

    if (isCotacaoChannel) {
        const valorVeiculo = extrairValor(message.content);

        if (!valorVeiculo || valorVeiculo <= 0) return;

        await message.channel.sendTyping();

        const temCargoVip = message.member.roles.cache.has(CONFIG.VIP_ROLE_ID);
        const porcentagem = temCargoVip ? 10 : 15;

        const taxa = valorVeiculo * (porcentagem / 100);
        const valorFinal = valorVeiculo + taxa;

        const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

        const cor = temCargoVip ? 0xFFD700 : 0x2B2D31;
        const titulo = temCargoVip ? '👑 Cotação VIP Aplicada' : '📋 Cotação Padrão';
        const rodape = temCargoVip ? 'Benefício de taxa reduzida ativo.' : 'Dica: VIPs pagam apenas 10% de taxa.';

        const embed = new EmbedBuilder()
            .setColor(cor)
            .setTitle(titulo)
            .setDescription(`Cálculo automático para **${message.author.username}**`)
            .addFields(
                { name: 'Valor Base', value: `\`${fmt.format(valorVeiculo)}\``, inline: true },
                { name: `Taxa (${porcentagem}%)`, value: `\`+ ${fmt.format(taxa)}\``, inline: true },
                { name: '💰 VALOR FINAL DE VENDA', value: `## ${fmt.format(valorFinal)}`, inline: false }
            )
            .setFooter({ text: rodape })
            .setTimestamp();

        try {
            return await message.reply({ embeds: [embed] });
        } catch (err) {
            console.error('Erro ao enviar cotação:', err);
        }
    }

    // ---------------------------------------
    // 🤖 CHAT COM IA (MENCIONAR O BOT)
    // ---------------------------------------
    if (message.mentions.has(client.user)) {
        if (!aiClient) return message.reply("⚠️ **Erro:** Minha API Key não foi configurada.");

        await message.channel.sendTyping();

        try {
            const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim();
            const systemPrompt = `
Você é o Guardião de NewVille, um bot moderador engraçado, direto e zoeiro.
Fale como alguém que faz piada de tudo mas ainda ajuda rápido e sem enrolar.
Nada de linguagem formal, não fale como robô, responda curto, engraçado e útil.
O servidor se passa nos EUA.
`;

            const response = await aiClient.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { systemInstruction: systemPrompt }
            });

            await message.reply(response.text || "Não consegui responder isso não, parça.");
        } catch (error) {
            console.error("Erro IA:", error);
            message.reply("❌ Deu ruim aqui, tenta de novo depois.");
        }
    }
});

// =========================================================
// 👋 SISTEMA DE ENTRADA
// =========================================================
client.on(Events.GuildMemberAdd, async member => {
    try {
        let channel = member.guild.channels.cache.get(CONFIG.ENTRY_CHANNEL);
        if (!channel) try { channel = await member.guild.channels.fetch(CONFIG.ENTRY_CHANNEL); } catch(e) {}

        if (!channel?.isTextBased()) return;

        const createdAt = member.user.createdAt;
        const diffDays = Math.floor((Date.now() - createdAt) / 86400000);
        const isSuspicious = diffDays < CONFIG.MIN_AGE_DAYS;
        const dateString = createdAt.toLocaleDateString('pt-BR');

        const embed = new EmbedBuilder()
            .setColor(isSuspicious ? 0xED4245 : 0x57F287)
            .setAuthor({ name: `${member.user.tag} Entrou`, iconURL: member.user.displayAvatarURL() })
            .setTitle(isSuspicious ? '⛔ CONTA DE RISCO (Nova)' : '✅ Entrada Segura')
            .addFields(
                { name: '👤 Membro', value: `${member}` },
                { name: '📅 Conta criada em', value: dateString },
                { name: '⏳ Idade da conta', value: `${diffDays} dias` }
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`kick_${member.id}`).setLabel('Expulsar').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ban_${member.id}`).setLabel('Banir').setStyle(ButtonStyle.Danger)
        );

        await channel.send({
            content: isSuspicious ? `||@here|| 🚨 Conta suspeita detectada!` : null,
            embeds: [embed],
            components: isSuspicious ? [row] : []
        });
    } catch (e) { console.error('Erro Entrada:', e); }
});

// =========================================================
// 📤 SISTEMA DE SAÍDA
// =========================================================
client.on(Events.GuildMemberRemove, async member => {
    try {
        let channel = member.guild.channels.cache.get(CONFIG.EXIT_CHANNEL);
        if (!channel) try { channel = await member.guild.channels.fetch(CONFIG.EXIT_CHANNEL); } catch(e) {}
        if (!channel?.isTextBased()) return;

        let reason = 'Saiu do servidor';
        let color = 0x99AAB5;
        let icon = '📤';
        let executor = null;

        try {
            const kickLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
            const kickLog = kickLogs.entries.first();

            if (kickLog && kickLog.target.id === member.id && (Date.now() - kickLog.createdTimestamp) < 5000) {
                reason = '👢 Expulso (Kick)';
                color = 0xFFA500;
                icon = '👢';
                executor = kickLog.executor;
            } else {
                const banLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
                const banLog = banLogs.entries.first();

                if (banLog && banLog.target.id === member.id && (Date.now() - banLog.createdTimestamp) < 5000) {
                    reason = '🔨 Banido';
                    color = 0xFF0000;
                    icon = '🚫';
                    executor = banLog.executor;
                }
            }
        } catch (e) {}

        const embed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({ name: `Saída: ${member.user.tag}`, iconURL: member.user.displayAvatarURL() })
            .setDescription(`${icon} **${reason}**`)
            .addFields(
                { name: '👤 Membro', value: `${member.user.tag}`, inline: true },
                { name: '🆔 ID', value: `${member.id}`, inline: true }
            )
            .setTimestamp();

        if (executor) {
            embed.addFields({ name: '👮 Executor', value: executor.tag });
        }

        channel.send({ embeds: [embed] });

    } catch (e) { console.error('Erro saída:', e); }
});

// =========================================================
// 🔘 SISTEMA DE BOTÕES
// =========================================================
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers))
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });

    const [action, targetId] = interaction.customId.split('_');

    try {
        if (action === 'kick') {
            await interaction.guild.members.kick(targetId, 'Bot Action');
            interaction.reply({ content: '👢 Membro expulso.', ephemeral: true });
        }
        if (action === 'ban') {
            await interaction.guild.members.ban(targetId);
            interaction.reply({ content: '🚫 Membro banido.', ephemeral: true });
        }
    } catch (e) {
        interaction.reply({ content: '❌ Erro ao executar punição.', ephemeral: true });
    }
});

client.login(CONFIG.TOKEN);