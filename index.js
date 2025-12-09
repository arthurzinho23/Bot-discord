import 'dotenv/config'; // Carrega o .env automaticamente
import { 
    Client, 
    GatewayIntentBits, 
    Events, 
    EmbedBuilder, 
    Partials, 
    ChannelType
} from 'discord.js';

import express from 'express';
import { GoogleGenAI } from "@google/genai";

// =========================================================
// 🚨 TRATAMENTO DE ERROS GLOBAL (Para o bot não desligar)
// =========================================================
process.on('unhandledRejection', (reason, p) => {
    console.log(' [Anti-Crash] Erro Rejeitado:', reason);
});
process.on('uncaughtException', (err, origin) => {
    console.log(' [Anti-Crash] Erro Crítico:', err);
});

// =========================================================
// ⚙️ CONFIGURAÇÃO
// =========================================================
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    
    // IDs dos Canais (Copie do Discord com botão direito -> Copiar ID)
    ENTRY_CHANNEL: process.env.ENTRY_CHANNEL_ID || '', 
    EXIT_CHANNEL: process.env.EXIT_CHANNEL_ID || '',
    COTACAO_CHANNEL: process.env.COTACAO_CHANNEL_ID || '',
    
    BOOSTER_ROLE_ID: process.env.BOOSTER_ROLE_ID || '', 
    PORT: process.env.PORT || 3000
};

// =========================================================
// 🧠 IA CLIENT (Google Gemini)
// =========================================================
let aiClient = null;
if (CONFIG.GEMINI_KEY) {
    try {
        aiClient = new GoogleGenAI({ apiKey: CONFIG.GEMINI_KEY });
        console.log("🧠 IA Gemini Configurada.");
    } catch (e) {
        console.error("❌ Erro ao configurar IA:", e.message);
    }
} else {
    console.log("⚠️ SEM CHAVE DA IA: O bot funcionará apenas com modo manual.");
}

// =========================================================
// 🤖 DISCORD CLIENT
// =========================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,      // Necessário para Boas-vindas
        GatewayIntentBits.GuildMessages,     // Necessário para Ler mensagens
        GatewayIntentBits.MessageContent,    // Necessário para Ler o TEXTO das mensagens
    ],
    partials: [Partials.GuildMember, Partials.User, Partials.Channel, Partials.Message]
});

// ✅ INICIALIZAÇÃO
client.once(Events.ClientReady, (c) => {
    console.log(`✅ ESTOU ONLINE! Logado como: ${c.user.tag}`);
    console.log(`📡 Monitorando canais...`);
    console.log(`   - Cotação: ${CONFIG.COTACAO_CHANNEL || 'Não configurado'}`);
    console.log(`   - Entrada: ${CONFIG.ENTRY_CHANNEL || 'Não configurado'}`);
    console.log(`   - Saída:   ${CONFIG.EXIT_CHANNEL || 'Não configurado'}`);
});

// 📨 EVENTO DE MENSAGENS
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // COMANDO DE TESTE SIMPLES
    if (message.content === '!ping') {
        return message.reply(`🏓 Pong! Estou vivo. ID deste canal: `${message.channel.id}``);
    }

    // COMANDO DE DEBUG (Ajuda a achar IDs)
    if (message.content === '!debug') {
        return message.reply({
            content: `📊 **DIAGNÓSTICO**
ID do Canal Atual: `${message.channel.id}`
Tipo: ${message.channel.type}
Permissão de Ver Membros: ${message.guild.members.me.permissions.has('ViewChannel') ? 'Sim' : 'Não'}`
        });
    }

    // LÓGICA DE COTAÇÃO
    // Verifica se está no canal certo (ou em tópicos desse canal)
    const isCotacao = message.channel.id === CONFIG.COTACAO_CHANNEL || message.channel.parentId === CONFIG.COTACAO_CHANNEL;

    if (isCotacao) {
        // Filtro básico para não responder "oi"
        const temNumero = /d/.test(message.content);
        const temK = message.content.toLowerCase().includes('k');
        if (!temNumero && !temK) return;

        console.log(`📝 Cotação solicitada por ${message.author.username}`);

        try {
            await message.channel.sendTyping();
            let valorEncontrado = 0;

            // 1. Tenta usar a IA se disponível
            if (aiClient) {
                try {
                    const model = aiClient.models;
                    const result = await model.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: `Extraia apenas o valor numérico de venda deste texto. Exemplo: "vendo carro por 50k" retorna 50000. Retorne APENAS O NÚMERO puro. Texto: "${message.content}"`
                    });
                    const text = result.text ? result.text.trim() : "";
                    const numbers = text.replace(/[^0-9]/g, '');
                    if (numbers) valorEncontrado = parseInt(numbers);
                } catch (err) {
                    console.error("Falha na IA (usando manual):", err.message);
                }
            }

            // 2. Fallback Manual (Se IA falhar ou não achar nada)
            if (!valorEncontrado) {
                const clean = message.content.toLowerCase().replace(/k/g, '000').replace(/[^0-9]/g, '');
                if (clean) valorEncontrado = parseInt(clean);
            }

            // Se ainda for 0, ignora
            if (!valorEncontrado || valorEncontrado < 100) return;

            // Cálculos
            const isBooster = message.member?.roles.cache.has(CONFIG.BOOSTER_ROLE_ID);
            const taxa = isBooster ? 0.10 : 0.15;
            const valorTaxa = valorEncontrado * taxa;
            const valorFinal = valorEncontrado + valorTaxa;

            // Formatação
            const BRL = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            const embed = new EmbedBuilder()
                .setColor(isBooster ? 0xFF73FA : 0x2B2D31)
                .setTitle('🚗 Cotação Automática')
                .addFields({
                    name: 'Detalhes da Venda',
                    value: ```yaml
Valor Veículo: ${BRL(valorEncontrado)}
Taxa (${taxa * 100}%):   + ${BRL(valorTaxa)}
TOTAL:         ${BRL(valorFinal)}
```,
                    inline: false
                })
                .setFooter({ text: isBooster ? 'Cliente VIP (Booster)' : 'Taxa Padrão (15%)' });

            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error("Erro ao enviar cotação:", error);
            // Tenta enviar mensagem de erro simples
            message.reply("❌ Ocorreu um erro ao calcular.").catch(() => {});
        }
    }
});

// 👋 EVENTO DE ENTRADA (WELCOME)
client.on(Events.GuildMemberAdd, async (member) => {
    console.log(`👤 ENTROU: ${member.user.tag}`);
    if (!CONFIG.ENTRY_CHANNEL) return;

    try {
        const channel = await member.guild.channels.fetch(CONFIG.ENTRY_CHANNEL);
        if (!channel) return console.log("❌ Canal de Entrada não encontrado.");

        const diasCriacao = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
        const isNew = diasCriacao < 7;

        const embed = new EmbedBuilder()
            .setColor(isNew ? 0xED4245 : 0x57F287)
            .setTitle(isNew ? '🚨 Conta Recente' : '👋 Bem-vindo(a)!')
            .setDescription(`${member} entrou no servidor.`)
            .addFields(
                { name: 'Idade da Conta', value: `${diasCriacao} dias`, inline: true },
                { name: 'ID', value: member.id, inline: true }
            )
            .setThumbnail(member.user.displayAvatarURL());

        await channel.send({ content: `${member}`, embeds: [embed] });
    } catch (e) {
        console.error("Erro no Welcome:", e);
    }
});

// 📤 EVENTO DE SAÍDA
client.on(Events.GuildMemberRemove, async (member) => {
    console.log(`📤 SAIU: ${member.user.tag}`);
    if (!CONFIG.EXIT_CHANNEL) return;

    try {
        const channel = await member.guild.channels.fetch(CONFIG.EXIT_CHANNEL);
        if (channel) {
            const embed = new EmbedBuilder()
                .setColor(0xFEE75C)
                .setTitle('👋 Saída')
                .setDescription(`**${member.user.tag}** deixou o servidor.`)
                .setFooter({ text: `ID: ${member.id}` })
                .setTimestamp();
            await channel.send({ embeds: [embed] });
        }
    } catch (e) {
        console.error("Erro no Leave:", e);
    }
});

// SERVIDOR WEB PARA MANTER ONLINE
const app = express();
app.get('/', (req, res) => res.send('Bot is Running'));
app.listen(CONFIG.PORT, () => console.log('🌐 Webserver OK'));

// LOGIN COM TRATAMENTO DE ERRO DE INTENTS
client.login(CONFIG.TOKEN).catch(error => {
    if (error.code === 'DisallowedIntents') {
        console.error("\n\n🔴 ERRO CRÍTICO: INTENTS DESATIVADOS! 🔴");
        console.error("Você precisa ir no Discord Developer Portal -> Bot -> Privileged Gateway Intents");
        console.error("E ATIVAR AS 3 OPÇÕES: Presence Intent, Server Members Intent, Message Content Intent.\n\n");
    } else if (error.code === 'TokenInvalid') {
        console.error("\n\n🔴 ERRO: TOKEN INVÁLIDO. Verifique seu arquivo .env\n\n");
    } else {
        console.error("Erro ao logar:", error);
    }
});
