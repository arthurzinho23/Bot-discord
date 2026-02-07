const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require('discord.js');
const http = require('http');
require('dotenv').config();

// --- CONFIGURAÇÕES ---
const PORT = process.env.PORT || 3000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL; // O Render fornece isso automaticamente

if (!DISCORD_TOKEN) {
    console.error("❌ ERRO: DISCORD_TOKEN não definido!");
    process.exit(1);
}

// --- SERVIDOR HTTP & SISTEMA DE HEARTBEAT (ANTI-SLEEP) ---
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Bombeiros Ativo 🚒');
});

server.listen(PORT, () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`);
});

// "Tic" a cada 10 minutos para o bot não morrer
setInterval(() => {
    console.log('💓 Tic-Tac: Mantendo conexão ativa...');
    if (RENDER_URL) {
        http.get(RENDER_URL, (res) => {
            console.log(`📡 Auto-ping realizado: ${res.statusCode}`);
        }).on('error', (err) => console.log('Erro no auto-ping:', err.message));
    }
}, 600000); // 10 minutos

// --- CLIENTE DISCORD ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

const activeSessions = new Map();

const commands = [
    { name: 'ponto', description: 'Abrir painel de controle de ponto' },
    { name: 'ranking', description: 'Exibir ranking de horas trabalhadas' },
    { name: 'ajuda', description: 'Ver lista de comandos' }
];

client.once('ready', () => {
    console.log(`✅ ${client.user.tag} está online!`);
    console.log('🚨 ATENÇÃO: Para os comandos / aparecerem, use "!setup" no servidor desejado.');
});

// --- SISTEMA DE REGISTRO LOCAL (GUILD ONLY) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    if (message.content === '!setup') {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ Apenas administradores podem usar o !setup.');
        }

        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        try {
            await message.reply('⏳ Registrando comandos Slash neste servidor especificamente...');
            
            // Registra os comandos APENAS neste servidor (ID do servidor atual)
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, message.guild.id),
                { body: commands },
            );
            
            await message.reply('✅ **Comandos registrados!** Agora o `/ponto` só aparecerá neste servidor.');
        } catch (error) {
            console.error(error);
            await message.reply('❌ Falha ao registrar comandos: ' + error.message);
        }
    }
});

// --- LOGICA DE COMANDOS SLASH ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (commandName === 'ponto') {
        const embed = new EmbedBuilder()
            .setTitle('🚒 Bombeiros de Nickyville - Ponto')
            .setDescription('Clique no botão abaixo para iniciar seu turno de serviço.')
            .setColor('#DA373C')
            .addFields(
                { name: '👤 Usuário', value: `<@${interaction.user.id}>`, inline: true },
                { name: '🕒 Horário Atual', value: `${now}`, inline: true }
            )
            .setFooter({ text: 'Sistema de Ponto • Nickyville' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_start').setLabel('Iniciar Ponto').setStyle(ButtonStyle.Success).setEmoji('🟢')
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }
});

// --- LOGICA DE BOTÕES COM HORÁRIOS ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;
    const nowTime = new Date().toLocaleTimeString('pt-BR');
    
    let session = activeSessions.get(userId) || { 
        status: 'IDLE', 
        startTime: null, 
        lastAction: 'Nenhuma',
        history: [],
        totalTime: 0 
    };

    switch (interaction.customId) {
        case 'btn_start':
            session.status = 'WORKING';
            session.startTime = Date.now();
            session.history.push(`➡️ Início: ${nowTime}`);
            break;
            
        case 'btn_pause':
            session.status = 'PAUSED';
            session.history.push(`⏸️ Pausa: ${nowTime}`);
            break;

        case 'btn_resume':
            session.status = 'WORKING';
            session.history.push(`▶️ Retorno: ${nowTime}`);
            break;

        case 'btn_finish':
            const duration = session.startTime ? Math.floor((Date.now() - session.startTime) / 60000) : 0;
            session.history.push(`🛑 Fim: ${nowTime} (Duração: ${duration}min)`);
            session.status = 'IDLE';
            session.startTime = null;
            break;
    }

    activeSessions.set(userId, session);

    // Cores e Status
    const colorMap = { 'WORKING': '#248046', 'PAUSED': '#FEE75C', 'IDLE': '#DA373C' };
    const statusMap = { 'WORKING': '🟢 EM SERVIÇO', 'PAUSED': '🟡 EM PAUSA', 'IDLE': '🔴 FORA DE SERVIÇO' };

    const newEmbed = new EmbedBuilder()
        .setTitle('🚒 Bombeiros de Nickyville - Controle')
        .setColor(colorMap[session.status])
        .setTimestamp()
        .addFields(
            { name: '👤 Agente', value: `<@${userId}>`, inline: true },
            { name: '📊 Status', value: `**${statusMap[session.status]}**`, inline: true },
            { name: '📅 Histórico do Turno', value: session.history.join('\n') || 'Nenhuma ação registrada' }
        );

    const row = new ActionRowBuilder();
    if (session.status === 'IDLE') {
        row.addComponents(new ButtonBuilder().setCustomId('btn_start').setLabel('Iniciar Novo Turno').setStyle(ButtonStyle.Success));
        session.history = []; // Reseta histórico para o próximo turno
    } else if (session.status === 'WORKING') {
        row.addComponents(
            new ButtonBuilder().setCustomId('btn_pause').setLabel('Pausar').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_finish').setLabel('Finalizar').setStyle(ButtonStyle.Danger)
        );
    } else if (session.status === 'PAUSED') {
        row.addComponents(
            new ButtonBuilder().setCustomId('btn_resume').setLabel('Retornar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('btn_finish').setLabel('Finalizar').setStyle(ButtonStyle.Danger)
        );
    }

    await interaction.update({ embeds: [newEmbed], components: [row] });
});

client.login(DISCORD_TOKEN);
