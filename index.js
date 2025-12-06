User
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
COTACAO_CHANNEL: '1446631169054740602',
MIN_AGE_DAYS: 7,
AUTO_KICK: false,
PORT: process.env.PORT || 3000
};
// --- SERVIDOR WEB (Manter Online) ---
const app = express();
app.get('/', (req, res) => res.send({ status: 'Guardian Online', mode: 'Advanced Logging' }));
app.listen(CONFIG.PORT, () => {
console.log(🌐 Sistema Online na porta ${CONFIG.PORT});
const renderUrl = process.env.RENDER_EXTERNAL_URL;
if (renderUrl) setInterval(() => https.get(${renderUrl}), 5 * 60 * 1000);
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
GatewayIntentBits.GuildMembers,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent,
GatewayIntentBits.GuildModeration
],
partials: [Partials.GuildMember, Partials.User]
});
// ======================================
//   SISTEMA DE COTAÇÃO AUTOMÁTICO
// ======================================
client.on("messageCreate", async (message) => {
if (message.author.bot) return;
code
Code
if (message.channel.id === CONFIG.COTACAO_CHANNEL) {

    // Extrai número da mensagem
    const texto = message.content.trim();
    const valorMatch = texto.replace(",", ".").match(/(\d+(\.\d+)?)/);
    if (!valorMatch) return;

    const valor = parseFloat(valorMatch[0]);

    try {
        // Cria o tópico automaticamente
        const thread = await message.channel.threads.create({
            name: `Cotação — ${valor}`,
            autoArchiveDuration: 60,
            reason: "Cotação automática"
        });

        // Envia a cotação dentro do tópico
        await thread.send(
            `📈 **Cotação Criada**
💵 Valor informado: `${valor}`
Pronto, agora continue sua negociação aqui dentro do tópico.`
);
code
Code
} catch (err) {
        console.error("Erro ao criar tópico:", err);
        message.reply("❌ Não consegui criar o tópico da cotação.");
    }
    return;
}

// ======================================
//   SISTEMA DE IA (Responder @Bot)
// ======================================
if (message.mentions.has(client.user)) {
    if (!aiClient) return message.reply("⚠️ **Erro:** Minha API Key não foi configurada no sistema.");
    await message.channel.sendTyping();

    try {
        const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim();
        const systemPrompt = `Você é o Guardião de NewVille, um bot moderador engraçado, direto e bem-humorado.`;

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
// ======================================
//   SISTEMA DE ENTRADA
// ======================================
client.on(Events.GuildMemberAdd, async member => {
try {
let channel = member.guild.channels.cache.get(CONFIG.ENTRY_CHANNEL);
if (!channel) try { channel = await member.guild.channels.fetch(CONFIG.ENTRY_CHANNEL); } catch(e) {}
if (!channel?.isTextBased()) return;
code
Code
const createdAt = member.user.createdAt;
    const diffDays = Math.floor((Date.now() - createdAt) / 86400000);
    const isSuspicious = diffDays < CONFIG.MIN_AGE_DAYS;
    const dateString = createdAt.toLocaleDateString('pt-BR');

    const embed = new EmbedBuilder()
        .setColor(isSuspicious ? 0xED4245 : 0x57F287)
        .setAuthor({ name: `${member.user.tag} Entrou`, iconURL: member.user.displayAvatarURL() })
        .setTitle(isSuspicious ? '⛔ CONTA DE RISCO (Nova)' : '✅ Entrada Segura')
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: '👤 Membro', value: `${member} (${member.id})` },
            { name: '📅 Data da Conta', value: `${dateString}`, inline: true },
            { name: '⏳ Idade', value: `${diffDays} dias`, inline: true },
            { name: '🛡️ Status', value: isSuspicious ? '⚠️ SUSPEITO' : '🟢 Seguro', inline: true }
        )
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`kick_${member.id}`).setLabel('Expulsar').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ban_${member.id}`).setLabel('Banir').setStyle(ButtonStyle.Danger)
    );

    await channel.send({
        content: isSuspicious ? `||@here|| 🚨 **ALERTA:** Conta nova detectada!` : null,
        embeds: [embed],
        components: isSuspicious ? [row] : []
    });

} catch (e) { console.error('Erro Entrada:', e); }
});
// ======================================
//   SISTEMA DE SAÍDA
// ======================================
client.on(Events.GuildMemberRemove, async member => {
try {
let channel = member.guild.channels.cache.get(CONFIG.EXIT_CHANNEL);
if (!channel) try { channel = await member.guild.channels.fetch(CONFIG.EXIT_CHANNEL); } catch(e) {}
if (!channel?.isTextBased()) return;
code
Code
let reason = 'Saiu por conta própria';
    let color = 0x99AAB5;
    let icon = '📤';
    let executor = null;

    try {
        const kickLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
        const kickLog = kickLogs.entries.first();

        if (kickLog && kickLog.target.id === member.id && Date.now() - kickLog.createdTimestamp < 5000) {
            reason = '👢 Expulso (Kick)';
            color = 0xFFA500;
            icon = '👢';
            executor = kickLog.executor;
        } else {
            const banLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
            const banLog = banLogs.entries.first();

            if (banLog && banLog.target.id === member.id && Date.now() - banLog.createdTimestamp < 5000) {
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
        embed.addFields({ name: '👮 Executor', value: `${executor.tag}` });
    }

    channel.send({ embeds: [embed] });

} catch (e) { console.error('Erro Saída:', e); }
});
// ======================================
//   BOTÕES (KICK / BAN)
// ======================================
client.on(Events.InteractionCreate, async interaction => {
if (!interaction.isButton()) return;
if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers))
return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
code
Code
const [action, targetId] = interaction.customId.split('_');

try {
    if (action === 'kick') {
        await interaction.guild.members.kick(targetId);
        interaction.reply({ content: '👢 Membro expulso.', ephemeral: true });
    }
    if (action === 'ban') {
        await interaction.guild.members.ban(targetId);
        interaction.reply({ content: '🚫 Membro banido.', ephemeral: true });
    }
} catch (e) {
    interaction.reply({ content: '❌ Erro ao punir.', ephemeral: true });
}
});
client.login(CONFIG.TOKEN);