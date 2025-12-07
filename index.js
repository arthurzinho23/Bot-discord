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

// --- CONFIGURAÇÃO ---
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    GEMINI_KEY: process.env.GEMINI_API_KEY, 
    
    // CANAIS
    ENTRY_CHANNEL: '1445105097796223078',
    EXIT_CHANNEL: '1445105144869032129',
    COTACAO_CHANNEL: '1446631169054740602', // Deve ser um Canal de Fórum
    
    // CARGOS
    BOOSTER_ROLE_ID: '1441086318229848185', // ID do Cargo Booster
    
    MIN_AGE_DAYS: 7,
    AUTO_KICK: false,
    PORT: process.env.PORT || 3000
};

// Função Fallback (Regex simples caso a IA falhe)
function extrairValorManual(texto) {
    if (!texto) return null;
    const clean = texto.toLowerCase().replace(/r$/g, '').replace(/./g, '').replace(/,/g, '.');
    
    if (clean.includes('k')) {
        const match = clean.match(/(d+(.d+)?)k/);
        return match ? parseFloat(match[1]) * 1000 : null;
    }
    if (clean.includes('m')) {
        const match = clean.match(/(d+(.d+)?)m/);
        return match ? parseFloat(match[1]) * 1000000 : null;
    }
    const match = clean.match(/(d+)/);
    return match ? parseInt(match[1]) : null;
}

// --- SERVIDOR WEB ---
const app = express();
app.get('/', (req, res) => res.send({ status: 'Guardian Online', version: '2.7.0 Robust-AI' }));
app.listen(CONFIG.PORT, () => {
    console.log(`🌐 Sistema Online na porta ${CONFIG.PORT}`);
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
    partials: [Partials.GuildMember, Partials.User, Partials.Channel, Partials.Message]
});

// =========================================================
// 📌 SISTEMA PRINCIPAL
// =========================================================
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // 🆕 COMANDO PARA CRIAR TÓPICO NO FÓRUM
    // Uso: !novo Título do Carro | Descrição e preço...
    if (message.content.startsWith('!novo')) {
        const args = message.content.slice(6).split('|');
        if (args.length < 2) return message.reply('❌ Uso correto: `!novo Título do Veículo | Descrição e Preço...`');

        const titulo = args[0].trim();
        const conteudo = args[1].trim();

        try {
            const forumChannel = message.guild.channels.cache.get(CONFIG.COTACAO_CHANNEL);
            if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
                return message.reply('❌ O canal de cotação configurado não é um Fórum válido.');
            }

            const thread = await forumChannel.threads.create({
                name: titulo,
                message: {
                    content: `Postado por: ${message.author}\n\n${conteudo}`
                }
            });

            return message.reply(`✅ Tópico criado com sucesso: ${thread}`);
        } catch (error) {
            console.error(error);
            return message.reply('❌ Erro ao criar tópico. Verifique minhas permissões.');
        }
    }

    // 🔒 COMANDOS DE SEGURANÇA (SIMPLES)
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

    // 💰 SISTEMA DE COTAÇÃO (COM EXTRAÇÃO VIA IA)
    const isCotacaoChannel = message.channel.id === CONFIG.COTACAO_CHANNEL || message.channel.parentId === CONFIG.COTACAO_CHANNEL;

    if (isCotacaoChannel) {
        let valorVeiculo = 0;
        let textToAnalyze = message.content;
        
        if (message.channel.isThread()) {
            textToAnalyze = `${message.channel.name} ${message.content}`;
        }

        if (aiClient) {
            try {
                const extractionPrompt = `
                Analise o texto e identifique o PREÇO (VALOR) pedido.
                Retorne APENAS o número inteiro (Ex: 50k -> 50000).
                Se não achar, retorne 0.
                Texto: "${textToAnalyze}"
                `;

                const result = await aiClient.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: extractionPrompt
                });
                
                const extractedText = result.text ? result.text.trim().replace(/[^0-9]/g, '') : '0';
                const aiValue = parseInt(extractedText);
                if (!isNaN(aiValue) && aiValue > 0) valorVeiculo = aiValue;
            } catch (e) { console.error("Erro IA Cotação (não fatal):", e.message); }
        }

        if (valorVeiculo === 0) valorVeiculo = extrairValorManual(textToAnalyze) || 0;

        if (valorVeiculo > 0) {
            await message.channel.sendTyping();

            const isBooster = message.member.roles.cache.has(CONFIG.BOOSTER_ROLE_ID);
            const porcentagem = isBooster ? 10 : 15;
            const taxa = valorVeiculo * (porcentagem / 100);
            const valorFinal = valorVeiculo + taxa;

            const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
            const cor = isBooster ? 0xFF73FA : 0x2B2D31;
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

            try { return await message.reply({ embeds: [embed] }); } catch (err) { console.error(err); }
        }
    }

    // 🤖 CHAT COM IA
    if (message.mentions.has(client.user)) {
        if (!aiClient) return message.reply("⚠️ **Erro:** API Key não configurada.");
        
        const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim();
        if (!prompt) return message.reply("❓ Manda um texto aí junto com a menção.");

        await message.channel.sendTyping();

        try {
            const systemPrompt = `
            Você é o Guardião de NewVille, um bot moderador engraçado e zoeiro.
            Responda de forma curta, útil e descontraída. O servidor é RP nos EUA.
            `;

            const response = await aiClient.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { systemInstruction: systemPrompt }
            });

            await message.reply(response.text || "Não entendi nada, parça.");
        } catch (error) {
            console.error("Erro COMPLETO da IA:", error);
            // Mensagem amigável de erro
            message.reply(`❌ A IA deu erro: ${error.message || 'Erro desconhecido'}. Verifique os logs do Render.`);
        }
    }
});

// =========================================================
// 👋 ENTRADA
// =========================================================
client.on(Events.GuildMemberAdd, async member => {
    try {
        let channel = member.guild.channels.cache.get(CONFIG.ENTRY_CHANNEL);
        if (!channel) try { channel = await member.guild.channels.fetch(CONFIG.ENTRY_CHANNEL); } catch(e) {}
        if (!channel?.isTextBased()) return;

        const diffDays = Math.floor((Date.now() - member.user.createdAt) / 86400000);
        const isSuspicious = diffDays < CONFIG.MIN_AGE_DAYS;

        const embed = new EmbedBuilder()
            .setColor(isSuspicious ? 0xED4245 : 0x57F287)
            .setAuthor({ name: `${member.user.tag} Entrou`, iconURL: member.user.displayAvatarURL() })
            .setTitle(isSuspicious ? '⛔ CONTA DE RISCO (Nova)' : '✅ Entrada Segura')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '👤 Membro', value: `${member} (${member.id})` },
                { name: '📅 Criada em', value: member.user.createdAt.toLocaleDateString('pt-BR') },
                { name: '⏳ Idade', value: `${diffDays} dias` }
            )
            .setFooter({ text: `Membros: ${member.guild.memberCount}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`kick_${member.id}`).setLabel('Kick').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ban_${member.id}`).setLabel('Ban').setStyle(ButtonStyle.Danger)
        );

        await channel.send({ 
            content: isSuspicious ? '||@here|| 🚨 Alerta!' : null, 
            embeds: [embed], 
            components: isSuspicious ? [row] : [] 
        });
    } catch (e) { console.error(e); }
});

// =========================================================
// 📤 SAÍDA
// =========================================================
client.on(Events.GuildMemberRemove, async member => {
    try {
        let channel = member.guild.channels.cache.get(CONFIG.EXIT_CHANNEL);
        if (!channel) try { channel = await member.guild.channels.fetch(CONFIG.EXIT_CHANNEL); } catch(e) {}
        if (!channel?.isTextBased()) return;

        await new Promise(r => setTimeout(r, 2000));
        let reason = 'Saiu sozinho';
        let color = 0xFEE75C;
        let executor = null;

        try {
            const logs = await member.guild.fetchAuditLogs({ limit: 1 });
            const log = logs.entries.first();
            if (log && log.target.id === member.id && (Date.now() - log.createdTimestamp) < 10000) {
                if (log.action === AuditLogEvent.MemberKick) { reason = '👢 Kick'; color = 0xE67E22; executor = log.executor; }
                if (log.action === AuditLogEvent.MemberBanAdd) { reason = '🔨 Ban'; color = 0xED4245; executor = log.executor; }
            }
        } catch (e) {}

        const embed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({ name: `Saída: ${member.user.tag}`, iconURL: member.user.displayAvatarURL() })
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setDescription(`${reason === 'Saiu sozinho' ? '👋' : '🚫'} **${reason}**`)
            .addFields({ name: '👤 Membro', value: `${member.user.tag}`, inline: true }, { name: '🆔 ID', value: `${member.id}`, inline: true })
            .setTimestamp();

        if (executor) embed.addFields({ name: '👮 Executor', value: `${executor.tag}` });
        channel.send({ embeds: [embed] });
    } catch (e) { console.error(e); }
});

client.on(Events.InteractionCreate, async i => {
    if (!i.isButton()) return;
    if (!i.member.permissions.has(PermissionFlagsBits.KickMembers)) return i.reply({ content: '❌ Sem perm.', ephemeral: true });
    const [action, id] = i.customId.split('_');
    try {
        if (action === 'kick') { await i.guild.members.kick(id); i.reply({ content: '👢 Kickado.', ephemeral: true }); }
        if (action === 'ban') { await i.guild.members.ban(id); i.reply({ content: '🔨 Banido.', ephemeral: true }); }
    } catch (e) { i.reply({ content: '❌ Erro.', ephemeral: true }); }
});

client.login(CONFIG.TOKEN);
