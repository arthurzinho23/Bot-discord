const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');
const startWaker = require('./waker');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot 911 Online 🚨"));
app.listen(PORT, () => {
    console.log("🌐 Server running on port " + PORT);
    const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
    startWaker(APP_URL);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const EXTERNAL_API_URL = 'https://fvmp-tau.vercel.app/';

// --- AUTO-DETECT CLIENT ID ---
function getClientId(token) {
    try {
        return Buffer.from(token.split('.')[0], 'base64').toString('utf-8');
    } catch (e) {
        return null;
    }
}

const TOKEN = process.env.DISCORD_TOKEN?.replace(/^"|"$/g, '').trim();
const CLIENT_ID = process.env.CLIENT_ID || getClientId(TOKEN);

// --- DEFINIÇÃO DOS COMANDOS (SLASH) ---
const commands = [
    new SlashCommandBuilder()
        .setName('ponto')
        .setDescription('🛂 Abre o painel de controle de ponto'),
    new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('🏆 Exibe o ranking de horas')
        .addStringOption(option =>
            option.setName('periodo')
                .setDescription('Período do ranking')
                .setRequired(false)
                .addChoices(
                    { name: 'Total', value: 'total' },
                    { name: 'Semanal', value: 'semanal' },
                    { name: 'Mensal', value: 'mensal' }
                )),
    new SlashCommandBuilder()
        .setName('anular')
        .setDescription('⚠️ Anula o ponto de um usuário (Admin)')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('Usuário alvo')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('ℹ️ Mostra os comandos disponíveis'),
];

// --- FUNÇÃO DE REGISTRO ---
async function refreshCommands() {
    if (!TOKEN || !CLIENT_ID) {
        console.error("❌ Token ou Client ID faltando. Verifique as variáveis de ambiente.");
        return false;
    }
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('🔄 [AUTO-UPDATE] Iniciando atualização de comandos (/) no Discord API...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ [AUTO-UPDATE] Comandos (/) sincronizados com sucesso!');
        return true;
    } catch (error) {
        console.error('❌ [ERRO] Falha ao atualizar comandos:', error);
        return false;
    }
}

client.once("ready", async () => {
    console.log(`✅ Logado como ${client.user.tag}`);
    
    // 1. Atualização Automática de Comandos
    const success = await refreshCommands();

    // 2. Notificação de Inicialização
    const targetId = '1467148882772234301';
    try {
        // Tenta buscar como canal primeiro
        const channel = await client.channels.fetch(targetId).catch(() => null);
        
        const statusMsg = success 
            ? "✅ **Bot Atualizado e Online!** Comandos sincronizados com sucesso. 🚀" 
            : "⚠️ **Bot Online**, mas houve erro na sincronização de comandos.";

        if (channel && channel.isTextBased()) {
            await channel.send(statusMsg);
            console.log(`[NOTIFICAÇÃO] Mensagem enviada para o canal ${channel.name}`);
        } else {
            // Se não for canal, tenta como usuário (DM)
            const user = await client.users.fetch(targetId).catch(() => null);
            if (user) {
                await user.send(statusMsg);
                console.log(`[NOTIFICAÇÃO] DM enviada para ${user.tag}`);
            } else {
                console.warn(`[AVISO] ID ${targetId} não encontrado (não é canal nem usuário acessível).`);
            }
        }
    } catch (error) {
        console.error(`[ERRO] Falha ao enviar notificação de start: ${error.message}`);
    }
});

// --- COMANDO !DEBUG (PREFIXO) ---
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    
    if (message.content === "!debug") {
        const success = await refreshCommands();
        
        const embed = new EmbedBuilder()
            .setColor(success ? 0x00FF00 : 0xFF0000)
            .setTitle('🛠️ Status do Sistema & Debug')
            .addFields(
                { name: '🤖 Bot Status', value: 'Online e Operacional', inline: true },
                { name: '🏓 Ping', value: `${client.ws.ping}ms`, inline: true },
                { name: '🔄 Comandos Slash', value: success ? 'Atualizados Agora' : 'Falha na Atualização', inline: false },
                { name: '🆔 Client ID', value: CLIENT_ID || 'Não detectado', inline: true },
                { name: '🔗 API Externa', value: EXTERNAL_API_URL, inline: true }
            )
            .setFooter({ text: `Solicitado por ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }
});

// --- INTERAÇÕES (SLASH E BOTÕES) ---
client.on('interactionCreate', async interaction => {
    // --- SLASH COMMANDS ---
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'ponto') {
            const embed = new EmbedBuilder()
                .setColor(0x2F3136)
                .setTitle('🛂 Central de Ponto 911')
                .setDescription('**Gerencie seu turno de serviço.**\n\nUtilize os botões abaixo para registrar suas atividades. Todos os registros são auditados.')
                .addFields(
                    { name: '📋 Instruções', value: '1. Clique em **Iniciar** ao começar.\n2. Use **Pausar** para intervalos.\n3. **Finalizar** encerra o turno.' }
                )
                .setThumbnail(client.user.displayAvatarURL())
                .setFooter({ text: 'Sistema de Ponto 911', iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId(`iniciar_${interaction.user.id}`).setLabel('Iniciar Turno').setStyle(ButtonStyle.Success).setEmoji('🟢'),
                    new ButtonBuilder().setCustomId(`pausar_${interaction.user.id}`).setLabel('Pausar').setStyle(ButtonStyle.Secondary).setEmoji('⏸️'),
                    new ButtonBuilder().setCustomId(`finalizar_${interaction.user.id}`).setLabel('Finalizar').setStyle(ButtonStyle.Danger).setEmoji('🔴')
                );

            await interaction.reply({ embeds: [embed], components: [row] });
        }

        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('ℹ️ Central de Ajuda')
                .setDescription('Lista de comandos disponíveis no sistema.')
                .addFields(
                    { name: '`/ponto`', value: 'Abre o painel de registro de ponto.', inline: true },
                    { name: '`/ranking`', value: 'Visualiza o ranking de horas.', inline: true },
                    { name: '`/anular`', value: 'Anula um registro (Apenas Admin).', inline: true },
                    { name: '`!debug`', value: 'Ferramenta técnica e atualização de comandos.', inline: true }
                )
                .setThumbnail(client.user.displayAvatarURL());
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'ranking') {
            const periodo = interaction.options.getString('periodo') || 'total';
            // Mock data - conectar com API real depois
            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle(`🏆 Ranking de Oficiais (${periodo.toUpperCase()})`)
                .setDescription('Top 3 oficiais com mais horas registradas.')
                .addFields(
                    { name: '🥇 1º Lugar', value: '**Oficial Silva**\n42h 30m', inline: false },
                    { name: '🥈 2º Lugar', value: '**Tenente Souza**\n38h 15m', inline: false },
                    { name: '🥉 3º Lugar', value: '**Cadete Oliveira**\n12h 00m', inline: false }
                )
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'anular') {
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({ content: '⛔ **Acesso Negado:** Apenas administradores podem usar este comando.', ephemeral: true });
            }
            const target = interaction.options.getUser('usuario');
            await interaction.reply({ content: `⚠️ **Atenção:** O último registro de ponto de ${target} foi anulado com sucesso.`, ephemeral: true });
        }
    }

    // --- BUTTONS ---
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('iniciar_') || interaction.customId.startsWith('pausar_') || interaction.customId.startsWith('finalizar_')) {
            const [action, userId] = interaction.customId.split('_');
            
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '🔒 Este painel não é seu. Use `/ponto` para abrir o seu.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            // Lógica de envio para API aqui
            // await axios.post(...)

            const actionMap = {
                'iniciar': { text: 'iniciado', emoji: '🟢' },
                'pausar': { text: 'pausado', emoji: '⏸️' },
                'finalizar': { text: 'finalizado', emoji: '🔴' }
            };

            const config = actionMap[action];
            
            const embed = new EmbedBuilder()
                .setColor(action === 'iniciar' ? 0x00FF00 : action === 'finalizar' ? 0xFF0000 : 0xFFA500)
                .setTitle(`${config.emoji} Ponto ${config.text.toUpperCase()}`)
                .setDescription(`Seu registro foi salvo com sucesso.\n\n**Horário:** ${new Date().toLocaleTimeString('pt-BR')}`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }
});

client.login(TOKEN);
