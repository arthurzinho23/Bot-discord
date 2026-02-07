const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require('discord.js');
const http = require('http');
require('dotenv').config();

// --- VERIFICAÇÃO DE TOKEN ---
if (!process.env.DISCORD_TOKEN) {
    console.error("❌ ERRO CRÍTICO: Token do Discord não encontrado!");
    console.error("👉 Defina a variável de ambiente 'DISCORD_TOKEN' no seu arquivo .env ou no painel do Render.");
    process.exit(1);
}

// --- SERVIDOR HTTP (PARA RENDER.COM) ---
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Bombeiros está online! 🚒');
});
server.listen(PORT, () => {
    console.log(`🌐 Servidor HTTP ouvindo na porta ${PORT}`);
});

// --- CLIENTE DISCORD ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        // ADICIONADO: Necessário para responder quando marcado (@Bot)
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent 
    ],
    partials: [Partials.Channel]
});

// Banco de dados em memória
const activeSessions = new Map();

// Definição dos Comandos Slash
const commands = [
    { name: 'ponto', description: 'Abrir painel de controle de ponto' },
    { name: 'ranking', description: 'Exibir ranking de horas trabalhadas' },
    { name: 'ajuda', description: 'Ver lista de comandos' }
];

client.once('ready', async () => {
    console.log(`✅ Logado como ${client.user.tag}`);
    console.log('📢 DICA: Certifique-se de ativar "MESSAGE CONTENT INTENT" no Portal do Desenvolvedor do Discord.');

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('⏳ Registrando comandos Slash (isso pode levar alguns minutos)...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('✅ Comandos registrados! Se não aparecerem, tente marcar o bot (@Bot).');
    } catch (error) {
        console.error('❌ Erro no registro de comandos:', error);
    }
});

// --- NOVO: RESPOSTA AO SER MARCADO (@BOT) ---
client.on('messageCreate', async message => {
    // Ignora mensagens de outros bots
    if (message.author.bot) return;

    // Se a mensagem menciona este bot
    if (message.mentions.has(client.user)) {
        console.log(`🔔 Bot mencionado por ${message.author.tag}`);
        
        const embed = new EmbedBuilder()
            .setTitle('Bombeiros de Nickyville')
            .setDescription('**Painel de Ponto**\nVocê me chamou? Aqui está seu painel de controle.')
            .setColor('#DA373C')
            .setFooter({ text: 'feito pelo turzim' })
            .addFields(
                { name: 'Usuário', value: `<@${message.author.id}>`, inline: true },
                { name: 'Status Atual', value: '🔴 IDLE', inline: true }
            );

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_start')
                    .setLabel('Iniciar Ponto')
                    .setStyle(ButtonStyle.Success)
            );

        await message.reply({ embeds: [embed], components: [row] });
    }
});

// --- MANIPULAÇÃO DE COMANDOS SLASH ---
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
            .setDescription('**Comandos:**\n/ponto - Painel\n/ranking - Ver horas\nOu me marque (@Bot) para abrir o painel.')
            .setColor('#DA373C');
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

// --- MANIPULAÇÃO DE BOTÕES ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;
    let session = activeSessions.get(userId) || { status: 'IDLE', startTime: null, pauses: [], totalTime: 0 };
    let actionLog = '';

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
            break;

        case 'btn_finish':
            if (session.status === 'IDLE') return interaction.reply({ content: 'Você não está em serviço.', ephemeral: true });
            
            if (session.startTime) {
                const sessionDuration = Date.now() - session.startTime;
                session.totalTime = (session.totalTime || 0) + sessionDuration;
            }
            
            session.status = 'IDLE';
            session.startTime = null;
            session.pauses = [];
            actionLog = 'Finalizou o serviço';
            break;
    }

    activeSessions.set(userId, session);

    // Atualiza Embed
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

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error("❌ Erro de Login:", err);
});
