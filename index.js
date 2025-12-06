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
    
    // Configuração da Cotação
    QUOTATION_CHANNEL: '1446631169054740602', // Canal onde a cotação funciona
    VIP_ROLE: '1441086318229848185',        // Cargo com desconto (10%)
    
    MIN_AGE_DAYS: 7, 
    AUTO_KICK: false, 
    PORT: process.env.PORT || 3000
};

// --- SERVIDOR WEB (Manter Online) ---
const app = express();
app.get('/', (req, res) => res.send({ status: 'Guardian Online', mode: 'Advanced Logging' }));
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
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.GuildMember, Partials.User]
});

// --- COMANDOS E IA ---
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // --- CORREÇÃO: IGNORAR EVERYONE E HERE ---
    // Se a mensagem mencionar everyone ou here, o bot para de ler aqui.
    if (message.mentions.everyone) return;

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

    // --- SISTEMA DE COTAÇÃO DE VEÍCULOS ---
    // Verifica se está no canal certo e se o bot foi mencionado
    if (message.channel.id === CONFIG.QUOTATION_CHANNEL && message.mentions.has(client.user)) {
        
        // Procura por "Valor: XXXXX" na mensagem (Case insensitive)
        // Expressão regular para pegar números com pontos e vírgulas
        const match = message.content.match(/Valor:\s*([\d.,]+)/i);

        if (match) {
            // Limpa o valor (remove pontos de milhar, troca vírgula decimal por ponto para cálculo JS)
            // Ex: 15.000 -> 15000 | 15.000,00 -> 15000.00
            let rawValue = match[1].replace(/\./g, '').replace(',', '.');
            let baseValue = parseFloat(rawValue);

            if (!isNaN(baseValue)) {
                // Verifica se tem o cargo VIP
                const hasVip = message.member.roles.cache.has(CONFIG.VIP_ROLE);
                
                // Lógica da porcentagem
                const percentage = hasVip ? 0.10 : 0.15; // 10% ou 15%
                const finalValue = baseValue * (1 + percentage);

                // Formatação para BRL (R$)
                const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

                const embed = new EmbedBuilder()
                    .setColor(hasVip ? 0xFFD700 : 0x0099FF) // Dourado se VIP, Azul se normal
                    .setTitle('🚗 Cotação Veicular')
                    .addFields(
                        { name: 'Valor Original', value: formatter.format(baseValue), inline: true },
                        { name: 'Taxa Aplicada', value: hasVip ? '10% (VIP)' : '15% (Padrão)', inline: true },
                        { name: '💰 Valor Final', value: `**${formatter.format(finalValue)}**`, inline: false }
                    )
                    .setFooter({ text: 'Sistema de Cotação Automática' });

                return message.reply({ embeds: [embed] });
            } else {
                return message.reply("⚠️ Não entendi o valor. Use o formato: `@Bot Valor: 15.000`");
            }
        }
    }

    // --- CHAT COM IA ---
    // Só roda se foi mencionado, NÃO é everyone e NÃO entrou no if da cotação acima
    if (message.mentions.has(client.user)) {
        if (!aiClient) return message.reply("⚠️ **Erro:** Minha API Key não foi configurada no sistema.");
        
        // Se estiver no canal de cotação mas não mandou "Valor:", avisa o formato
        if (message.channel.id === CONFIG.QUOTATION_CHANNEL) {
             return message.reply("Neste canal eu só faço contas! Mande: `@MeuNome Valor: 15.000`");
        }

        await message.channel.sendTyping();

        try {
            const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim();
            
            const systemPrompt = `Você é o Guardião de NewVille, um bot moderador engraçado, direto e bem-humorado. Fale como um cara que faz piada de tudo, mas continua sendo útil e responde qualquer pergunta sem enrolação. Seja rápido, esperto, um pouco sarcástico e com aquele tom de 'tô cansado mas ainda te ajudo'.
Seu objetivo é sempre deixar a resposta clara, simples, com humor, e resolver o que o usuário pediu. Não use linguagem formal. Não pareça um robô. Sempre responda como se fosse uma pessoa zoando enquanto trabalha o servidor se passa nos EUA.`;

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

// --- SISTEMA DE ENTRADA (COMPLETO) ---
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
            .setColor(isSuspicious ? 0xED4245 : 0x57F287) // Vermelho (Risco) ou Verde (Seguro)
            .setAuthor({ name: `${member.user.tag} Entrou`, iconURL: member.user.displayAvatarURL() })
            .setTitle(isSuspicious ? '⛔ CONTA DE RISCO (Nova)' : '✅ Entrada Segura')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '👤 Membro', value: `${member} (${member.id})`, inline: false },
                { name: '📅 Data da Conta', value: `${dateString}`, inline: true },
                { name: '⏳ Idade', value: `${diffDays} dias`, inline: true },
                { name: '🛡️ Status', value: isSuspicious ? '⚠️ **SUSPEITO**' : '🟢 Seguro', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `Membro #${member.guild.memberCount}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`kick_${member.id}`).setLabel('Expulsar').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ban_${member.id}`).setLabel('Banir').setStyle(ButtonStyle.Danger)
        );

        await channel.send({ 
            content: isSuspicious ? `||@here|| 🚨 **ALERTA:** Conta criada há menos de ${CONFIG.MIN_AGE_DAYS} dias!` : null,
            embeds: [embed], 
            components: isSuspicious ? [row] : [] 
        });

    } catch (e) { console.error('Erro Entrada:', e); }
});

// --- SISTEMA DE SAÍDA AVANÇADO (AUDIT LOGS) ---
client.on(Events.GuildMemberRemove, async member => {
    try {
        let channel = member.guild.channels.cache.get(CONFIG.EXIT_CHANNEL);
        if (!channel) try { channel = await member.guild.channels.fetch(CONFIG.EXIT_CHANNEL); } catch(e) {}
        if (!channel?.isTextBased()) return;

        let reason = 'Saiu por conta própria';
        let color = 0x99AAB5; // Cinza
        let icon = '📤';
        let executor = null;

        try {
            const kickLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
            const kickLog = kickLogs.entries.first();
            if (kickLog && kickLog.target.id === member.id && (Date.now() - kickLog.createdTimestamp) < 5000) {
                reason = '👢 Expulso (Kick)';
                color = 0xFFA500; // Laranja
                icon = '👢';
                executor = kickLog.executor;
            } else {
                const banLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
                const banLog = banLogs.entries.first();
                if (banLog && banLog.target.id === member.id && (Date.now() - banLog.createdTimestamp) < 5000) {
                    reason = '🔨 Banido';
                    color = 0xFF0000; // Vermelho
                    icon = '🚫';
                    executor = banLog.executor;
                }
            }
        } catch (e) { console.log("Sem permissão para ler AuditLogs"); }

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
            embed.addFields({ name: '👮 Executor', value: `${executor.tag}`, inline: false });
            embed.setThumbnail(executor.displayAvatarURL());
        }

        channel.send({ embeds: [embed] });

    } catch(e) { console.error('Erro Saída:', e); }
});

// --- BOTÕES ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) 
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });

    const [action, targetId] = interaction.customId.split('_');

    try {
        if (action === 'kick') {
            await interaction.guild.members.kick(targetId, 'Bot Action');
            interaction.reply({ content: '✅ Expulso.', ephemeral: true });
        }
        if (action === 'ban') {
            await interaction.guild.members.ban(targetId);
            interaction.reply({ content: '✅ Banido.', ephemeral: true });
        }
    } catch (e) { interaction.reply({ content: '❌ Erro ao punir.', ephemeral: true }); }
});

client.login(CONFIG.TOKEN);