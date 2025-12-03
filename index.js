require('dotenv').config(); // Carrega as variáveis do arquivo .env localmente

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
    MIN_AGE_DAYS: 7, // Contas com menos que isso gerarão alerta vermelho
    AUTO_KICK: false, 
    PORT: process.env.PORT || 3000
};

// --- SERVIDOR WEB (Manter Online) ---
const app = express();
app.get('/', (req, res) => res.send({ status: 'Guardian Online', mode: 'Advanced Logging' }));
app.listen(CONFIG.PORT, () => {
    console.log(`🌐 Sistema Online na porta ${CONFIG.PORT}`);
    
    // Mantém o bot acordado no Render/Replit (opcional)
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) {
        setInterval(() => {
            https.get(renderUrl, (res) => {
                // Apenas para manter a conexão ativa
            }).on('error', (err) => console.error('Ping Error:', err.message));
        }, 5 * 60 * 1000);
    }
});

// --- INTELIGÊNCIA ARTIFICIAL ---
let aiClient;
if (CONFIG.GEMINI_KEY) {
    try {
        aiClient = new GoogleGenAI({ apiKey: CONFIG.GEMINI_KEY });
        console.log('🧠 IA Gemini Conectada.');
    } catch (err) { 
        console.error('Erro ao conectar IA:', err.message); 
    }
} else {
    console.warn('⚠️ AVISO: GEMINI_API_KEY não encontrada no .env');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // OBRIGATÓRIO: Ative "Server Members Intent" no Dev Portal do Discord
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

    // CHAT COM IA (Ao mencionar o bot)
    if (message.mentions.has(client.user)) {
        if (!aiClient) return message.reply("⚠️ **Erro:** Minha API Key da IA não foi configurada no sistema.");
        
        await message.channel.sendTyping();

        try {
            const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim();
            
            // CORREÇÃO AQUI: Uso de crases (backticks) para string de múltiplas linhas
            const systemPrompt = `Você é o Guardião de NewVille, um bot moderador engraçado, direto e bem-humorado. Fale como um cara que faz piada de tudo, mas continua sendo útil e responde qualquer pergunta sem enrolação. Seja rápido, esperto, um pouco sarcástico e com aquele tom de 'tô cansado mas ainda te ajudo'.
Seu objetivo é sempre deixar a resposta clara, simples, com humor, e resolver o que o usuário pediu. Não use linguagem formal. Não pareça um robô. Sempre responda como se fosse uma pessoa zoando enquanto trabalha.`;

            const response = await aiClient.models.generateContent({
                model: 'gemini-1.5-flash', // Alterado para 1.5-flash que é a versão estável atual (se tiver acesso ao 2.5, pode mudar de volta)
                contents: prompt,
                config: { systemInstruction: systemPrompt }
            });

            // Verifica se houve resposta válida
            const replyText = response.text ? response.text() : response.response.text(); 
            await message.reply(replyText || "Não consegui formular uma resposta.");
            
        } catch (error) {
            console.error("Erro IA:", error);
            message.reply("❌ Ocorreu um erro interno ao processar a mensagem com a IA.");
        }
    }
});

// --- SISTEMA DE ENTRADA (COMPLETO) ---
client.on(Events.GuildMemberAdd, async member => {
    try {
        let channel = member.guild.channels.cache.get(CONFIG.ENTRY_CHANNEL);
        // Tenta buscar se não estiver em cache
        if (!channel) {
            try { 
                channel = await member.guild.channels.fetch(CONFIG.ENTRY_CHANNEL); 
            } catch(e) {
                console.error(`Canal de entrada ${CONFIG.ENTRY_CHANNEL} não encontrado.`);
                return;
            }
        }
        
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

        // Botões de ação rápida para moderadores (só aparecem se for suspeito)
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
        if (!channel) {
             try { 
                channel = await member.guild.channels.fetch(CONFIG.EXIT_CHANNEL); 
            } catch(e) { return; }
        }
        
        if (!channel?.isTextBased()) return;

        let reason = 'Saiu por conta própria';
        let color = 0x99AAB5; // Cinza
        let icon = '📤';
        let executor = null;

        // Tenta descobrir se foi Kick ou Ban olhando os Logs do Servidor
        try {
            // Verifica Kick
            const kickLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
            const kickLog = kickLogs.entries.first();
            
            // Verifica se o log é recente (últimos 5 segundos) e se o alvo é o membro que saiu
            if (kickLog && kickLog.target.id === member.id && (Date.now() - kickLog.createdTimestamp) < 5000) {
                reason = '👢 Expulso (Kick)';
                color = 0xFFA500; // Laranja
                icon = '👢';
                executor = kickLog.executor;
            } else {
                // Verifica Ban
                const banLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
                const banLog = banLogs.entries.first();
                if (banLog && banLog.target.id === member.id && (Date.now() - banLog.createdTimestamp) < 5000) {
                    reason = '🔨 Banido';
                    color = 0xFF0000; // Vermelho
                    icon = '🚫';
                    executor = banLog.executor;
                }
            }
        } catch (e) { 
            // Ignora erro se o bot não tiver permissão "View Audit Log"
        }

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

// --- LÓGICA DOS BOTÕES ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    
    // Verifica permissão de quem clicou
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) 
        return interaction.reply({ content: '❌ Você não tem permissão para usar isso.', ephemeral: true });

    const [action, targetId] = interaction.customId.split('_');

    try {
        // Busca o membro (pode ter saído já)
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

        if (!targetMember) {
            return interaction.reply({ content: '❌ Usuário não encontrado no servidor (provavelmente já saiu).', ephemeral: true });
        }

        if (action === 'kick') {
            await targetMember.kick('Ação via Bot de Entrada (Botão)');
            interaction.reply({ content: `✅ **${targetMember.user.tag}** foi expulso.`, ephemeral: true });
        }
        if (action === 'ban') {
            await targetMember.ban({ reason: 'Ação via Bot de Entrada (Botão)' });
            interaction.reply({ content: `✅ **${targetMember.user.tag}** foi banido.`, ephemeral: true });
        }
    } catch (e) { 
        console.error(e);
        interaction.reply({ content: '❌ Erro ao punir. Verifique se meu cargo é superior ao do alvo.', ephemeral: true }); 
    }
});

client.login(CONFIG.TOKEN);
