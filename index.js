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

// --- CONFIGURAÇÃO INICIAL ---
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    GEMINI_KEY: process.env.GEMINI_API_KEY, 
    ENTRY_CHANNEL: '1445105097796223078',
    EXIT_CHANNEL: '1445105144869032129',
    MIN_AGE_DAYS: 7,
    AUTO_KICK: false,
    PORT: process.env.PORT || 3000
};

// Validação de Token
if (!CONFIG.TOKEN || CONFIG.TOKEN === 'SEU_TOKEN_AQUI') {
    console.error('❌ ERRO CRÍTICO: Token do Discord não configurado nas Variáveis de Ambiente.');
    process.exit(1);
}

// --- SERVIDOR WEB (Necessário para o Render não desligar o bot) ---
const app = express();

app.get('/', (req, res) => {
    res.send({ 
        status: '🛡️ Guardian Online', 
        uptime: process.uptime(),
        date: new Date().toISOString()
    });
});

app.get('/ping', (req, res) => res.status(200).send('Pong!'));

app.listen(CONFIG.PORT, () => {
    console.log(`🌐 Servidor Web rodando na porta ${CONFIG.PORT}`);
    
    // Sistema Anti-Sleep (Ping automático)
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) {
        console.log(`⏰ Anti-Sleep ativado para: ${renderUrl}`);
        setInterval(() => {
            // Requer Node 18+ para usar fetch nativo
            fetch(`${renderUrl}/ping`)
                .then(() => console.log('💓 Heartbeat enviado'))
                .catch(err => console.error('💔 Falha no Heartbeat:', err.message));
        }, 5 * 60 * 1000); // 5 minutos
    }
});

// --- CLIENTE DISCORD & IA ---
console.log('🔄 INICIANDO CLIENTE DISCORD...');

let aiClient;
if (CONFIG.GEMINI_KEY) {
    try {
        aiClient = new GoogleGenAI({ apiKey: CONFIG.GEMINI_KEY });
        console.log('🧠 IA Gemini Conectada.');
    } catch (err) {
        console.error('⚠️ Erro ao configurar Gemini:', err.message);
    }
} else {
    console.warn('⚠️ GEMINI_API_KEY não encontrada. Funcionalidades de IA desativadas.');
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

// Tratamento de Erros Globais
process.on('uncaughtException', (error) => console.error('❌ ERRO FATAL:', error));
process.on('unhandledRejection', (reason) => console.error('❌ PROMISE REJEITADA:', reason));

// --- EVENTOS DO BOT ---

// IA de Resposta
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.mentions.has(client.user)) return;

    if (!aiClient) return message.reply("❌ IA não configurada no servidor.");

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

        const textResponse = response.text || "Sem resposta da IA.";

        if (textResponse.length > 2000) {
            const chunks = textResponse.match(/[\s\S]{1,1900}/g) || [];
            for (const chunk of chunks) await message.reply(chunk);
        } else {
            await message.reply(textResponse);
        }

    } catch (error) {
        console.error("Erro na IA:", error);
        message.reply("Ocorreu um erro ao processar sua solicitação.");
    }
});

client.once(Events.ClientReady, c => {
    console.log(`✅ LOGIN REALIZADO: ${c.user.tag}`);
    client.user.setActivity('🛡️ Monitorando Servidor');
});

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
            await member.kick("Auto defesa: Conta muito nova");
        }
    } catch (e) { console.error('Erro no GuildMemberAdd:', e); }
});

// Saída de membro
client.on(Events.GuildMemberRemove, async member => {
    const channel = member.guild.channels.cache.get(CONFIG.EXIT_CHANNEL);
    if (!channel?.isTextBased()) return;

    let reason = 'Saiu sozinho';
    let color = 0x99AAB5;
    let icon = '📤';
    let executor = null;

    try {
        const logs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
        const kickLog = logs.entries.first();
        
        // Verifica se foi kickado recentemente
        if (kickLog && kickLog.target.id === member.id && (Date.now() - kickLog.createdTimestamp) < 5000) {
            reason = 'Expulso (Kick)';
            color = 0xFFA500;
            icon = '👢';
            executor = kickLog.executor;
        } else {
             // Se não foi kick, verifica ban
             const banLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
             const banLog = banLogs.entries.first();
             if (banLog && banLog.target.id === member.id && (Date.now() - banLog.createdTimestamp) < 5000) {
                 reason = 'Banido';
                 color = 0xFF0000;
                 icon = '🚫';
                 executor = banLog.executor;
             }
        }
    } catch (e) { console.error("Erro audit log:", e); }

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `${icon} SAÍDA` })
        .setDescription(`${member.user.tag} saiu do servidor.`)
        .addFields({ name: 'Motivo', value: reason })
        .setTimestamp();

    if (executor) embed.addFields({ name: 'Executor', value: executor.tag });

    channel.send({ embeds: [embed] });
});

// Interações (Botões)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return interaction.reply({ content: '❌ Você não tem permissão para usar isso.', ephemeral: true });
    }

    const [action, targetId] = interaction.customId.split('_');
    const guild = interaction.guild;

    // Tentar buscar usuário mesmo se ele já saiu
    let userTag = targetId;
    try {
        const user = await client.users.fetch(targetId);
        userTag = user.tag;
    } catch {}

    const member = guild.members.cache.get(targetId);

    try {
        if (action === 'kick') {
            if (!member) return interaction.reply({ content: 'Usuário já não está mais no servidor.', ephemeral: true });
            await member.kick(`Expulso via Bot por ${interaction.user.tag}`);
            await interaction.reply({ content: `👢 **${userTag}** foi expulso com sucesso.` });
        }

        if (action === 'ban') {
            await guild.members.ban(targetId, { reason: `Banido via Bot por ${interaction.user.tag}` });
            await interaction.reply({ content: `🔨 **${userTag}** foi banido com sucesso.` });
        }

        if (action === 'info') {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`Relatório: ${userTag}`)
                .setDescription(`ID do Usuário: ${targetId}`)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

    } catch (e) {
        console.error(e);
        interaction.reply({ content: '❌ Erro: Verifique se meu cargo é superior ao do alvo.', ephemeral: true });
    }
});

client.login(CONFIG.TOKEN);