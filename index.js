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
    AuditLogEvent
} from 'discord.js';

import express from 'express';
import https from 'https';
import { GoogleGenAI } from "@google/genai";

// --- CONFIGURAÇÃO ---
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    GEMINI_KEY: process.env.GEMINI_API_KEY, 
    
    // CANAIS
    ENTRY_CHANNEL: '1445105097796223078',
    EXIT_CHANNEL: '1445105144869032129',
    COTACAO_CHANNEL: '1446631169054740602',
    
    // CARGOS
    BOOSTER_ROLE_ID: '1441086318229848185', // ID do Cargo Booster
    
    MIN_AGE_DAYS: 7,
    AUTO_KICK: false,
    PORT: process.env.PORT || 3000
};

// Função para extrair números (Melhorada para aceitar "50k", "1m", etc)
function extrairValor(texto) {
    if (!texto) return null;
    // Remove pontos de milhar, R$, espaços extras
    const clean = texto.toLowerCase().replace(/r\$/g, '').replace(/\./g, '').replace(/,/g, '.');
    
    // Suporte a 'k' (mil)
    if (clean.includes('k')) {
        const match = clean.match(/(\d+(\.\d+)?)k/);
        return match ? parseFloat(match[1]) * 1000 : null;
    }
    // Suporte a 'm' (milhão)
    if (clean.includes('m')) {
        const match = clean.match(/(\d+(\.\d+)?)m/);
        return match ? parseFloat(match[1]) * 1000000 : null;
    }
    
    const match = clean.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
}

// --- SERVIDOR WEB (Para o Render não desligar o bot) ---
const app = express();
app.get('/', (req, res) => res.send({ status: 'Guardian Online', version: '2.0.0 ESM' }));
app.listen(CONFIG.PORT, () => {
    console.log(`🌐 Sistema Online na porta ${CONFIG.PORT}`);
    // Mantém o bot acordado se tiver URL externa
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) {
        setInterval(() => {
            https.get(renderUrl, () => {}).on('error', () => {});
        }, 5 * 60 * 1000);
    }
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
    partials: [
        Partials.GuildMember, 
        Partials.User, 
        Partials.Channel, // Necessário para Fóruns
        Partials.Message
    ]
});

// =========================================================
// 📌 SISTEMA PRINCIPAL
// =========================================================
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // 🔒 COMANDOS DE SEGURANÇA
    if (message.content === '!lock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) 
            return message.reply('❌ Sem permissão.');
        
        if (message.channel.isThread()) {
             await message.channel.setLocked(true);
             return message.reply('🔒 Tópico trancado.');
        }
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.reply('🔒 **BLOQUEIO DE EMERGÊNCIA:** Este canal foi trancado.');
    }

    if (message.content === '!unlock') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) 
            return message.reply('❌ Sem permissão.');
        
        if (message.channel.isThread()) {
             await message.channel.setLocked(false);
             return message.reply('🔓 Tópico destrancado.');
        }
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        return message.reply('🔓 **DESBLOQUEADO:** O canal está aberto novamente.');
    }

    // 💰 SISTEMA DE COTAÇÃO
    // Verifica ID do canal ou se é um tópico dentro do canal de cotação
    const isCotacaoChannel = 
        message.channel.id === CONFIG.COTACAO_CHANNEL || 
        message.channel.parentId === CONFIG.COTACAO_CHANNEL;

    if (isCotacaoChannel) {
        // Se for tópico, tenta ler o valor do título também
        let textToAnalyze = message.content;
        if (message.channel.isThread()) {
            textToAnalyze += ' ' + message.channel.name;
        }

        const valorVeiculo = extrairValor(textToAnalyze);

        if (valorVeiculo && valorVeiculo > 0) {
            await message.channel.sendTyping();

            // Verifica cargo Booster
            const isBooster = message.member.roles.cache.has(CONFIG.BOOSTER_ROLE_ID);
            const porcentagem = isBooster ? 10 : 15;

            const taxa = valorVeiculo * (porcentagem / 100);
            const valorFinal = valorVeiculo + taxa;

            const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

            // Configuração Visual
            const cor = isBooster ? 0xFF73FA : 0x2B2D31; // Rosa para Booster, Cinza padrão
            const titulo = isBooster ? '🚀 Cotação Booster Aplicada' : '📋 Cotação Padrão';
            const rodape = isBooster ? 'Benefício de taxa reduzida ativo.' : 'Dica: Boosters pagam apenas 10% de taxa.';

            const embed = new EmbedBuilder()
                .setColor(cor)
                .setTitle(titulo)
                .setDescription(`Cálculo automático para **${message.author.username}**`)
                .addFields(
                    { name: 'Valor Base', value: `\`${fmt.format(valorVeiculo)}\``, inline: true },
                    { name: `Taxa (${porcentagem}%)`, value: `\`+ ${fmt.format(taxa)}\``, inline: true },
                    { name: '💰 VALOR FINAL DO VEÍCULO', value: `## ${fmt.format(valorFinal)}`, inline: false }
                )
                .setFooter({ text: rodape })
                .setTimestamp();

            try {
                return await message.reply({ embeds: [embed] });
            } catch (err) {
                console.error('Erro ao enviar cotação:', err);
            }
        }
    }

    // 🤖 CHAT COM IA
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
// 👋 SISTEMA DE ENTRADA (ADMIN LOG)
// =========================================================
client.on(Events.GuildMemberAdd, async member => {
    try {
        let channel = member.guild.channels.cache.get(CONFIG.ENTRY_CHANNEL);
        // Tenta buscar se não estiver em cache
        if (!channel) try { channel = await member.guild.channels.fetch(CONFIG.ENTRY_CHANNEL); } catch(e) {}

        if (!channel?.isTextBased()) return;

        const createdAt = member.user.createdAt;
        const diffDays = Math.floor((Date.now() - createdAt) / 86400000);
        const isSuspicious = diffDays < CONFIG.MIN_AGE_DAYS;
        const dateString = createdAt.toLocaleDateString('pt-BR');

        const embed = new EmbedBuilder()
            .setColor(isSuspicious ? 0xED4245 : 0x57F287) // Vermelho se for nova, Verde se ok
            .setAuthor({ name: `${member.user.tag} Entrou`, iconURL: member.user.displayAvatarURL() })
            .setTitle(isSuspicious ? '⛔ CONTA DE RISCO (Nova)' : '✅ Entrada Segura')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '👤 Membro', value: `${member} (${member.id})` },
                { name: '📅 Conta criada em', value: dateString },
                { name: '⏳ Idade da conta', value: `${diffDays} dias` }
            )
            .setFooter({ text: `Total de membros: ${member.guild.memberCount}` })
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
// 📤 SISTEMA DE SAÍDA (ADMIN LOG)
// =========================================================
client.on(Events.GuildMemberRemove, async member => {
    try {
        let channel = member.guild.channels.cache.get(CONFIG.EXIT_CHANNEL);
        if (!channel) try { channel = await member.guild.channels.fetch(CONFIG.EXIT_CHANNEL); } catch(e) {}
        if (!channel?.isTextBased()) return;

        // Pequeno delay para garantir que o Audit Log atualize
        await new Promise(r => setTimeout(r, 2000));

        let reason = 'Saiu por conta própria';
        let color = 0xFEE75C; // Amarelo
        let icon = '👋';
        let executor = null;

        try {
            const kickLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
            const kickLog = kickLogs.entries.first();

            // Verifica se o kick aconteceu nos últimos 5 segundos
            if (kickLog && kickLog.target.id === member.id && (Date.now() - kickLog.createdTimestamp) < 10000) {
                reason = '👢 Expulso (Kick)';
                color = 0xE67E22; // Laranja
                icon = '👢';
                executor = kickLog.executor;
            } else {
                const banLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
                const banLog = banLogs.entries.first();

                if (banLog && banLog.target.id === member.id && (Date.now() - banLog.createdTimestamp) < 10000) {
                    reason = '🔨 Banido';
                    color = 0xED4245; // Vermelho
                    icon = '🚫';
                    executor = banLog.executor;
                }
            }
        } catch (e) { console.error('Erro audit log:', e); }

        const embed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({ name: `Saída: ${member.user.tag}`, iconURL: member.user.displayAvatarURL() })
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
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
