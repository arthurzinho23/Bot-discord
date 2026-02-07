const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel]
});

// Configuração
const CHANNEL_ID = 'ID_DO_CANAL_BATE_PONTO';

// Banco de dados em memória (substitua por SQL/MongoDB em produção)
const activeSessions = new Map();

client.once('ready', () => {
    console.log(`Logado como ${client.user.tag}`);
});

// Registrar Slash Commands (Simplificado)
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'ponto') {
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
    }
});

// Manipulador de Botões
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;
    let session = activeSessions.get(userId) || { status: 'IDLE', startTime: null, pauses: [] };
    let actionLog = '';

    // Lógica de Estado
    switch (interaction.customId) {
        case 'btn_start':
            if (session.status !== 'IDLE') return interaction.reply({ content: 'Você já está em serviço!', ephemeral: true });
            session = { status: 'WORKING', startTime: Date.now(), pauses: [] };
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
            // Finaliza pausa anterior
            break;

        case 'btn_finish':
            if (session.status === 'IDLE') return interaction.reply({ content: 'Você não está em serviço.', ephemeral: true });
            session.status = 'IDLE';
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
