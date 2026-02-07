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

// --- 1. MONITORAMENTO ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bot Operacional 🚒');
}).listen(PORT, '0.0.0.0');

// --- 2. CONFIGURAÇÕES ---
const TOKEN = process.env.DISCORD_TOKEN;
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});

const activeSessions = new Map(); // Key: UserId, Value: Session Data

const commands = [
    { name: 'ponto', description: 'Abrir painel de controle de ponto' },
    { name: 'ranking', description: 'Exibir ranking de horas trabalhadas' },
    { name: 'ajuda', description: 'Ver guia de utilização do bot' },
    { 
        name: 'anular', 
        description: 'Anula um ponto específico via ID (Apenas Admin)',
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

client.once('ready', () => console.log('🚀 Bot pronto como ' + client.user.tag));

// Prevenção de quedas
process.on('unhandledRejection', e => console.error('⚠️ Erro:', e));

// --- 3. REGISTRO DE COMANDOS (!setup) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (message.content === '!setup') {
        if (!message.member.permissions.has('Administrator')) return;
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        try {
            await rest.put(Routes.applicationGuildCommands(client.user.id, message.guild.id), { body: commands });
            await message.reply('✅ **Comandos Slash Atualizados com Sucesso!**');
        } catch (e) { console.error(e); }
    }
});

// --- 4. COMANDOS SLASH ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user } = interaction;

    if (commandName === 'ponto') {
        const pontoId = '#' + Math.random().toString(36).substring(2, 6).toUpperCase();
        
        const embed = new EmbedBuilder()
            .setAuthor({ name: 'Sistema de Bate-Ponto', iconURL: client.user.displayAvatarURL() })
            .setTitle('🚒 Central de Operações - Bombeiros')
            .setDescription('Bem-vindo ao sistema de registro. Clique no botão abaixo para iniciar seu serviço.\n\n**ID da Sessão:** `' + pontoId + '`\n*Guarde este ID caso precise anular o ponto.*')
            .setThumbnail('https://cdn-icons-png.flaticon.com/512/921/921079.png')
            .setColor('#DA373C')
            .addFields(
                { name: '👤 Agente Solicitante', value: user.toString(), inline: true },
                { name: '📍 Local', value: interaction.guild.name, inline: true }
            )
            .setFooter({ text: 'Bombeiros de Nickyville • turzim' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_start_' + pontoId).setLabel('Iniciar Turno').setStyle(ButtonStyle.Success).setEmoji('🟢')
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'anular') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Apenas **Administradores** podem anular pontos via comando.', ephemeral: true });
        }

        const idAlvo = options.getString('id').toUpperCase().trim();
        const fullId = idAlvo.startsWith('#') ? idAlvo : '#' + idAlvo;

        let sessionKeyFound = null;
        for (let [key, session] of activeSessions) {
            if (session.pontoId === fullId) {
                sessionKeyFound = key;
                break;
            }
        }

        if (sessionKeyFound) {
            activeSessions.delete(sessionKeyFound);
            const embed = new EmbedBuilder()
                .setTitle('🚫 Ponto Anulado')
                .setDescription('O registro de ID **' + fullId + '** foi removido com sucesso.')
                .setColor('#2B2D31')
                .addFields(
                    { name: '👮 Responsável', value: user.toString(), inline: true },
                    { name: '🆔 ID Removido', value: '`' + fullId + '`', inline: true }
                )
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply({ content: '❌ Nenhum ponto ativo encontrado com o ID **' + fullId + '**. Certifique-se de que o ponto ainda está em aberto.', ephemeral: true });
        }
    }

    if (commandName === 'ajuda') {
        const embed = new EmbedBuilder()
            .setTitle('📖 Manual de Instruções')
            .setColor('#5865F2')
            .setThumbnail(client.user.displayAvatarURL())
            .setDescription('Gerencie seu tempo de serviço de forma eficiente:')
            .addFields(
                { name: '📍 `/ponto`', value: 'Gera um novo painel de controle pessoal.' },
                { name: '🏆 `/ranking`', value: 'Visualiza a tabela de classificação de horas.' },
                { name: '🛡️ `/anular [ID]`', value: 'Comando administrativo para invalidar sessões.' }
            )
            .setFooter({ text: 'Suporte técnico disponível' });
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'ranking') {
        const sortedSessions = Array.from(activeSessions.values()).sort((a, b) => b.totalTime - a.totalTime);
        let msg = sortedSessions.length > 0 ? "" : "Nenhum dado registrado no momento.";
        
        sortedSessions.forEach((s, i) => {
            const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '🔹'));
            msg += medal + ' <@' + s.userId + '> | ID: `' + s.pontoId + '`: **' + Math.floor(s.totalTime / 60000) + ' min**\n';
        });

        const embed = new EmbedBuilder()
            .setTitle('🏆 Tabela de Classificação de Serviço')
            .setDescription(msg)
            .setThumbnail('https://cdn-icons-png.flaticon.com/512/3112/3112946.png')
            .setColor('#FFD700')
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
});

// --- 5. LÓGICA DE INTERAÇÃO POR BOTÕES ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const parts = interaction.customId.split('_');
    const action = parts[0] + '_' + parts[1]; // btn_start, btn_pause, etc
    const pontoId = parts[2];
    const userId = interaction.user.id;
    const horaTexto = new Date().toLocaleTimeString('pt-BR');
    
    let session = activeSessions.get(userId) || { 
        status: 'IDLE', 
        startTime: null, 
        history: [], 
        totalTime: 0, 
        userId: userId, 
        pontoId: pontoId 
    };

    // Verificação de segurança: apenas o dono do ponto pode clicar (exceto Admin se necessário)
    if (session.userId !== userId && !interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ Este painel não pertence a você.', ephemeral: true });
    }

    let updated = false;

    if (action === 'btn_start' && session.status === 'IDLE') {
        session.status = 'WORKING';
        session.startTime = Date.now();
        session.history = ['🟢 Entrada: ' + horaTexto];
        updated = true;
    } else if (action === 'btn_pause' && session.status === 'WORKING') {
        session.status = 'PAUSED';
        session.history.push('🟡 Pausa: ' + horaTexto);
        updated = true;
    } else if (action === 'btn_resume' && session.status === 'PAUSED') {
        session.status = 'WORKING';
        session.history.push('▶️ Retorno: ' + horaTexto);
        updated = true;
    } else if (action === 'btn_finish') {
        const duracao = session.startTime ? (Date.now() - session.startTime) : 0;
        session.totalTime += duracao;
        session.history.push('🔴 Saída: ' + horaTexto);
        session.status = 'IDLE';
        session.startTime = null;
        updated = true;
    }

    if (updated) {
        activeSessions.set(userId, session);

        const embed = new EmbedBuilder()
            .setAuthor({ name: 'Monitoramento de Turno', iconURL: interaction.user.displayAvatarURL() })
            .setTitle('🚒 ' + (session.status === 'IDLE' ? 'Turno Finalizado' : 'Turno em Andamento'))
            .setColor(session.status === 'WORKING' ? '#248046' : (session.status === 'PAUSED' ? '#FEE75C' : '#DA373C'))
            .setThumbnail(session.status === 'WORKING' ? 'https://cdn-icons-png.flaticon.com/512/3652/3652191.png' : 'https://cdn-icons-png.flaticon.com/512/2972/2972531.png')
            .addFields(
                { name: '👤 Agente', value: interaction.user.toString(), inline: true },
                { name: '🆔 ID da Sessão', value: '`' + session.pontoId + '`', inline: true },
                { name: '📊 Status Atual', value: '**' + session.status + '**', inline: true },
                { name: '📋 Registro de Atividades', value: '```ml\n' + session.history.join('\n') + ' ```' }
            )
            .setFooter({ text: 'Dica: Use /anular ' + session.pontoId + ' para invalidar este registro.' });

        const row = new ActionRowBuilder();
        const pid = session.pontoId;

        if (session.status === 'IDLE') {
            // Sessão acabou, removemos os botões.
            return interaction.update({ embeds: [embed], components: [] });
        } else {
            if (session.status === 'WORKING') {
                row.addComponents(new ButtonBuilder().setCustomId('btn_pause_' + pid).setLabel('Pausar Turno').setStyle(ButtonStyle.Secondary).setEmoji('🟡'));
            } else {
                row.addComponents(new ButtonBuilder().setCustomId('btn_resume_' + pid).setLabel('Retornar ao Serviço').setStyle(ButtonStyle.Success).setEmoji('▶️'));
            }
            row.addComponents(
                new ButtonBuilder().setCustomId('btn_finish_' + pid).setLabel('Finalizar').setStyle(ButtonStyle.Danger).setEmoji('🔴')
            );
            // Botão de anular removido daqui conforme solicitado
        }

        await interaction.update({ embeds: [embed], components: [row] });
    }
});

client.login(TOKEN);
