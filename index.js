const { Client, GatewayIntentBits, Events, EmbedBuilder, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const http = require('http');
const express = require('express');

// --- 🛡️ SISTEMA "MANTER VIVO" (ANTI-SLEEP) ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send({ status: '🛡️ Guardian Online', uptime: process.uptime() }));

app.listen(port, () => {
    console.log(`🌐 Web Server rodando na porta ${port}`);
    setInterval(() => {
        const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
        http.get(url).on('error', (err) => console.log('Ping erro (normal na inicialização)'));
    }, 10 * 60 * 1000);
});
// -----------------------------------------------------------

console.log('🔄 INICIANDO SISTEMA...');

// ⚙️ CONFIGURAÇÃO
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN, 
    LOG_CHANNEL: '1445105144869032129', 
    COTACAO_CHANNEL: '1446631169054740602', // ID do Fórum/Tópicos
    VIP_ROLE_ID: '1441086318229848185',    // ID do Cargo que paga menos taxa
    MIN_AGE_DAYS: 7
};

// --- PREVENÇÃO DE ERROS ---
process.on('uncaughtException', (error) => {
    console.error('❌ ERRO:', error);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // OBRIGATÓRIO
    ],
    partials: [Partials.GuildMember, Partials.User, Partials.Channel]
});

client.once(Events.ClientReady, c => {
    console.log(`✅ BOT ONLINE: ${c.user.tag}`);
    client.user.setActivity('💸 Calculando Cotações');
});

// --- FUNÇÃO PARA LIMPAR E ENTENDER VALORES (100k, 1m, 100.000) ---
function parseValor(str) {
    // Remove R$, espaços e converte para minúsculo
    let cleanStr = str.toLowerCase().replace(/r\$|\s/g, '');
    
    // Multiplicadores (k = mil, m = milhão)
    let multiplier = 1;
    if (cleanStr.includes('k')) { multiplier = 1000; cleanStr = cleanStr.replace('k', ''); }
    else if (cleanStr.includes('m')) { multiplier = 1000000; cleanStr = cleanStr.replace('m', ''); }
    
    // Remove pontos de milhar (ex: 100.000 -> 100000) e troca vírgula decimal por ponto
    cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
    
    const valor = parseFloat(cleanStr);
    return isNaN(valor) ? 0 : valor * multiplier;
}

// ---------------------------------------------------------
// 💰 SISTEMA DE COTAÇÃO INTELIGENTE
// ---------------------------------------------------------
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // Verifica se está no canal de cotação (ou tópicos dele)
    const isCotacaoChannel = 
        message.channel.id === CONFIG.COTACAO_CHANNEL || 
        message.channel.parentId === CONFIG.COTACAO_CHANNEL;

    if (isCotacaoChannel) {
        // Tenta extrair um valor numérico da mensagem
        const valorVeiculo = parseValor(message.content);

        // Se não conseguiu identificar um valor (ex: o cara só disse "Oi"), ignora ou responde diferente
        if (valorVeiculo <= 0) return;

        await message.channel.sendTyping();

        // --- LÓGICA DO CÁLCULO VIP ---
        const temCargoVip = message.member.roles.cache.has(CONFIG.VIP_ROLE_ID);
        
        // Se VIP: 10% | Se Normal: 15%
        const porcentagem = temCargoVip ? 10 : 15;
        const taxa = valorVeiculo * (porcentagem / 100);
        const valorFinal = valorVeiculo + taxa;

        // Formatação de dinheiro (R$)
        const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

        // Cores e Títulos diferentes para VIPs
        const embedColor = temCargoVip ? 0xF1C40F : 0x0099FF; // Dourado (VIP) ou Azul (Normal)
        const tituloEmbed = temCargoVip ? '💎 Cotação Especial (VIP)' : '🚙 Cotação de Veículo';

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(tituloEmbed)
            .setDescription(`Olá **${message.author.username}**, aqui está o cálculo para o valor informado.`)
            .addFields(
                { 
                    name: '💵 Valor do Veículo', 
                    value: `\`${fmt.format(valorVeiculo)}\``, 
                    inline: true 
                },
                { 
                    name: `📈 Taxa Aplicada (${porcentagem}%)`, 
                    value: `\`+ ${fmt.format(taxa)}\``, 
                    inline: true 
                },
                { 
                    name: '✅ VALOR FINAL', 
                    value: `### ${fmt.format(valorFinal)}`, 
                    inline: false 
                }
            )
            .setFooter({ 
                text: temCargoVip ? 'Benefício VIP aplicado (Taxa Reduzida)' : 'Adquira o cargo VIP para reduzir a taxa para 10%', 
                iconURL: message.guild.iconURL() 
            })
            .setTimestamp();

        try {
            await message.reply({ embeds: [embed] });
        } catch (err) {
            console.error('Erro ao responder:', err);
        }
    }
});

// ---------------------------------------------------------
// 🛡️ SISTEMA DE SEGURANÇA (Mantido)
// ---------------------------------------------------------
const createProgressBar = (days, minDays) => {
    const percentage = Math.min(days / minDays, 1);
    return '█'.repeat(Math.floor(percentage * 10)) + '░'.repeat(10 - Math.floor(percentage * 10));
};

client.on(Events.GuildMemberAdd, async member => {
    try {
        const diffDays = Math.floor((new Date() - member.user.createdAt) / (1000 * 60 * 60 * 24));
        const channel = member.guild.channels.cache.get(CONFIG.LOG_CHANNEL);
        
        if (channel) {
            const embed = new EmbedBuilder()
                .setColor(diffDays < CONFIG.MIN_AGE_DAYS ? 0xED4245 : 0x57F287)
                .setTitle('🛡️ Monitoramento de Entrada')
                .setDescription(`Membro: ${member.user}\nIdade da Conta: **${diffDays} dias**`)
                .setFooter({ text: 'Sistema de Segurança' });
            channel.send({ embeds: [embed] });
        }
    } catch (e) { console.error(e); }
});

client.login(CONFIG.TOKEN);