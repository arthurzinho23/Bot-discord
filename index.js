const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    REST, 
    Routes 
} = require('discord.js');
const http = require('http');
require('dotenv').config();

// --- 1. SERVIDOR DE MONITORAMENTO (ESTABILIDADE RENDER) ---
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bot de Ponto Nickyville: Online 🚒');
});
server.listen(PORT, '0.0.0.0', () => console.log('✅ Servidor HTTP na porta ' + PORT));

// --- 2. CONFIGURAÇÕES ---
const TOKEN = process.env.DISCORD_TOKEN;
const APP_URL = process.env.RENDER_EXTERNAL_URL;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});

const activeSessions = new Map();

const commands = [
    { name: 'ponto', description: 'Abrir painel de controle de ponto' },
    { name: 'ranking', description: 'Exibir ranking de horas trabalhadas' },
    { name: 'ajuda', description: 'Ver guia de utilização do bot' }
];

// Anti-crash
process.on('unhandledRejection', error => console.error('⚠️ Erro detectado:', error));

// Heartbeat
setInterval(() => {
    if (APP_URL) http.get(APP_URL).on('error', () => {});
}, 300000);

client.once('ready', () => {
    console.log('🚀 Bot conectado como ' + client.user.tag);
});

// --- 3. REGISTRO DE COMANDOS ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (message.content === '!setup') {
        if (!message.member.permissions.has('Administrator')) return message.reply('❌ Apenas admins!');
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        try {
            await rest.put(Routes.applicationGuildCommands(client.user.id, message.guild.id), { body: commands });
            await message.reply('✅ **Comandos Slash Atualizados!**');
        } catch (e) { console.error(e); }
    }
});

// --- 4. COMANDOS SLASH ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'ponto') {
        const embed = new EmbedBuilder()
            .setTitle('🚒 Central de Ponto - Nickyville')
            .setDescription('Clique no botão abaixo para iniciar seu turno de serviço.')
            .setColor('#DA373C')
            .addFields({ name: '👤 Agente', value: '<@' + interaction.user.id + '>', inline: true })
            .setFooter({ text: 'Sistema de Ponto • turzim' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_start').setLabel('Iniciar Turno').setStyle(ButtonStyle.Success).setEmoji('🟢')
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'ajuda') {
        const embed = new EmbedBuilder()
            .setTitle('📖 Guia do Bot de Ponto')
            .setColor('#5865F2')
            .setDescription('Como utilizar as funcionalidades:')
            .addFields(
                // Fix: Escaped backticks to prevent breaking the template literal
                { name: '`/ponto`', value: 'Abre o painel para iniciar seu horário.' },
                { name: '`/ranking`', value: 'Mostra quem mais trabalhou no servidor.' },
                { name: '`/ajuda`', value: 'Exibe esta mensagem informativa.' },
                { name: '🛡️ Moderação', value: 'Administradores podem cancelar pontos em andamento usando o botão cinza.' }
            );
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'ranking') {
        let msg = "";
        activeSessions.forEach((s, id) => { msg += '<@' + id + '>: ' + Math.floor(s.totalTime / 60000) + ' min\n'; });
        const embed = new EmbedBuilder()
            .setTitle('🏆 Ranking de Horas')
            .setDescription(msg || "Nenhum dado registrado.")
            .setColor('#FFD700');
        await interaction.reply({ embeds: [embed] });
    }
});

// --- 5. BOTÕES ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;
    const customId = interaction.customId;
    const horaTexto = new Date().toLocaleTimeString('pt-BR');
    
    let session = activeSessions.get(userId) || { status: 'IDLE', startTime: null, history: [], totalTime: 0 };

    // Lógica Especial: Botão de Cancelar (Apenas Admin)
    if (customId === 'btn_cancel') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Apenas **Administradores** podem cancelar um ponto.', ephemeral: true });
        }
        activeSessions.delete(userId);
        const cancelEmbed = new EmbedBuilder()
            .setTitle('🚫 Ponto Cancelado')
            .setDescription('Este ponto foi anulado por um administrador.')
            .setColor('#4E5058')
            .addFields({ name: '👮 Admin', value: '<@' + interaction.user.id + '>' })
            .setTimestamp();
        return interaction.update({ embeds: [cancelEmbed], components: [] });
    }

    let mudou = false;

    if (customId === 'btn_start' && session.status === 'IDLE') {
        session.status = 'WORKING';
        session.startTime = Date.now();
        session.history = ['🟢 Entrada: ' + horaTexto];
        mudou = true;
    } else if (customId === 'btn_pause' && session.status === 'WORKING') {
        session.status = 'PAUSED';
        session.history.push('🟡 Pausa: ' + horaTexto);
        mudou = true;
    } else if (customId === 'btn_resume' && session.status === 'PAUSED') {
        session.status = 'WORKING';
        session.history.push('▶️ Retorno: ' + horaTexto);
        mudou = true;
    } else if (customId === 'btn_finish') {
        const duracao = session.startTime ? (Date.now() - session.startTime) : 0;
        session.totalTime += duracao;
        session.history.push('🔴 Saída: ' + horaTexto);
        session.status = 'IDLE';
        session.startTime = null;
        mudou = true;
    }

    if (mudou) {
        activeSessions.set(userId, session);

        const embed = new EmbedBuilder()
            .setTitle('🚒 Controle de Ponto')
            .setColor(session.status === 'WORKING' ? '#248046' : (session.status === 'PAUSED' ? '#FEE75C' : '#DA373C'))
            .addFields(
                { name: '👤 Agente', value: '<@' + userId + '>', inline: true },
                { name: '📊 Status', value: session.status, inline: true },
                { name: '📋 Logs', value: ' ```ml\n' + session.history.join('\n') + ' ``` ' }
            );

        const row = new ActionRowBuilder();
        if (session.status === 'IDLE') {
            // Removido botão de "Novo Turno" conforme solicitado
            return interaction.update({ embeds: [embed], components: [] });
        } else {
            if (session.status === 'WORKING') {
                row.addComponents(new ButtonBuilder().setCustomId('btn_pause').setLabel('Pausar').setStyle(ButtonStyle.Secondary));
            } else {
                row.addComponents(new ButtonBuilder().setCustomId('btn_resume').setLabel('Retornar').setStyle(ButtonStyle.Success));
            }
            row.addComponents(
                new ButtonBuilder().setCustomId('btn_finish').setLabel('Finalizar').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('btn_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary).setEmoji('✖️')
            );
        }

        await interaction.update({ embeds: [embed], components: [row] });
    }
});

client.login(TOKEN);
