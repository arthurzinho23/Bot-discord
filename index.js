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
// ⚙️ CONFIGURAÇÃO DE IDS (Edite aqui se não usar .env)
// =========================================================
const CONFIG = {
    // Tokens
    TOKEN: process.env.DISCORD_TOKEN,
    GEMINI_KEY: process.env.GEMINI_API_KEY, 
    
    // 🆔 CANAIS (Use o comando !debug no Discord para descobrir os IDs corretos)
    // Se o ID estiver errado, o bot NÃO vai mandar mensagem.
    ENTRY_CHANNEL: process.env.ENTRY_CHANNEL_ID || 'SUBSTITUA_PELO_ID_CANAL_ENTRADA',
    EXIT_CHANNEL: process.env.EXIT_CHANNEL_ID || 'SUBSTITUA_PELO_ID_CANAL_SAIDA',
    COTACAO_CHANNEL: process.env.COTACAO_CHANNEL_ID || 'SUBSTITUA_PELO_ID_CANAL_COTACAO', 
    
    // 🛡️ Cargos
    BOOSTER_ROLE_ID: 'SUBSTITUA_PELO_ID_CARGO_BOOSTER', 
    
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
// 🌐 SERVIDOR WEB (Para manter online)
// =========================================================
const app = express();
app.get('/', (req, res) => res.send({ status: 'Online', config_check: { 
    discord: !!CONFIG.TOKEN, 
    ai: !!CONFIG.GEMINI_KEY,
    entry_channel: CONFIG.ENTRY_CHANNEL !== 'SUBSTITUA_PELO_ID_CANAL_ENTRADA'
}}));
app.listen(CONFIG.PORT, () => console.log(`🌐 Web Server rodando na porta ${CONFIG.PORT}`));

// =========================================================
// 🧠 IA CLIENT
// =========================================================
let aiClient;
if (CONFIG.GEMINI_KEY) {
    aiClient = new GoogleGenAI({ apiKey: CONFIG.GEMINI_KEY });
}

// =========================================================
// 🤖 DISCORD CLIENT
// =========================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // OBRIGATÓRIO PARA WELCOME
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // OBRIGATÓRIO PARA LER PREÇO
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.GuildMember, Partials.User, Partials.Channel, Partials.Message]
});

// ✅ INICIALIZAÇÃO E TESTE DE CANAIS
client.once(Events.ClientReady, async (c) => {
    console.log(`✅ Bot logado como: ${c.user.tag}`);
    console.log('------------------------------------------------');
    console.log('🔍 TESTE DE CANAIS (Verifique o Console):');

    const testChannel = async (name, id) => {
        if (!id || id.includes('SUBSTITUA')) {
            console.log(`❌ ${name}: ID não configurado.`);
            return;
        }
        try {
            const ch = await client.channels.fetch(id);
            console.log(`✅ ${name}: OK (${ch.name}) [ID: ${id}]`);
        } catch (e) {
            console.log(`❌ ${name}: NÃO ENCONTRADO. O ID ${id} está errado ou o bot não tem permissão.`);
        }
    };

    await testChannel('Canal Entrada', CONFIG.ENTRY_CHANNEL);
    await testChannel('Canal Saída', CONFIG.EXIT_CHANNEL);
    await testChannel('Canal Cotação', CONFIG.COTACAO_CHANNEL);
    console.log('------------------------------------------------');
});

// 📨 EVENTO DE MENSAGEM (COTAÇÃO & CHAT)
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // 🔧 COMANDO DE DEBUG (Use isso para pegar os IDs certos!)
    if (message.content === '!debug') {
        const isForum = message.channel.type === ChannelType.GuildForum;
        const isThread = message.channel.isThread();
        
        const debugInfo = `
🔍 **DIAGNÓSTICO DO CANAL**
--------------------------------
**Nome:** `${message.channel.name}`
**ID Deste Canal:** ``${message.channel.id}``
**ID do Pai (Categoria/Fórum):** ``${message.channel.parentId || 'Nenhum'}``
**É Tópico?** ${isThread ? 'Sim' : 'Não'}
**Tipo:** ${message.channel.type}
--------------------------------
**Configurado no Código:**
Cotação ID: ``${CONFIG.COTACAO_CHANNEL}``
Entrada ID: ``${CONFIG.ENTRY_CHANNEL}``
`;
        return message.reply(debugInfo);
    }

    // LÓGICA DE COTAÇÃO
    // Funciona se a mensagem for no canal configurado OU em um tópico filho do canal configurado
    const isCotacaoChannel = message.channel.id === CONFIG.COTACAO_CHANNEL;
    const isThreadInCotacao = message.channel.parentId === CONFIG.COTACAO_CHANNEL;

    if (isCotacaoChannel || isThreadInCotacao) {
        // Tenta extrair um número básico antes de gastar recursos
        const temNumero = /d/.test(message.content);
        if (!temNumero && !message.content.toLowerCase().includes('k')) return; 

        console.log(`📝 Analisando possível cotação de: ${message.author.tag}`);
        
        try {
            await message.channel.sendTyping();

            let valorVeiculo = 0;
            let textToAnalyze = message.content;
            
            // Se for tópico, inclui o nome do tópico na análise
            if (message.channel.isThread()) textToAnalyze += " " + message.channel.name;

            // 1. TENTATIVA COM IA
            if (aiClient) {
                try {
                    const result = await aiClient.models.generateContent({ 
                        model: 'gemini-2.5-flash', 
                        contents: `Apenas extraia o valor numérico total de venda deste texto. Se for '50k' retorne 50000. Retorne APENAS números, sem texto. Texto: "${textToAnalyze}"`
                    });
                    const numbers = result.text?.replace(/[^0-9]/g, '');
                    if (numbers) valorVeiculo = parseInt(numbers);
                } catch (e) { console.error("Falha IA (ignorada):", e.message); }
            }

            // 2. FALLBACK MANUAL (Se IA falhar ou retornar 0)
            if (!valorVeiculo || valorVeiculo === 0) {
                valorVeiculo = extrairValorManual(textToAnalyze) || 0;
            }

            // Se ainda assim for 0 ou muito baixo, ignora (evita spam em conversa normal)
            if (valorVeiculo < 100) return;

            // CÁLCULO
            const isBooster = message.member?.roles.cache.has(CONFIG.BOOSTER_ROLE_ID);
            const taxaPercent = isBooster ? 0.10 : 0.15; // 10% ou 15%
            const valorTaxa = valorVeiculo * taxaPercent;
            const valorFinal = valorVeiculo + valorTaxa;

            // FORMATAÇÃO
            const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            const embed = new EmbedBuilder()
                .setColor(isBooster ? 0xFF73FA : 0x2B2D31)
                .setTitle(isBooster ? '💎 Cotação Especial (Booster)' : '📋 Cotação Automática')
                .setDescription(`Cálculo para **${message.author}**`)
                .addFields({
                    name: 'Valores Calculados',
                    value: ```yaml
Veículo:   ${fmt(valorVeiculo)}
Taxa (${isBooster ? '10%' : '15%'}):   + ${fmt(valorTaxa)}
TOTAL:     ${fmt(valorFinal)}
```,
                    inline: false
                })
                .setFooter({ text: 'Sistema Automático • Guardian' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            console.log("✅ Cotação enviada com sucesso.");

        } catch (error) {
            console.error("❌ ERRO FATAL AO ENVIAR COTAÇÃO:", error);
            // Não enviamos mensagem de erro no chat para não poluir, mas logamos no console
        }
    }

    // CHATBOT COM IA (Mencionar o bot)
    if (message.mentions.has(client.user)) {
        await message.channel.sendTyping();
        try {
            const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim();
            if (!aiClient) return message.reply("Minha IA está desligada (Sem API Key).");
            
            const response = await aiClient.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { systemInstruction: "Você é um assistente útil do servidor." }
            });
            await message.reply(response.text.slice(0, 1999));
        } catch (err) {
            console.error(err);
            message.reply("Tive um problema para pensar na resposta.");
        }
    }
});

// 👋 EVENTO DE ENTRADA (WELCOME)
client.on(Events.GuildMemberAdd, async (member) => {
    console.log(`👤 NOVO MEMBRO DETECTADO: ${member.user.tag}`);

    if (!CONFIG.ENTRY_CHANNEL || CONFIG.ENTRY_CHANNEL.includes('SUBSTITUA')) {
        return console.log("⚠️ Canal de Entrada não configurado no código.");
    }

    try {
        const channel = await member.guild.channels.fetch(CONFIG.ENTRY_CHANNEL).catch(e => null);
        
        if (!channel) {
            console.error(`❌ ERRO: Não consegui achar o canal de entrada ID ${CONFIG.ENTRY_CHANNEL}. Verifique se o ID está certo e se o bot tem permissão de ver o canal.`);
            return;
        }

        const contaRecente = (Date.now() - member.user.createdTimestamp) < (CONFIG.MIN_AGE_DAYS * 86400000);
        
        const embed = new EmbedBuilder()
            .setColor(contaRecente ? 0xED4245 : 0x57F287)
            .setTitle(contaRecente ? '⚠️ Conta Nova' : '👋 Bem-vindo(a)!')
            .setDescription(`Olá ${member}! Bem-vindo ao servidor.`)
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
                { name: 'Conta Criada', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'ID', value: member.id, inline: true }
            );

        await channel.send({ 
            content: contaRecente ? '||@here|| 🚨 **Alerta de Segurança**' : `${member}`,
            embeds: [embed] 
        });
        console.log("✅ Mensagem de boas-vindas enviada.");

    } catch (error) {
        console.error("❌ ERRO NO WELCOME:", error);
    }
});

// 📤 EVENTO DE SAÍDA
client.on(Events.GuildMemberRemove, async (member) => {
    console.log(`👋 MEMBRO SAIU: ${member.user.tag}`);
    
    if (!CONFIG.EXIT_CHANNEL || CONFIG.EXIT_CHANNEL.includes('SUBSTITUA')) return;

    try {
        const channel = await member.guild.channels.fetch(CONFIG.EXIT_CHANNEL).catch(() => null);
        if (channel) {
            await channel.send({
                embeds: [new EmbedBuilder()
                    .setColor(0xFEE75C)
                    .setTitle('Saída')
                    .setDescription(`**${member.user.tag}** deixou o servidor.`)
                    .setFooter({ text: `ID: ${member.id}` })
                    .setTimestamp()
                ]
            });
        }
    } catch (e) { console.error("Erro no Leave:", e); }
});

client.login(CONFIG.TOKEN);
