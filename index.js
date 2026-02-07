const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    REST, 
    Routes,
    ApplicationCommandOptionType
} = require('discord.js');
const http = require('http');
require('dotenv').config();

// --- 1. SERVIDOR DE MONITORAMENTO ---
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

// Armazenamos as sessões ativas. Agora o ID do ponto é a chave para permitir anulação individual.
const activeSessions = new Map(); 

const commands = [
    { name: 'ponto', description: 'Abrir painel de controle de ponto' },
    { name: 'ranking', description: 'Exibir ranking de horas trabalhadas' },
    { name: 'ajuda', description: 'Ver guia de utilização do bot' },
    { 
        name: 'anular', 
        description: 'Anula um ponto específico (Apenas Admin)',
        options: [
            {
                name: 'id',
                description: 'O ID do bate-ponto (ex: #A1B2)',
                type: ApplicationCommandOptionType.String,
                required: true
            }
        ]
    }
];

// Anti-crash
process.on('unhandledRejection', error => console.error('⚠️ Erro detectado:', error));

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

    const { commandName, options } = interaction;

    if (commandName === 'ponto') {
        // Gerar um ID único curto para este ponto
        const pontoId = '#' + Math.random().toString(36).substring(2, 6).toUpperCase();
        
        const embed = new EmbedBuilder()
            .setTitle('🚒 Central de Ponto - Nickyville')
            .setDescription('Inicie seu turno abaixo. Guarde seu ID de sessão.')
            .setColor('#DA373C')
            .addFields(
                { name: '👤 Agente', value: '<@' + interaction.user.id + '>', inline: true },
                { name: '🆔 ID do Ponto', value: '`' + pontoId + '`', inline: true }
            )
            .setFooter({ text: 'Sistema de Ponto • turzim' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_start_' + pontoId).setLabel('Iniciar Turno').setStyle(ButtonStyle.Success).setEmoji('🟢')
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'anular') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Este comando é restrito a **Administradores**.', ephemeral: true });
        }

        const idAlvo = options.getString('id').toUpperCase().replace('#', '');
        const fullId = '#' + idAlvo;

        let encontrado = false;
        for (let [key, session] of activeSessions) {
            if (session.pontoId === fullId) {
                activeSessions.delete(key);
                encontrado = true;
                break;
            }
        }

        if (encontrado) {
            await interaction.reply({ content: '✅ O ponto **' + fullId + '** foi anulado com sucesso e removido do ranking.' });
        } else {
            await interaction.reply({ content: '❌ Não encontrei nenhum ponto ativo com o ID **' + fullId + '**. Verifique se o ponto já não foi finalizado ou se o ID está correto.', ephemeral: true });
        }
    }

    if (commandName === 'ajuda') {
        const embed = new EmbedBuilder()
            .setTitle('📖 Guia do Bot de Ponto')
            .setColor('#5865F2')
            .setDescription('Como utilizar as funcionalidades:')
            .addFields(
                { name: '`/ponto`', value: 'Abre o painel para iniciar seu horário.' },
                { name: '`/ranking`', value: 'Mostra quem mais trabalhou no servidor.' },
                { name: '`/anular [ID]`', value: 'Administradores podem cancelar um ponto específico.' },
                { name: '🛡️ Moderação', value: 'O ID do ponto aparece no topo da mensagem de controle.' }
            );
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'ranking') {
        let msg = "";
        const lista = Array.from(activeSessions.values());
        
        if (lista.length === 0) msg = "Nenhum dado registrado.";
        else {
            lista.forEach((s) => { 
                msg += '<@' + s.userId + '> | ID: `' + s.pontoId + '`: **' + Math.floor(s.totalTime / 60000) + ' min**\n'; 
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🏆 Ranking de Horas')
            .setDescription(msg)
            .setColor('#FFD700');
        await interaction.reply({ embeds: [embed] });
    }
});

// --- 5. LÓGICA DE BOTÕES ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const [action, type, pontoId] = interaction.customId.split('_'); 
    // Nota: simplificamos o customId para btn_start_#ID, btn_pause_#ID, etc.
    const actualPontoId = pontoId ? pontoId : ''; 
    const userId = interaction.user.id;
    const horaTexto = new Date().toLocaleTimeString('pt-BR');
    
    // Recuperamos a sessão pelo UserId ou criamos uma nova vinculada ao pontoId
    let sessionKey = userId;
    let session = activeSessions.get(sessionKey) || { 
        status: 'IDLE', 
        startTime: null, 
        history: [], 
        totalTime: 0, 
        userId: userId, 
        pontoId: actualPontoId 
    };

    const isStart = interaction.customId.startsWith('btn_start');
    const isPause = interaction.customId.startsWith('btn_pause');
    const isResume = interaction.customId.startsWith('btn_resume');
    const isFinish = interaction.customId.startsWith('btn_finish');
    const isCancel = interaction.customId.startsWith('btn_cancel');

    if (isCancel) {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Apenas admins podem cancelar.', ephemeral: true });
        }
        activeSessions.delete(userId);
        return interaction.update({ content: '🚫 Ponto anulado via painel por Admin.', embeds: [], components: [] });
    }

    let mudou = false;

    if (isStart && session.status === 'IDLE') {
        session.status = 'WORKING';
        session.startTime = Date.now();
        session.history = ['🟢 Entrada: ' + horaTexto];
        mudou = true;
    } else if (isPause && session.status === 'WORKING') {
        session.status = 'PAUSED';
        session.history.push('🟡 Pausa: ' + horaTexto);
        mudou = true;
    } else if (isResume && session.status === 'PAUSED') {
        session.status = 'WORKING';
        session.history.push('▶️ Retorno: ' + horaTexto);
        mudou = true;
    } else if (isFinish) {
        const duracao = session.startTime ? (Date.now() - session.startTime) : 0;
        session.totalTime += duracao;
        session.history.push('🔴 Saída: ' + horaTexto);
        session.status = 'IDLE';
        session.startTime = null;
        mudou = true;
    }

    if (mudou) {
        activeSessions.set(sessionKey, session);

        const embed = new EmbedBuilder()
            .setTitle('🚒 Controle de Ponto - ' + session.pontoId)
            .setColor(session.status === 'WORKING' ? '#248046' : (session.status === 'PAUSED' ? '#FEE75C' : '#DA373C'))
            .addFields(
                { name: '👤 Agente', value: '<@' + userId + '>', inline: true },
                { name: '📊 Status', value: session.status, inline: true },
                { name: '📋 Logs', value: ' ```ml\n' + session.history.join('\n') + ' ``` ' }
            );

        const row = new ActionRowBuilder();
        const pid = session.pontoId;

        if (session.status === 'IDLE') {
            return interaction.update({ embeds: [embed], components: [] });
        } else {
            if (session.status === 'WORKING') {
                row.addComponents(new ButtonBuilder().setCustomId('btn_pause_' + pid).setLabel('Pausar').setStyle(ButtonStyle.Secondary));
            } else {
                row.addComponents(new ButtonBuilder().setCustomId('btn_resume_' + pid).setLabel('Retornar').setStyle(ButtonStyle.Success));
            }
            row.addComponents(
                new ButtonBuilder().setCustomId('btn_finish_' + pid).setLabel('Finalizar').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('btn_cancel_' + pid).setLabel('Anular').setStyle(ButtonStyle.Secondary).setEmoji('✖️')
            );
        }

        await interaction.update({ embeds: [embed], components: [row] });
    }
});

client.login(TOKEN);
