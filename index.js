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
    res.end('🚒 Bombeiros Bot: Sistema Ativo');
}).listen(PORT, '0.0.0.0');

// --- 2. CONFIGURAÇÕES ---
const TOKEN = process.env.DISCORD_TOKEN;
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// Banco de dados em memória (Key: UserId, Value: Session Data)
const activeSessions = new Map();

const commands = [
    { name: 'ponto', description: 'Abrir painel de controle de ponto' },
    { name: 'ranking', description: 'Exibir ranking de horas trabalhadas' },
    { name: 'ajuda', description: 'Ver guia de utilização do bot' },
    { 
        name: 'anular', 
        description: 'Anula um registro de ponto pelo ID (Apenas Admin)',
        options: [
            {
                name: 'id',
                description: 'O ID do ponto (ex: #A1B2)',
                type: ApplicationCommandOptionType.String,
                required: true
            }
        ]
    }
];

// Função para registrar comandos slash
async function registerCommands(guildId) {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('⏳ Registrando comandos slash...');
        await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
        console.log('✅ Comandos registrados!');
        return true;
    } catch (e) {
        console.error('❌ Falha ao registrar:', e);
        return false;
    }
}

client.once('ready', () => {
    console.log('🚀 [FIRE-BOT] Online como ' + client.user.tag);
    console.log('🚒 Use !debug ou !setup no Discord para ativar os comandos slash.');
});

// Anti-crash global
process.on('unhandledRejection', error => console.error('⚠️ [ERRO CRÍTICO]:', error));

// --- 3. COMANDOS DE PREFIXO (!setup / !debug) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    if (message.content === '!setup' || message.content === '!debug') {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ Você não tem permissão para usar este comando.');
        }

        const success = await registerCommands(message.guild.id);
        if (success) {
            await message.reply('🔄 **Sistema Reiniciado!**\nTodos os comandos `/` foram atualizados e sincronizados.');
        } else {
            await message.reply('❌ Houve um erro ao sincronizar. Verifique o console.');
        }
    }
});

// --- 4. COMANDOS SLASH ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user } = interaction;

    if (commandName === 'ponto') {
        const pontoId = '#' + Math.random().toString(36).substring(2, 6).toUpperCase();
        
        const embed = new EmbedBuilder()
            .setAuthor({ name: 'CORPO DE BOMBEIROS - NICKYVILLE', iconURL: 'https://cdn-icons-png.flaticon.com/512/921/921079.png' })
            .setTitle('🚒 Registro de Atividade Operacional')
            .setDescription('**Atenção Agente!**\nClique no botão abaixo para iniciar seu turno oficial. Seu tempo será contabilizado automaticamente.')
            .addFields(
                { name: '👤 Operador', value: user.toString(), inline: true },
                { name: '🆔 ID Único', value: '`' + pontoId + '` (Clique para copiar)', inline: true },
                { name: '⚠️ Instrução', value: 'Não feche esta mensagem até terminar o serviço.', inline: false }
            )
            .setThumbnail(user.displayAvatarURL())
            .setImage('https://i.imgur.com/vHqY7pG.png')
            .setColor('#DA373C')
            .setFooter({ text: 'Feito pelo turzim • Bombeiros de Nickyville' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_start_' + pontoId)
                .setLabel('INICIAR SERVIÇO')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🚒')
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'anular') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Acesso negado. Apenas administradores podem anular pontos.', ephemeral: true });
        }

        const idAlvo = options.getString('id').toUpperCase().trim();
        const fullId = idAlvo.startsWith('#') ? idAlvo : '#' + idAlvo;

        let foundKey = null;
        for (let [key, session] of activeSessions) {
            if (session.pontoId === fullId) {
                foundKey = key;
                break;
            }
        }

        if (foundKey) {
            const data = activeSessions.get(foundKey);
            activeSessions.delete(foundKey);

            const embed = new EmbedBuilder()
                .setTitle('🛑 Registro Anulado')
                .setColor('#000000')
                .setDescription('O ponto de ID **' + fullId + '** foi invalidado pelo comando administrativo.')
                .addFields(
                    { name: '👤 Ex-Titular', value: '<@' + data.userId + '>', inline: true },
                    { name: '🛡️ Autoridade', value: user.toString(), inline: true }
                )
                .setFooter({ text: 'Feito pelo turzim • Controle Administrativo' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply({ content: '❌ ID **' + fullId + '** não encontrado no sistema atual.', ephemeral: true });
        }
    }

    if (commandName === 'ranking') {
        const sorted = Array.from(activeSessions.values()).sort((a, b) => b.totalTime - a.totalTime);
        
        let rankMsg = sorted.length > 0 ? "" : "*Nenhum registro de atividade nas últimas 24h.*";
        sorted.forEach((s, i) => {
            const pos = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '🚒'));
            rankMsg += pos + ' <@' + s.userId + '> | ID: `' + s.pontoId + '`: **' + Math.floor(s.totalTime / 60000) + ' min**\n';
        });

        const embed = new EmbedBuilder()
            .setTitle('🏆 Quadro de Honra - Nickyville')
            .setDescription(rankMsg)
            .setColor('#FFD700')
            .setThumbnail('https://cdn-icons-png.flaticon.com/512/3112/3112946.png')
            .setFooter({ text: 'Feito pelo turzim • Ranking Oficial' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'ajuda') {
        const embed = new EmbedBuilder()
            .setTitle('❓ Central de Ajuda')
            .setColor('#5865F2')
            .addFields(
                { name: '`/ponto`', value: 'Inicia um novo registro de trabalho.' },
                { name: '`/ranking`', value: 'Exibe a lista de atividade.' },
                { name: '`/anular`', value: 'Administradores removem registros por ID.' },
                { name: '`!debug`', value: 'Sincroniza os comandos se eles não aparecerem.' }
            )
            .setFooter({ text: 'Feito pelo turzim • Suporte Nickyville' });
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

// --- 5. LÓGICA DOS BOTÕES ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const parts = interaction.customId.split('_');
    const action = parts[0] + '_' + parts[1];
    const pId = parts[2];
    const userId = interaction.user.id;
    const now = Date.now();
    const hora = new Date().toLocaleTimeString('pt-BR');

    let session = activeSessions.get(userId) || {
        status: 'IDLE',
        startTime: null,
        history: [],
        totalTime: 0,
        userId: userId,
        pontoId: pId
    };

    if (session.userId !== userId && !interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ Este painel é restrito ao agente que o solicitou.', ephemeral: true });
    }

    let changed = false;

    if (action === 'btn_start' && session.status === 'IDLE') {
        session.status = 'WORKING';
        session.startTime = now;
        session.history = ['🟢 Entrada: ' + hora];
        changed = true;
    } else if (action === 'btn_pause' && session.status === 'WORKING') {
        session.status = 'PAUSED';
        session.history.push('🟡 Pausa: ' + hora);
        session.totalTime += (now - session.startTime);
        session.startTime = null;
        changed = true;
    } else if (action === 'btn_resume' && session.status === 'PAUSED') {
        session.status = 'WORKING';
        session.startTime = now;
        session.history.push('▶️ Retorno: ' + hora);
        changed = true;
    } else if (action === 'btn_finish') {
        if (session.status === 'WORKING') {
            session.totalTime += (now - session.startTime);
        }
        session.history.push('🔴 Saída: ' + hora);
        session.status = 'IDLE';
        session.startTime = null;
        changed = true;
    }

    if (changed) {
        activeSessions.set(userId, session);

        const embed = new EmbedBuilder()
            .setAuthor({ name: 'ESTAÇÃO OPERACIONAL', iconURL: interaction.user.displayAvatarURL() })
            .setTitle(session.status === 'IDLE' ? '✅ SERVIÇO FINALIZADO' : '🚒 SERVIÇO EM CURSO')
            .setDescription('**ID da Sessão:** `' + session.pontoId + '`')
            .setColor(session.status === 'WORKING' ? '#248046' : (session.status === 'PAUSED' ? '#FEE75C' : '#DA373C'))
            .addFields(
                { name: '👤 Agente', value: interaction.user.toString(), inline: true },
                { name: '📊 Status', value: '`' + session.status + '`', inline: true },
                { name: '⏰ Tempo Total', value: Math.floor(session.totalTime / 60000) + ' minutos', inline: true },
                { name: '📋 Registro de Atividades', value: '```ml\n' + session.history.join('\n') + '```' }
            )
            .setFooter({ text: 'Feito pelo turzim • Use /anular ' + session.pontoId + ' para correções.' })
            .setTimestamp();

        const row = new ActionRowBuilder();
        if (session.status === 'IDLE') {
            await interaction.update({ embeds: [embed], components: [] });
        } else {
            if (session.status === 'WORKING') {
                row.addComponents(new ButtonBuilder().setCustomId('btn_pause_' + pId).setLabel('PAUSAR').setStyle(ButtonStyle.Secondary).setEmoji('🟡'));
            } else {
                row.addComponents(new ButtonBuilder().setCustomId('btn_resume_' + pId).setLabel('RETORNAR').setStyle(ButtonStyle.Success).setEmoji('▶️'));
            }
            row.addComponents(
                new ButtonBuilder().setCustomId('btn_finish_' + pId).setLabel('FINALIZAR').setStyle(ButtonStyle.Danger).setEmoji('🔴')
            );
            await interaction.update({ embeds: [embed], components: [row] });
        }
    }
});

client.login(TOKEN);
