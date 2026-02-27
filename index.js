const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');
const startWaker = require('./waker');
require('dotenv').config();

console.log('[BOOT] Iniciando sistema...');

// --- TRATAMENTO DE ERROS GLOBAIS ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [ERRO NÃO TRATADO] Rejeição:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('❌ [ERRO CRÍTICO] Exceção:', error);
});

// --- WEB SERVER ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot 911 Online 🚨"));
app.get("/status", (req, res) => res.json({ status: "online", uptime: process.uptime() }));

app.listen(PORT, () => {
    console.log("🌐 Server running on port " + PORT);
    const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
    startWaker(APP_URL);
});

// --- DISCORD CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // IMPORTANTE: Precisa estar ativado no Dev Portal
    ]
});

const EXTERNAL_API_URL = 'https://fvmp-tau.vercel.app/';

// --- CONFIGURAÇÃO ---
function getClientId(token) {
    try {
        return Buffer.from(token.split('.')[0], 'base64').toString('utf-8');
    } catch (e) { return null; }
}

const TOKEN = process.env.DISCORD_TOKEN?.replace(/^"|"$/g, '').trim();
const CLIENT_ID = process.env.CLIENT_ID || (TOKEN ? getClientId(TOKEN) : null);
const GUILD_ID = process.env.GUILD_ID; // Opcional: Para registro instantâneo

if (!TOKEN) console.error("❌ [ERRO FATAL] DISCORD_TOKEN faltando!");

// --- COMANDOS ---
const commands = [
    new SlashCommandBuilder().setName('ponto').setDescription('🛂 Abre o painel de ponto'),
    new SlashCommandBuilder().setName('ranking').setDescription('🏆 Exibe o ranking')
        .addStringOption(o => o.setName('periodo').setDescription('Período').addChoices({ name: 'Total', value: 'total' }, { name: 'Semanal', value: 'semanal' }, { name: 'Mensal', value: 'mensal' })),
    new SlashCommandBuilder().setName('anular').setDescription('⚠️ Anula ponto (Admin)').addUserOption(o => o.setName('usuario').setDescription('Alvo').setRequired(true)),
    new SlashCommandBuilder().setName('help').setDescription('ℹ️ Ajuda'),
];

// --- REGISTRO DE COMANDOS ---
async function refreshCommands() {
    if (!TOKEN || !CLIENT_ID) return false;
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('🔄 [UPDATE] Atualizando comandos...');
        
        // Se tiver GUILD_ID, registra lá (instantâneo). Se não, registra Global (pode demorar 1h)
        if (GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
            console.log(`✅ [UPDATE] Comandos registrados na GUILD ${GUILD_ID} (Instantâneo)`);
        } else {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
            console.log('✅ [UPDATE] Comandos registrados GLOBALMENTE (Pode demorar até 1h para aparecer)');
        }
        return true;
    } catch (error) {
        console.error('❌ [ERRO UPDATE]', error);
        return false;
    }
}

client.once("ready", async () => {
    console.log(`✅ Logado como ${client.user.tag}`);
    await refreshCommands();
});

// --- DIAGNÓSTICO DE MENSAGENS (DEBUG) ---
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // Log para verificar se o bot está "vendo" mensagens (Testa o Intent MessageContent)
    console.log(`[MSG] Recebida de ${message.author.tag}: ${message.content}`);

    if (message.content === "!debug") {
        const success = await refreshCommands();
        const embed = new EmbedBuilder()
            .setColor(success ? 0x00FF00 : 0xFF0000)
            .setTitle('🛠️ Debug Tool')
            .setDescription(success ? '✅ Comandos Atualizados!' : '❌ Falha na atualização')
            .addFields(
                { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
                { name: 'Guild ID', value: GUILD_ID || 'Não definido (Modo Global)', inline: true },
                { name: 'Intents', value: 'Verifique se Message Content está ativo no Portal', inline: false }
            );
        message.reply({ embeds: [embed] });
    }
});

// --- INTERAÇÕES ---
client.on('interactionCreate', async interaction => {
    console.log(`[INTERAÇÃO] Recebida: ${interaction.type} | Command: ${interaction.commandName || interaction.customId}`);

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'ponto') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`iniciar_${interaction.user.id}`).setLabel('Iniciar').setStyle(ButtonStyle.Success).setEmoji('🟢'),
                new ButtonBuilder().setCustomId(`pausar_${interaction.user.id}`).setLabel('Pausar').setStyle(ButtonStyle.Secondary).setEmoji('⏸️'),
                new ButtonBuilder().setCustomId(`finalizar_${interaction.user.id}`).setLabel('Finalizar').setStyle(ButtonStyle.Danger).setEmoji('🔴')
            );
            await interaction.reply({ 
                embeds: [new EmbedBuilder().setTitle('🛂 Ponto 911').setDescription('Gerencie seu turno abaixo.').setColor(0x2F3136)], 
                components: [row] 
            });
        }

        if (commandName === 'help') {
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle('ℹ️ Ajuda').setDescription('Comandos: /ponto, /ranking, /anular, !debug').setColor(0x5865F2)], ephemeral: true });
        }

        if (commandName === 'ranking') {
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Ranking').setDescription('Funcionalidade em desenvolvimento.').setColor(0xFFD700)] });
        }
        
        if (commandName === 'anular') {
             if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '⛔ Sem permissão.', ephemeral: true });
             await interaction.reply({ content: `⚠️ Ponto de ${interaction.options.getUser('usuario')} anulado.`, ephemeral: true });
        }
    }

    if (interaction.isButton()) {
        const [action, userId] = interaction.customId.split('_');
        if (interaction.user.id !== userId) return interaction.reply({ content: '🔒 Apenas quem abriu o painel pode usar.', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });
        
        // Aqui você faria o axios.post para sua API
        
        const msgs = { 'iniciar': '🟢 Iniciado', 'pausar': '⏸️ Pausado', 'finalizar': '🔴 Finalizado' };
        await interaction.editReply({ content: `✅ Ponto **${msgs[action]}** com sucesso!` });
    }
});

client.login(TOKEN);
