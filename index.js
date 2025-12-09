import { 
    Client, 
    GatewayIntentBits, 
    Events, 
    EmbedBuilder, 
    Partials, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionFlagsBits,
    AuditLogEvent,
    ChannelType
} from 'discord.js';

import express from 'express';
import https from 'https';
import { GoogleGenAI } from "@google/genai";

// =========================================================
// ⚙️ CONFIGURAÇÃO
// =========================================================
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    GEMINI_KEY: process.env.GEMINI_API_KEY, 
    ENTRY_CHANNEL: process.env.ENTRY_CHANNEL_ID || '1445105097796223078',
    EXIT_CHANNEL: process.env.EXIT_CHANNEL_ID || '1445105144869032129',
    COTACAO_CHANNEL: process.env.COTACAO_CHANNEL_ID || '1447967291814973655', 
    BOOSTER_ROLE_ID: '1441086318229848185', 
    MIN_AGE_DAYS: 7,
    PORT: process.env.PORT || 3000
};

// =========================================================
// 🛠️ FUNÇÕES AUXILIARES
// =========================================================
function extrairValorManual(texto) {
    if (!texto) return 0;
    const clean = texto.toLowerCase().replace(/r\$/g, '').replace(/\./g, '').replace(/,/g, '.');
    if (clean.includes('k')) return (parseFloat(clean.match(/(\d+(\.\d+)?)k/)?.[1] || 0) * 1000);
    if (clean.includes('m')) return (parseFloat(clean.match(/(\d+(\.\d+)?)m/)?.[1] || 0) * 1000000);
    return parseFloat(clean.match(/(\d+(\.\d+)?)/)?.[1] || 0);
}

const fmt = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// =========================================================
// 🌐 SERVIDOR WEB
// =========================================================
const app = express();
app.get('/', (req, res) => res.send({ status: 'Online', version: '3.6.0' }));
app.listen(CONFIG.PORT, () => {
    if (process.env.RENDER_EXTERNAL_URL) {
        setInterval(() => https.get(process.env.RENDER_EXTERNAL_URL, () => {}).on('error', () => {}), 300000);
    }
});

// =========================================================
// 🤖 CLIENTE
// =========================================================
let aiClient;
try { if (CONFIG.GEMINI_KEY) aiClient = new GoogleGenAI({ apiKey: CONFIG.GEMINI_KEY }); } catch (e) {}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.GuildMember, Partials.User, Partials.Channel]
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // !novo para criar tópico manual
    if (message.content.startsWith('!novo')) {
        const args = message.content.slice(6).split('|');
        if (args.length < 2) return;
        try {
            const forum = await message.guild.channels.fetch(CONFIG.COTACAO_CHANNEL);
            if (forum) await forum.threads.create({
                name: args[0].trim(),
                message: { content: `${message.author}: ${args[1].trim()}` }
            });
            message.delete().catch(() => {});
        } catch (e) {}
        return;
    }

    // Cotação
    if (message.channel.id === CONFIG.COTACAO_CHANNEL || message.channel.parentId === CONFIG.COTACAO_CHANNEL) {
        let valor = 0;
        if (aiClient) {
            try {
                const r = await aiClient.models.generateContent({ 
                    model: 'gemini-2.5-flash', 
                    contents: `Extract number from: "${message.content}". Return 0 if none.` 
                });
                valor = parseInt(r.text?.replace(/[^0-9]/g, '') || '0');
            } catch (e) {}
        }
        if (valor === 0) valor = extrairValorManual(message.content);

        if (valor > 0) {
            const isBooster = message.member.roles.cache.has(CONFIG.BOOSTER_ROLE_ID);
            const taxa = valor * (isBooster ? 0.10 : 0.15);
            
            const embed = new EmbedBuilder()
                .setColor(isBooster ? 0xFF73FA : 0x2B2D31)
                .setTitle('Cotação Automática')
                .setDescription(`Análise financeira gerada para ${message.author}.`)
                .addFields({
                    name: '📋 Demonstrativo',
                    value: ```yaml\nBase:  R$ ${fmt(valor)}\nTaxa:  R$ ${fmt(taxa)} (${isBooster ? '10%' : '15%'})\nTotal: R$ ${fmt(valor + taxa)}\n```,
                    inline: false
                })
                .setFooter({ text: 'Guardian AI Systems' })
                .setTimestamp();

            try {
                if (message.channel.isThread()) {
                    await message.reply({ embeds: [embed] });
                } else {
                    const thread = await message.startThread({ name: `Cotação - ${message.author.username}`, autoArchiveDuration: 60 });
                    await thread.send({ content: `${message.author}`, embeds: [embed] });
                }
            } catch (e) { await message.reply({ embeds: [embed] }).catch(() => {}); }
        }
    }

    // Chatbot
    if (message.mentions.has(client.user) && aiClient) {
        message.channel.sendTyping();
        try {
            const r = await aiClient.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: message.content.replace(/<@!?[0-9]+>/g, '').trim()
            });
            message.reply(r.text);
        } catch (e) {}
    }
});

client.on(Events.GuildMemberAdd, async member => {
    if (!CONFIG.ENTRY_CHANNEL) return;
    const channel = await member.guild.channels.fetch(CONFIG.ENTRY_CHANNEL).catch(() => null);
    if (!channel) return;

    const created = Math.floor(member.user.createdTimestamp / 1000);
    const days = Math.floor((Date.now() - member.user.createdAt) / 86400000);
    const isSus = days < CONFIG.MIN_AGE_DAYS;

    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Guardian Security', iconURL: member.guild.iconURL() })
        .setTitle(isSus ? '🚨 ALERTA DE RISCO' : '📥 Entrada de Membro')
        .setDescription(`O usuário ${member} ingressou no servidor.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setColor(isSus ? 0xED4245 : 0x57F287)
        .addFields(
            { name: 'Conta Criada', value: `<t:${created}:f>\n(<t:${created}:R>)`, inline: false },
            { name: 'Status da Conta', value: isSus ? '⚠️ **ALTO RISCO (Recente)**' : '✅ Regular', inline: true }
        )
        .setFooter({ text: `ID: ${member.id}` })
        .setTimestamp();

    const rows = [];
    if (isSus) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`kick_${member.id}`).setLabel('Expulsar').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ban_${member.id}`).setLabel('Banir').setStyle(ButtonStyle.Danger)
        ));
    }

    channel.send({ content: isSus ? '@here' : null, embeds: [embed], components: rows }).catch(() => {});
});

client.on(Events.GuildMemberRemove, async member => {
    if (!CONFIG.EXIT_CHANNEL) return;
    const channel = await member.guild.channels.fetch(CONFIG.EXIT_CHANNEL).catch(() => null);
    if (!channel) return;

    let reason = 'Saída Voluntária';
    let color = 0xFEE75C;

    try {
        const logs = await member.guild.fetchAuditLogs({ limit: 1, type: null });
        const log = logs.entries.first();
        if (log && log.target.id === member.id && (Date.now() - log.createdTimestamp) < 10000) {
            if (log.action === AuditLogEvent.MemberKick) { reason = 'Expulsão (Kick)'; color = 0xE67E22; }
            if (log.action === AuditLogEvent.MemberBanAdd) { reason = 'Banimento (Ban)'; color = 0xED4245; }
        }
    } catch (e) {}

    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Guardian Logs', iconURL: member.guild.iconURL() })
        .setTitle('📤 Saída de Membro')
        .setDescription(`**${member.user.tag}** deixou o servidor.\nMotivo: **${reason}**`)
        .setThumbnail(member.user.displayAvatarURL())
        .setColor(color)
        .setFooter({ text: `ID: ${member.id}` })
        .setTimestamp();

    channel.send({ embeds: [embed] }).catch(() => {});
});

client.on(Events.InteractionCreate, async i => {
    if (!i.isButton()) return;
    if (!i.member.permissions.has(PermissionFlagsBits.KickMembers)) return i.reply({ content: 'Sem permissão.', ephemeral: true });
    
    const [act, id] = i.customId.split('_');
    try {
        if (act === 'kick') await i.guild.members.kick(id);
        if (act === 'ban') await i.guild.members.ban(id);
        i.reply({ content: 'Feito.', ephemeral: true });
    } catch (e) { i.reply({ content: 'Erro.', ephemeral: true }); }
});

client.login(CONFIG.TOKEN);
