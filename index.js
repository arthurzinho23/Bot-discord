const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require('discord.js');
const http = require('http');
require('dotenv').config();

// --- CONFIGURAÇÃO DE AMBIENTE ---
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const APP_URL = process.env.RENDER_EXTERNAL_URL; 

if (!TOKEN) {
    console.error("❌ ERRO: A variável DISCORD_TOKEN não foi configurada!");
    process.exit(1);
}

// --- SERVIDOR PARA MANTER ONLINE (HEARTBEAT) ---
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot de Ponto Online 🚒');
});

server.listen(PORT, () => {
    console.log('✅ Servidor HTTP pronto na porta ' + PORT);
});

// "Tic" a cada 10 minutos para evitar hibernação
setInterval(() => {
    console.log('💓 Heartbeat: Bot está vivo e operante.');
    if (APP_URL) {
        http.get(APP_URL, (res) => {
            console.log('📡 Auto-ping (Anti-Sleep): Status ' + res.statusCode);
        }).on('error', (e) => console.log('⚠️ Erro no auto-ping: ' + e.message));
    }
}, 600000);

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
    console.log('🚀 ' + client.user.tag + ' está pronto!');
    console.log('📢 IMPORTANTE: Use "!setup" no canal do seu servidor para ativar os comandos /');
});

// --- COMANDO DE SETUP (RESTRITO A SERVIDOR) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    if (message.content === '!setup') {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ Você precisa de permissão de Administrador para usar o !setup.');
        }

        const rest = new REST({ version: '10' }).setToken(TOKEN);
        try {
            await message.reply('⏳ Registrando comandos apenas neste servidor...');
            
            // Registra os comandos APENAS nesta Guild (Servidor)
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, message.guild.id),
                { body: commands },
            );
            
            await message.reply('✅ **Comandos Slash Ativados!** Digite `/ponto` para testar.\n*Nota: Se não aparecer, reinicie seu Discord.*');
        } catch (error) {
            console.error(error);
            await message.reply('❌ Erro no Registro: ' + error.message);
        }
    }
});

// --- INTERAÇÕES DE COMANDO ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const now = new Date().toLocaleTimeString('pt-BR');

    if (commandName === 'ponto') {
        const embed = new EmbedBuilder()
            .setTitle('🚒 Bombeiros de Nickyville - Ponto')
            .setDescription('Sistema de ponto eletrônico.\nInicie seu turno clicando no botão abaixo.')
            .setColor('#DA373C')
            .addFields(
                { name: '👤 Agente', value: '<@' + interaction.user.id + '>', inline: true },
                { name: '⏰ Hora Atual', value: now, inline: true }
            )
            .setFooter({ text: 'Sistema de Ponto • Criado por turzim' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_start').setLabel('Iniciar Ponto').setStyle(ButtonStyle.Success).setEmoji('🟢')
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'ranking') {
        let rankText = "";
        if (activeSessions.size === 0) rankText = "Nenhum registro encontrado.";
        else {
            activeSessions.forEach((session, userId) => {
                const totalMin = Math.floor(session.totalTime / 60000) || 0;
                rankText += '<@' + userId + '>: **' + totalMin + ' minutos**\n';
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🏆 Ranking de Horas Trabalhadas')
            .setDescription(rankText)
            .setColor('#FFD700');
        
        await interaction.reply({ embeds: [embed] });
    }
});

// --- INTERAÇÕES DE BOTÃO (SISTEMA DE PONTO) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;
    const nowTime = new Date().toLocaleTimeString('pt-BR');
    
    let session = activeSessions.get(userId) || { 
        status: 'IDLE', 
        startTime: null, 
        history: [],
        totalTime: 0 
    };

    let updated = false;

    switch (interaction.customId) {
        case 'btn_start':
            if (session.status !== 'IDLE') return interaction.reply({ content: 'Você já está em um turno!', ephemeral: true });
            session.status = 'WORKING';
            session.startTime = Date.now();
            session.history = ['🟢 **Início:** ' + nowTime];
            updated = true;
            break;
            
        case 'btn_pause':
            if (session.status !== 'WORKING') return interaction.reply({ content: 'Você não pode pausar agora.', ephemeral: true });
            session.status = 'PAUSED';
            session.history.push('🟡 **Pausa:** ' + nowTime);
            updated = true;
            break;

        case 'btn_resume':
            if (session.status !== 'PAUSED') return interaction.reply({ content: 'Você não está em pausa.', ephemeral: true });
            session.status = 'WORKING';
            session.history.push('▶️ **Retorno:** ' + nowTime);
            updated = true;
            break;

        case 'btn_finish':
            if (session.status === 'IDLE') return interaction.reply({ content: 'Inicie um turno primeiro.', ephemeral: true });
            
            const sessionDuration = session.startTime ? (Date.now() - session.startTime) : 0;
            session.totalTime += sessionDuration;
            session.history.push('🔴 **Fim:** ' + nowTime + ' (Turno de ' + Math.floor(sessionDuration / 60000) + ' min)');
            session.status = 'IDLE';
            session.startTime = null;
            updated = true;
            break;
    }

    if (updated) {
        activeSessions.set(userId, session);

        const statusMap = { 'WORKING': '🟢 EM SERVIÇO', 'PAUSED': '🟡 EM PAUSA', 'IDLE': '🔴 FORA DE SERVIÇO' };
        const colorMap = { 'WORKING': '#248046', 'PAUSED': '#FEE75C', 'IDLE': '#DA373C' };

        const embed = new EmbedBuilder()
            .setTitle('🚒 Controle de Ponto - Nickyville')
            .setColor(colorMap[session.status])
            .addFields(
                { name: '👤 Agente', value: '<@' + userId + '>', inline: true },
                { name: '📊 Estado', value: '**' + statusMap[session.status] + '**', inline: true },
                { name: '📅 Histórico do Turno', value: session.history.join('\n') }
            )
            .setTimestamp();

        const row = new ActionRowBuilder();
        if (session.status === 'IDLE') {
            row.addComponents(new ButtonBuilder().setCustomId('btn_start').setLabel('Iniciar Novo Turno').setStyle(ButtonStyle.Success));
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

        await interaction.update({ embeds: [embed], components: [row] });
    }
});

client.login(TOKEN);
