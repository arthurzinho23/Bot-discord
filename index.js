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

// --- SISTEMA ANTI-SLEEP ---
let app;
try {
    if (typeof express === 'function') {
        app = express();
    } else {
        app = {
            get: () => {},
            listen: (port, cb) => { if(cb) cb(); return {}; }
        };
    }
} catch (e) {
    console.warn("Express failed to initialize, using mock.");
    app = { get: () => {}, listen: (p, c) => c && c() };
}

const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send({ 
    status: '🛡️ Guardian Online', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
}));

app.get('/ping', (req, res) => res.status(200).send('Pong!'));

if (app.listen) {
    app.listen(port, () => {
        console.log(`🌐 Web Server rodando na porta ${port}`);

        const renderUrl = process.env.RENDER_EXTERNAL_URL;
        if (renderUrl) {
            console.log('⏰ Sistema Anti-Sleep ativado: ' + renderUrl);
            setInterval(() => {
                fetch(renderUrl + '/ping')
                    .then(() => console.log('💓 Heartbeat: ping ok'))
                    .catch(err => console.error('💔 Heartbeat Falhou:', err.message));
            }, 5 * 60 * 1000);
        }
    });
} else {
    console.warn("⚠️ Servidor Express não iniciado (ambiente não suportado).");
}

console.log('🔄 INICIANDO SISTEMA DE SEGURANÇA...');

const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN || 'SEU_TOKEN_AQUI',
    GEMINI_KEY: process.env.GEMINI_API_KEY, 
    ENTRY_CHANNEL: '1445105097796223078',
    EXIT_CHANNEL: '1445105144869032129',
    MIN_AGE_DAYS: 7,
    AUTO_KICK: false
};

process.on('uncaughtException', (error) => {
    console.error('❌ ERRO FATAL:', error);
});
process.on('unhandledRejection', (reason) => {
    console.error('❌ ERRO PROMESSA:', reason);
});

if (CONFIG.TOKEN === 'SEU_TOKEN_AQUI' && !process.env.DISCORD_TOKEN) {
    console.error('❌ Token do bot não encontrado!');
    process.exit(1);
}

let aiClient;
if (CONFIG.GEMINI_KEY) {
    aiClient = new GoogleGenAI({ apiKey: CONFIG.GEMINI_KEY });
    console.log('🧠 IA Gemini Configurada.');
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

// IA de Resposta
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.mentions.has(client.user)) return;

    if (!aiClient) return message.reply("❌ IA não configurada.");

    await message.channel.sendTyping();

    try {
        const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim();
        if (!prompt) return message.reply("Como posso ajudar?");

        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: "Você é um assistente útil e direto."
            }
        });

        const textResponse = response.text || "";

        if (textResponse.length > 2000) {
            const chunks = textResponse.match(/[\s\S]{1,1900}/g);
            for (const chunk of chunks) await message.reply(chunk);
        } else {
            await message.reply(textResponse);
        }

    } catch (error) {
        console.error(error);
        message.reply("Erro ao usar IA.");
    }
});

client.once(Events.ClientReady, c => {
    console.log(`✅ ONLINE: ${c.user.tag}`);
    client.user.setActivity('🛡️ Monitorando');
});

client.on(Events.ShardDisconnect, () => console.log('⚠️ Desconectado'));
client.on(Events.ShardReconnecting, () => console.log('🔄 Reconectando'));
client.on(Events.ShardResume, () => console.log('✅ Reconectado'));

const createProgressBar = (days, minDays) => {
    const percentage = Math.min(days / minDays, 1);
    const filled = Math.floor(percentage * 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
};

// Entrada de membro
client.on(Events.GuildMemberAdd, async member => {
    try {
        const createdAt = member.user.createdAt;
        const diffDays = Math.floor((Date.now() - createdAt) / 86400000);

        const isSuspicious = diffDays < CONFIG.MIN_AGE_DAYS;

        const embed = new EmbedBuilder()
            .setColor(isSuspicious ? 0xED4245 : 0x57F287)
            .setAuthor({ name: `${member.user.tag} entrou`, iconURL: member.user.displayAvatarURL() })
            .setTitle(isSuspicious ? '⛔ CONTA SUSPEITA' : '✅ Conta segura')
            .addFields(
                { name: 'ID', value: `\`\`\`yaml\n${member.id}\n\`\`\`` },
                { name: 'Bot?', value: `\`\`\`${member.user.bot ? 'Sim' : 'Não'}\`\`\`` },
                { name: 'Idade da conta', value: `${diffDays} dias\n${createProgressBar(diffDays, 30)}` }
            )
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`kick_${member.id}`).setLabel('EXPULSAR').setEmoji('🥾').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`ban_${member.id}`).setLabel('BANIR').setEmoji('🔨').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`info_${member.id}`).setLabel('RELATÓRIO').setEmoji('📄').setStyle(ButtonStyle.Secondary)
            );

        const channel = member.guild.channels.cache.get(CONFIG.ENTRY_CHANNEL);
        if (channel?.isTextBased()) {
            await channel.send({
                content: isSuspicious ? `||@here|| 🚨 POSSÍVEL ALT/RAID` : null,
                embeds: [embed],
                components: [row]
            });
        }

        if (CONFIG.AUTO_KICK && isSuspicious) {
            await member.kick("Auto defesa");
        }

    } catch (e) { console.error(e); }
});

// Saída
client.on(Events.GuildMemberRemove, async member => {
    const channel = member.guild.channels.cache.get(CONFIG.EXIT_CHANNEL);
    if (!channel?.isTextBased()) return;

    let reason = 'Saiu sozinho';
    let color = 0x99AAB5;
    let icon = '📤';
    let executor = null;

    try {
        const logs = await member.guild.fetchAuditLogs({ limit: 1 });
        const first = logs.entries.first();

        if (first && first.target?.id === member.id && (Date.now() - first.createdTimestamp) < 5000) {
            if (first.action === AuditLogEvent.MemberKick) {
                reason = 'Kickado';
                color = 0xFFA500;
                icon = '👢';
                executor = first.executor;
            }
            if (first.action === AuditLogEvent.MemberBanAdd) {
                reason = 'Banido';
                color = 0xFF0000;
                icon = '🚫';
                executor = first.executor;
            }
        }
    } catch {}

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `${icon} SAÍDA` })
        .setDescription(`${member.user.tag} saiu.`)
        .addFields(
            { name: 'Motivo', value: reason }
        )
        .setTimestamp();

    if (executor) embed.addFields({ name: 'Executor', value: executor.tag });

    channel.send({ embeds: [embed] });
});

// Interações
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
    }

    const [action, targetId] = interaction.customId.split('_');
    const guild = interaction.guild;

    let user;
    try {
        user = await client.users.fetch(targetId);
    } catch {
        return interaction.reply({ content: 'Usuário inválido.', ephemeral: true });
    }

    const member = guild.members.cache.get(targetId);
    const logChannel = guild.channels.cache.get(CONFIG.ENTRY_CHANNEL);

    try {
        if (action === 'kick') {
            if (!member) return interaction.reply({ content: 'Usuário já saiu.', ephemeral: true });
            await member.kick(`Kick por ${interaction.user.tag}`);
            await interaction.reply({ content: `${user.tag} expulso.` });
        }

        if (action === 'ban') {
            await guild.members.ban(targetId, { reason: `Ban por ${interaction.user.tag}` });
            await interaction.reply({ content: `${user.tag} banido.` });
        }

        if (action === 'info') {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`Relatório: ${user.tag}`)
                .setDescription(`ID: ${user.id}`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

    } catch (e) {
        interaction.reply({ content: 'Erro: cargo do bot está baixo.', ephemeral: true });
    }
});

client.login(CONFIG.TOKEN);