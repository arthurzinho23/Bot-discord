const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require('discord.js');
const http = require('http');
require('dotenv').config();

// --- CONFIGURAÇÃO PARA RENDER.COM ---
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Bombeiros está online! 🚒');
});

server.listen(PORT, () => {
    console.log(`Servidor HTTP ouvindo na porta ${PORT}`);
});

// --- CONFIGURAÇÃO DO BOT ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel]
});

// Banco de dados em memória
const activeSessions = new Map();

// Definição dos Comandos Slash
const commands = [
    {
        name: 'ponto',
        description: 'Abrir painel de controle de ponto'
    },
    {
        name: 'ranking',
        description: 'Exibir ranking de horas trabalhadas'
    },
    {
        name: 'ajuda',
        description: 'Ver lista de comandos'
    }
];

client.once('ready', async () => {
    console.log(`Logado como ${client.user.tag}`);

    // Registrar comandos Slash automaticamente ao iniciar
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Iniciando atualização dos comandos de aplicação (/).');

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );

        console.log('Comandos de aplicação (/) recarregados com sucesso.');
    } catch (error) {
        console.error(error);
    }
});

// --- MANIPULAÇÃO DE COMANDOS ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'ponto') {
        const embed = new EmbedBuilder()
            .setTitle('Bombeiros de Nickyville')
            .setDescription('Sistema de ponto eletrônico. Utilize os botões abaixo para registrar suas horas.')
            .setColor('#DA373C')
            .setFooter({ text: 'feito pelo turzim' })
            .addFields(
                { name: 'Usuário', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Status Atual', value: '🔴 IDLE', inline: true }
            );

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_start')
                    .setLabel('Iniciar Ponto')
                    .setStyle(ButtonStyle.Success)
            );

        await interaction.reply({ embeds: [embed], components: [row] });
    } else if (commandName === 'ranking') {
        // Exemplo simples de ranking
        let rankMsg = "🏆 **Ranking de Horas**\n";
        if (activeSessions.size === 0) {
            rankMsg += "Nenhum registro ainda.";
        } else {
             activeSessions.forEach((session, userId) => {
                 if (session.totalTime) {
                     const hours = Math.floor(session.totalTime / 1000 / 60 / 60);
                     const mins = Math.floor((session.totalTime / 1000 / 60) % 60);
                     rankMsg += `<@${userId}>: ${hours}h ${mins}m\n`;
                 }
             });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('Bombeiros de Nickyville - Ranking')
            .setDescription(rankMsg)
            .setColor('#FFD700')
            .setFooter({ text: 'feito pelo turzim' });

        await interaction.reply({ embeds: [embed] });
    } else if (commandName === 'ajuda') {
        const embed = new EmbedBuilder()
            .setTitle('Ajuda')
            .setDescription('Comandos disponíveis:\n/ponto - Abrir painel\n/ranking - Ver horas')
            .setColor('#DA373C');
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

// --- MANIPULAÇÃO DE BOTÕES ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;
    // Recupera sessão ou cria nova
    let session = activeSessions.get(userId) || { status: 'IDLE', startTime: null, pauses: [], totalTime: 0 };
    let actionLog = '';

    // Lógica de Estado
    switch (interaction.customId) {
        case 'btn_start':
            if (session.status !== 'IDLE') return interaction.reply({ content: 'Você já está em serviço!', ephemeral: true });
            session.status = 'WORKING';
            session.startTime = Date.now();
            actionLog = 'Iniciou o serviço';
            break;
            
        case 'btn_pause':
            if (session.status !== 'WORKING') return interaction.reply({ content: 'Ação inválida.', ephemeral: true });
            session.status = 'PAUSED';
            session.pauses.push({ start: Date.now() });
            actionLog = 'Pausou o serviço';
            break;

        case 'btn_resume':
            if (session.status !== 'PAUSED') return interaction.reply({ content: 'Ação inválida.', ephemeral: true });
            session.status = 'WORKING';
            // Calcula tempo de pausa se necessário para descontar
            break;

        case 'btn_finish':
            if (session.status === 'IDLE') return interaction.reply({ content: 'Você não está em serviço.', ephemeral: true });
            
            // Calcula tempo trabalhado na sessão
            if (session.startTime) {
                const sessionDuration = Date.now() - session.startTime;
                // (Aqui você subtrairia as pausas em um sistema real)
                session.totalTime = (session.totalTime || 0) + sessionDuration;
            }
            
            session.status = 'IDLE';
            session.startTime = null;
            session.pauses = [];
            actionLog = 'Finalizou o serviço';
            break;
    }

    activeSessions.set(userId, session);

    // Atualizar o Embed Existente
    const statusEmoji = session.status === 'WORKING' ? '🟢' : session.status === 'PAUSED' ? '🟡' : '🔴';
    
    const newEmbed = new EmbedBuilder()
        .setTitle('Bombeiros de Nickyville')
        .setColor(session.status === 'WORKING' ? '#248046' : '#DA373C') 
        .setFooter({ text: 'feito pelo turzim' })
        .setTimestamp()
        .addFields(
            { name: 'Usuário', value: `<@${userId}>`, inline: true },
            { name: 'Status Atual', value: `${statusEmoji} ${session.status}`, inline: true }
        );

    if (session.status !== 'IDLE') {
        const duration = Math.floor((Date.now() - session.startTime) / 1000 / 60);
        newEmbed.setDescription(`Você está em serviço há: **${duration} minutos**`);
    } else {
        newEmbed.setDescription(`Turno finalizado. ${actionLog}`);
    }

    // Novos Botões
    const newRow = new ActionRowBuilder();
    
    if (session.status === 'IDLE') {
        newRow.addComponents(
            new ButtonBuilder().setCustomId('btn_start').setLabel('Iniciar Ponto').setStyle(ButtonStyle.Success)
        );
    } else if (session.status === 'WORKING') {
        newRow.addComponents(
            new ButtonBuilder().setCustomId('btn_pause').setLabel('Pausar').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_finish').setLabel('Finalizar').setStyle(ButtonStyle.Danger)
        );
    } else if (session.status === 'PAUSED') {
        newRow.addComponents(
            new ButtonBuilder().setCustomId('btn_resume').setLabel('Retornar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('btn_finish').setLabel('Finalizar').setStyle(ButtonStyle.Danger)
        );
    }

    await interaction.update({ embeds: [newEmbed], components: [newRow] });
});

client.login(process.env.DISCORD_TOKEN);
