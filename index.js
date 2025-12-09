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
// ⚙️ CONFIGURAÇÃO (Preencha os IDs corretamente)
// =========================================================
const CONFIG = {
    // Tokens (Pegos das Variáveis de Ambiente)
    TOKEN: process.env.DISCORD_TOKEN,
    GEMINI_KEY: process.env.GEMINI_API_KEY, 
    
    // 🆔 IDs dos Canais (Configure no .env ou substitua aqui)
    ENTRY_CHANNEL: process.env.ENTRY_CHANNEL_ID || '1445105097796223078',
    EXIT_CHANNEL: process.env.EXIT_CHANNEL_ID || '1445105144869032129',
    COTACAO_CHANNEL: process.env.COTACAO_CHANNEL_ID || '1447967291814973655', 
    
    // 🛡️ Cargos
    BOOSTER_ROLE_ID: '1441086318229848185', 
    
    // ⚙️ Ajustes
    MIN_AGE_DAYS: 7,
    PORT: process.env.PORT || 3000
};

// =========================================================
// 🛠️ FUNÇÕES AUXILIARES
// =========================================================
function extrairValorManual(texto) {
    if (!texto) return null;
    const clean = texto.toLowerCase().replace(/r\$/g, '').replace(/\./g, '').replace(/,/g, '.');
    
    // Tratamento para 'k' (mil) e 'm' (milhão)
    if (clean.includes('k')) {
        const match = clean.match(/(\d+(\.\d+)?)k/);
        return match ? parseFloat(match[1]) * 1000 : null;
    }
    if (clean.includes('m')) {
        const match = clean.match(/(\d+(\.\d+)?)m/);
        return match ? parseFloat(match[1]) * 1000000 : null;
    }
    // Números simples
    const match = clean.match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
}

// =========================================================
// 🌐 SERVIDOR WEB (Para manter online no Render)
// =========================================================
const app = express();
app.get('/', (req, res) => res.send({ 
    status: 'Guardian Online', 
    version: '3.5.0 Fix',
    checks: {
        discord: !!CONFIG.TOKEN,
        ai: !!CONFIG.GEMINI_KEY
    }
}));
app.listen(CONFIG.PORT, () => {
    console.log(`🌐 Web Server rodando na porta ${CONFIG.PORT}`);
    // Self-ping para evitar hibernação (se houver URL externa)
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) {
        setInterval(() => {
            https.get(renderUrl, () => {}).on('error', () => {});
        }, 5 * 60 * 1000);
    }
});

// =========================================================
// 🧠 INTELIGÊNCIA ARTIFICIAL
// =========================================================
let aiClient;
if (CONFIG.GEMINI_KEY) {
    try {
        aiClient = new GoogleGenAI({ apiKey: CONFIG.GEMINI_KEY });
        console.log('🧠 IA Gemini Conectada.');
    } catch (err) { console.error('❌ Erro ao conectar IA:', err.message); }
} else {
    console.warn('⚠️ AVISO: GEMINI_API_KEY não encontrada. Funcionalidades de IA desativadas.');
}

// =========================================================
// 🤖 CLIENTE DISCORD
// =========================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // ⚠️ REQUER "SERVER MEMBERS INTENT" NO DEV PORTAL
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // ⚠️ REQUER "MESSAGE CONTENT INTENT" NO DEV PORTAL
        GatewayIntentBits.GuildModeration // Para ban/kick/audit logs
    ],
    partials: [Partials.GuildMember, Partials.User, Partials.Channel, Partials.Message]
});

// ✅ EVENTO: PRONTO
client.once(Events.ClientReady, async (c) => {
    console.log(`✅ Bot logado como: ${c.user.tag}`);
    console.log('🔍 Verificando canais configurados...');

    const checkChannel = async (name, id) => {
        if (!id) return console.log(`⚪ ${name} não configurado.`);
        try {
            const channel = await client.channels.fetch(id);
            if (channel) console.log(`✅ ${name}: Encontrado (${channel.name})`);
        } catch (e) {
            console.error(`❌ ${name}: NÃO ENCONTRADO (ID: ${id}). Verifique o ID!`);
        }
    };

    await checkChannel('Canal Entrada', CONFIG.ENTRY_CHANNEL);
    await checkChannel('Canal Saída', CONFIG.EXIT_CHANNEL);
    await checkChannel('Canal Cotação', CONFIG.COTACAO_CHANNEL);
});

// 📨 EVENTO: MENSAGEM
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // 🔧 COMANDO DE DEBUG (Para descobrir IDs)
    if (message.content === '!debug') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        return message.reply({
            content: `📊 **Informações do Canal:**\nID Deste Canal: ``${message.channel.id}``\nID da Categoria/Fórum Pai: ``${message.channel.parentId || 'Nenhum'}``\n\n⚙️ **Configuração Atual:**\nCotação Esperada: ``${CONFIG.COTACAO_CHANNEL}```
        });
    }

    // 🆕 COMANDO !novo (Cria tópicos em Fórum)
    if (message.content.startsWith('!novo')) {
        const args = message.content.slice(6).split('|');
        if (args.length < 2) return message.reply('❌ Uso: `!novo Título | Descrição...`');
        
        try {
            const forumChannel = message.guild.channels.cache.get(CONFIG.COTACAO_CHANNEL);
            if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
                // Tenta buscar se não estiver em cache
                const fetched = await message.guild.channels.fetch(CONFIG.COTACAO_CHANNEL).catch(() => null);
                if (!fetched || fetched.type !== ChannelType.GuildForum) {
                    return message.reply(`❌ Canal de Fórum não encontrado ou ID incorreto (${CONFIG.COTACAO_CHANNEL}).`);
                }
            }
            
            await forumChannel.threads.create({
                name: args[0].trim(),
                message: { content: `Postado por: ${message.author}\n\n${args[1].trim()}` }
            });
            message.delete().catch(() => {});
        } catch (error) { 
            console.error(error);
            message.reply('❌ Erro ao criar tópico. Verifique as permissões do bot.'); 
        }
        return;
    }

    // 💰 LÓGICA DE COTAÇÃO
    // Verifica se a mensagem é no canal exato OU em um tópico dentro do canal de fórum configurado
    const isCotacao = message.channel.id === CONFIG.COTACAO_CHANNEL || message.channel.parentId === CONFIG.COTACAO_CHANNEL;

    if (isCotacao) {
        console.log(`📩 Nova mensagem em canal de cotação: ${message.content}`);
        
        let valorVeiculo = 0;
        let textToAnalyze = message.content;
        
        // Se for um tópico de fórum, pega o título também para contexto
        if (message.channel.isThread()) {
            textToAnalyze = `${message.channel.name} ${message.content}`;
        }

        // Tenta via IA Primeiro
        if (aiClient) {
            try {
                const extractionPrompt = `
                Analise este texto de venda de veículo e extraia o PREÇO pedido.
                Retorne APENAS números. Exemplo: "vendo por 50k" -> retorna 50000.
                Se tiver "m", multiplique por milhão. Se tiver "k", por mil.
                Texto: "${textToAnalyze}"
                `;
                
                const result = await aiClient.models.generateContent({ 
                    model: 'gemini-2.5-flash', 
                    contents: extractionPrompt 
                });
                
                const extractedText = result.text ? result.text.trim().replace(/[^0-9]/g, '') : '0';
                const aiValue = parseInt(extractedText);
                if (!isNaN(aiValue) && aiValue > 0) valorVeiculo = aiValue;
            } catch (e) { 
                console.error("Erro IA Cotação:", e.message);
            }
        }

        // Fallback Manual
        if (valorVeiculo === 0) {
            valorVeiculo = extrairValorManual(textToAnalyze) || 0;
        }

        // Se achou valor, gera a cotação
        if (valorVeiculo > 0) {
            await message.channel.sendTyping();

            const isBooster = message.member.roles.cache.has(CONFIG.BOOSTER_ROLE_ID);
            const porcentagem = isBooster ? 10 : 15;
            const taxa = valorVeiculo * (porcentagem / 100);
            const valorFinal = valorVeiculo + taxa;

            const fmt = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const cor = isBooster ? 0xFF73FA : 0x2B2D31;

            const embed = new EmbedBuilder()
                .setColor(cor)
                .setTitle(isBooster ? '💎 Cotação Especial (Booster)' : '📋 Cotação de Veículo')
                .setDescription(`Cálculo gerado para **${message.author}**.
${isBooster ? '✨ **Taxa de 10% Aplicada!**' : ''}`)
                .setThumbnail('https://cdn-icons-png.flaticon.com/512/3097/3097144.png')
                .addFields({
                    name: '🧾 Detalhes Financeiros',
                    value: ```yaml
Valor Base:      R$ ${fmt(valorVeiculo)}
Taxa (${porcentagem}%):        + R$ ${fmt(taxa)}
------------------------------
TOTAL:           R$ ${fmt(valorFinal)}
```,
                    inline: false
                })
                .setFooter({ text: 'Guardian Systems • Vendas Automáticas' })
                .setTimestamp();

            await message.reply({ embeds: [embed] }).catch(err => console.error("Erro ao enviar cotação:", err));
        }
    }

    // 🤖 CHATBOT
    if (message.mentions.has(client.user) && !message.author.bot) {
        if (message.mentions.everyone) return;
        
        await message.channel.sendTyping();
        const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim();

        if (!aiClient) return message.reply("❌ IA não configurada (sem API Key).");

        try {
            const chatResponse = await aiClient.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    systemInstruction: "Você é o Guardian, um bot de Discord útil e levemente sarcástico. Responda de forma concisa."
                }
            });
            await message.reply(chatResponse.text || "🤔 Fiquei sem palavras.");
        } catch (error) {
            console.error("Erro Chat IA:", error);
            message.reply("😵‍💫 Tive um erro interno.");
        }
    }
});

// 👋 EVENTO: ENTRADA (WELCOME)
client.on(Events.GuildMemberAdd, async member => {
    console.log(`👤 Entrou: ${member.user.tag}`);
    
    if (!CONFIG.ENTRY_CHANNEL) return console.log("⚠️ Canal de entrada não definido.");
    
    try {
        const channel = await member.guild.channels.fetch(CONFIG.ENTRY_CHANNEL).catch(() => null);
        if (!channel || !channel.isTextBased()) return console.error(`❌ Canal de entrada inválido ou inacessível (ID: ${CONFIG.ENTRY_CHANNEL})`);

        const diffDays = Math.floor((Date.now() - member.user.createdAt) / 86400000);
        const isSuspicious = diffDays < CONFIG.MIN_AGE_DAYS;
        const creationDate = member.user.createdAt.toLocaleDateString('pt-BR');

        const embed = new EmbedBuilder()
            .setColor(isSuspicious ? 0xED4245 : 0x57F287)
            .setAuthor({ name: 'Registro de Entrada', iconURL: member.guild.iconURL() })
            .setTitle(isSuspicious ? '🚨 ALERTA DE SEGURANÇA' : '✅ Novo Membro')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setDescription(isSuspicious 
                ? `**ATENÇÃO:** A conta ${member} foi criada há apenas ${diffDays} dias.` 
                : `Bem-vindo(a) ${member} ao servidor!`)
            .addFields(
                { name: '🆔 ID', value: ```${member.id}```, inline: true },
                { name: '📅 Criado em', value: `${creationDate}`, inline: true }
            )
            .setFooter({ text: `Membro #${member.guild.memberCount}` })
            .setTimestamp();

        // Botões de ação rápida para contas suspeitas
        const rows = [];
        if (isSuspicious) {
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`kick_${member.id}`).setLabel('Expulsar').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`ban_${member.id}`).setLabel('Banir').setStyle(ButtonStyle.Danger)
            ));
        }

        await channel.send({ 
            content: isSuspicious ? '||@here|| ⚠️ **Conta Recente Detectada**' : null, 
            embeds: [embed], 
            components: rows 
        }).catch(err => console.error("Erro ao enviar Welcome:", err));

    } catch (e) { console.error("Erro geral no Welcome:", e); }
});

// 📤 EVENTO: SAÍDA (LEAVE)
client.on(Events.GuildMemberRemove, async member => {
    console.log(`👋 Saiu: ${member.user.tag}`);

    if (!CONFIG.EXIT_CHANNEL) return;

    try {
        const channel = await member.guild.channels.fetch(CONFIG.EXIT_CHANNEL).catch(() => null);
        if (!channel || !channel.isTextBased()) return console.error(`❌ Canal de saída inválido (ID: ${CONFIG.EXIT_CHANNEL})`);

        // Tenta descobrir se foi Kick/Ban consultando Audit Logs
        // Requer permissão "View Audit Log"
        let reason = 'Saiu voluntariamente';
        let color = 0xFEE75C; // Amarelo
        let title = 'Saída de Membro';
        let executor = null;

        try {
            const logs = await member.guild.fetchAuditLogs({ limit: 1, type: null });
            const log = logs.entries.first();
            
            // Verifica se o log é recente (últimos 10 seg) e se o alvo é o membro que saiu
            if (log && log.target && log.target.id === member.id && (Date.now() - log.createdTimestamp) < 10000) {
                if (log.action === AuditLogEvent.MemberKick) {
                    reason = 'Expulso pelo Admin';
                    title = '👢 Expulsão';
                    color = 0xE67E22; // Laranja
                    executor = log.executor;
                } else if (log.action === AuditLogEvent.MemberBanAdd) {
                    reason = 'Banido do Servidor';
                    title = '🚫 Banimento';
                    color = 0xED4245; // Vermelho
                    executor = log.executor;
                }
            }
        } catch (e) {
            console.log("⚠️ Não foi possível ler Audit Logs (Sem permissão?)");
        }

        const embed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({ name: 'Log de Saída', iconURL: member.guild.iconURL() })
            .setTitle(`${title}`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setDescription(`**Usuário:** ${member.user.tag}\n**Motivo:** ${reason}`)
            .setFooter({ text: `ID: ${member.id}` })
            .setTimestamp();

        if (executor) {
            embed.addFields({ name: '👮 Executor', value: `${executor.tag}`, inline: false });
        }

        await channel.send({ embeds: [embed] }).catch(err => console.error("Erro ao enviar Leave:", err));

    } catch (e) { console.error("Erro geral no Leave:", e); }
});

// 🔘 INTERAÇÕES DE BOTÕES
client.on(Events.InteractionCreate, async i => {
    if (!i.isButton()) return;
    
    // Verifica permissão de quem clicou
    if (!i.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return i.reply({ content: '❌ Você não tem permissão para usar isso.', ephemeral: true });
    }

    const [action, targetId] = i.customId.split('_');
    
    try {
        if (action === 'kick') {
            await i.guild.members.kick(targetId, 'Ação via Guardian Bot');
            await i.reply({ content: '✅ Membro expulso com sucesso.', ephemeral: true });
        } else if (action === 'ban') {
            await i.guild.members.ban(targetId, { reason: 'Ação via Guardian Bot' });
            await i.reply({ content: '✅ Membro banido com sucesso.', ephemeral: true });
        }
    } catch (error) {
        i.reply({ content: `❌ Erro ao executar ação: ${error.message}`, ephemeral: true });
    }
});

client.login(CONFIG.TOKEN);
