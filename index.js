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
const https = require('https'); // Usar https nativo para compatibilidade
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
        status: '🛡️ Guardian Online (Car Edition)', 
        uptime: process.uptime(),
        date: new Date().toISOString()
    });
});

app.get('/ping', (req, res) => res.status(200).send('Pong!'));

app.listen(CONFIG.PORT, () => {
    console.log(`🌐 Servidor Web rodando na porta ${CONFIG.PORT}`);
    
    // Sistema Anti-Sleep (Ping automático via HTTPS nativo)
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) {
        console.log(`⏰ Anti-Sleep ativado para: ${renderUrl}`);
        setInterval(() => {
            https.get(`${renderUrl}/ping`, (res) => {
                console.log(`💓 Heartbeat enviado. Status: ${res.statusCode}`);
            }).on('error', (e) => {
                console.error(`💔 Falha no Heartbeat: ${e.message}`);
            });
        }, 5 * 60 * 1000); // 5 minutos
    }
});

// --- CLIENTE DISCORD & IA ---
console.log('🔄 INICIANDO CLIENTE DISCORD...');

let aiClient;
if (CONFIG.GEMINI_KEY) {
    try {
        aiClient = new GoogleGenAI({ apiKey: CONFIG.GEMINI_KEY });
        console.log('🧠 IA Gemini Conectada (Modo Gearhead Ativado).');
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
        if (!prompt) return message.reply("Fala tu, gearhead! Quer saber o que?");

        // --- PERSONALIDADE CARROS & ZOEIRA ---
        const systemPrompt = `
            Você é o Guardian, um mecânico virtual zoeiro, engraçado e viciado em carros que modera este servidor.
            DIRETRIZES:
            1. SUAS RESPOSTAS DEVEM SER CURTAS E DIRETAS (Máximo 2 ou 3 frases).
            2. Use gírias de carro (ex: lasanha, manco, apzeiro, gearhead, piloto de reta).
            3. Seja engraçado e faça piadas com carros ruins (Marea, Peugeot velho, Kwid).
            4. Se te perguntarem algo sério, responda, mas faça uma analogia com carros.
            5. Nunca escreva textos longos.
        `;

        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: systemPrompt,
                maxOutputTokens: 150 // Força respostas curtas
            }
        });

        const textResponse = response.text || "Ih, o motor pifou aqui. Tenta de novo.";

        await message.reply(textResponse);

    } catch (error) {
        console.error("Erro na IA:", error);
        message.reply("Deu pau na injeção eletrônica aqui (Erro na API).");
    }
});

client.once(Events.ClientReady, c => {
    console.log(`✅ LOGIN REALIZADO: ${c.user.tag}`);
    client.user.setActivity('🚗 Roncando o motor');
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
            .setAuthor({ name: `${member.user.tag} estacionou na garagem`, iconURL: member.user.displayAvatarURL() })
            .setTitle(isSuspicious ? '⛔ CARRO ROUBADO (SUSPEITO)' : '✅ Novo Piloto')
            .addFields(
                { name: 'ID', value: ```yaml\n${member.id}\n``` },
                { name: 'Bot?', value: ```${member.user.bot ? 'Sim' : 'Não'}``` },
                { name: 'Tempo de CNH (Conta)', value: `${diffDays} dias\n${createProgressBar(diffDays, 30)}` }
            )
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`kick_${member.id}`).setLabel('GUINCHAR (Kick)').setEmoji('🥾').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`ban_${member.id}`).setLabel('PRENDER (Ban)').setEmoji('🔨').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`info_${member.id}`).setLabel('DOCUMENTO').setEmoji('📄').setStyle(ButtonStyle.Secondary)
            );

        const channel = member.guild.channels.cache.get(CONFIG.ENTRY_CHANNEL);
        if (channel?.isTextBased()) {
            await channel.send({
                content: isSuspicious ? `||@here|| 🚨 ALERTA DE CLONAGEM` : null,
                embeds: [embed],
                components: [row]
            });
        }

        if (CONFIG.AUTO_KICK && isSuspicious) {
            await member.kick("Auto defesa: Conta muito nova (CNH Cassada)");
        }
    } catch (e) { console.error('Erro no GuildMemberAdd:', e); }
});

// Saída de membro
client.on(Events.GuildMemberRemove, async member => {
    const channel = member.guild.channels.cache.get(CONFIG.EXIT_CHANNEL);
    if (!channel?.isTextBased()) return;

    let reason = 'Vendeu o carro e saiu';
    let color = 0x99AAB5;
    let icon = '📤';
    let executor = null;

    try {
        const logs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
        const kickLog = logs.entries.first();
        
        if (kickLog && kickLog.target.id === member.id && (Date.now() - kickLog.createdTimestamp) < 5000) {
            reason = 'Guinchado (Kick)';
            color = 0xFFA500;
            icon = '👢';
            executor = kickLog.executor;
        } else {
             const banLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
             const banLog = banLogs.entries.first();
             if (banLog && banLog.target.id === member.id && (Date.now() - banLog.createdTimestamp) < 5000) {
                 reason = 'CNH Cassada (Ban)';
                 color = 0xFF0000;
                 icon = '🚫';
                 executor = banLog.executor;
             }
        }
    } catch (e) { console.error("Erro audit log:", e); }

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `${icon} SAÍDA` })
        .setDescription(`${member.user.tag} saiu cantando pneu.`)
        .addFields({ name: 'Motivo', value: reason })
        .setTimestamp();

    if (executor) embed.addFields({ name: 'Executor', value: executor.tag });

    channel.send({ embeds: [embed] });
});

// Interações (Botões)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return interaction.reply({ content: '❌ Você não tem carteira pra dirigir essa máquina.', ephemeral: true });
    }

    const [action, targetId] = interaction.customId.split('_');
    const guild = interaction.guild;

    let userTag = targetId;
    try {
        const user = await client.users.fetch(targetId);
        userTag = user.tag;
    } catch {}

    const member = guild.members.cache.get(targetId);

    try {
        if (action === 'kick') {
            if (!member) return interaction.reply({ content: 'O cara já sumiu na neblina.', ephemeral: true });
            await member.kick(`Guinchado por ${interaction.user.tag}`);
            await interaction.reply({ content: `👢 **${userTag}** foi guinchado com sucesso.` });
        }

        if (action === 'ban') {
            await guild.members.ban(targetId, { reason: `Apreendido por ${interaction.user.tag}` });
            await interaction.reply({ content: `🔨 **${userTag}** teve o carro apreendido (Ban).` });
        }

        if (action === 'info') {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`Documento: ${userTag}`)
                .setDescription(`Chassi (ID): ${targetId}`)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

    } catch (e) {
        console.error(e);
        interaction.reply({ content: '❌ Erro: Meu nitro falhou (Sem permissão).', ephemeral: true });
    }
});

client.login(CONFIG.TOKEN);