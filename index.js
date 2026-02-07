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
    res.end('💼 Sistema de Ponto Multi-Serviços: Ativo');
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

const activeSessions = new Map();

const commands = [
    { name: 'ponto', description: 'Abrir painel de bate-ponto' },
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
    console.log('🚀 [BOT-PONTO] Online como ' + client.user.tag);
});

process.on('unhandledRejection', error => console.error('⚠️ [ERRO]:', error));

// --- 3. COMANDOS DE PREFIXO ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (message.content === '!setup' || message.content === '!debug') {
        if (!message.member.permissions.has('Administrator')) return message.reply('❌ Permissão insuficiente.');
        const success = await registerCommands(message.guild.id);
        if (success) await message.reply('🔄 **Sistema Sincronizado!**');
    }
});

// --- 4. COMANDOS SLASH ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user } = interaction;

    if (commandName === 'ponto') {
        const pontoId = '#' + Math.random().toString(36).substring(2, 6).toUpperCase();
        
        const embed = new EmbedBuilder()
            .setTitle('📑 SISTEMA DE GESTÃO DE PONTO')
            .setDescription('Olá ' + user.toString() + ', bem-vindo ao painel de registro. Certifique-se de estar em seu posto antes de iniciar o turno.\n\n**Lembrete:** O abuso deste sistema pode resultar em advertências administrativas.')
            .addFields(
                { name: '👤 Agente Solicitante', value: user.tag, inline: true },
                { name: '🆔 Protocolo de Sessão', value: '`' + pontoId + '`', inline: true },
                { name: '🏢 Unidade de Trabalho', value: interaction.guild.name, inline: true },
                { name: '📅 Data de Emissão', value: new Date().toLocaleDateString('pt-BR'), inline: false },
                { name: '🛠️ Guia de Operação', value: '1. Clique em **Iniciar** para abrir o chamado.\n2. Use **Pausar** para intervalos rápidos.\n3. Clique em **Finalizar** ao encerrar suas atividades.', inline: false }
            )
            .setColor('#5865F2')
            .setFooter({ text: 'Feito pelo turzim • Sistema Multi-Serviços v2.1' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_start_' + pontoId)
                .setLabel('INICIAR JORNADA')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('⏱️')
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'anular') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Apenas administradores podem anular pontos.', ephemeral: true });
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
                .setTitle('🛑 REGISTRO INVALIDADO')
                .setColor('#2B2D31')
                .setDescription('O sistema de auditoria confirmou a exclusão do registro abaixo por ordem administrativa.')
                .addFields(
                    { name: '📌 Identificador', value: '`' + fullId + '`', inline: true },
                    { name: '👤 Ex-Titular', value: '<@' + data.userId + '>', inline: true },
                    { name: '🛡️ Autoridade Responsável', value: user.toString(), inline: false },
                    { name: '📅 Data do Cancelamento', value: new Date().toLocaleString('pt-BR'), inline: false }
                )
                .setFooter({ text: 'Feito pelo turzim • Auditoria Nickyville' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply({ content: '❌ Protocolo **' + fullId + '** não encontrado no cache ativo.', ephemeral: true });
        }
    }

    if (commandName === 'ranking') {
        const sorted = Array.from(activeSessions.values()).sort((a, b) => b.totalTime - a.totalTime);
        let rankMsg = sorted.length > 0 ? "" : "*Não há agentes operando no momento.*";
        
        sorted.forEach((s, i) => {
            const pos = i === 0 ? '👑' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '🔹'));
            rankMsg += pos + ' **' + (i+1) + 'º** - <@' + s.userId + '> | `' + s.pontoId + '`\n┗━ 🕒 Acumulado: **' + Math.floor(s.totalTime / 60000) + ' min**\n';
        });

        const embed = new EmbedBuilder()
            .setTitle('🏆 QUADRO GERAL DE ATIVIDADES')
            .setDescription('Lista de agentes ativos e seus respectivos tempos de serviço nas últimas 24 horas.\n\n' + rankMsg)
            .setColor('#FEE75C')
            .addFields({ name: '📊 Estatística', value: 'Atualmente temos **' + sorted.length + '** funcionários em serviço.', inline: false })
            .setFooter({ text: 'Feito pelo turzim • Atualizado em tempo real' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'ajuda') {
        const embed = new EmbedBuilder()
            .setTitle('❓ CENTRAL DE AJUDA E SUPORTE OPERACIONAL')
            .setDescription('Seja bem-vindo à central de auxílio do **Nickyville Multi-Serviços**. Este sistema gerencia de forma automatizada todos os registros de jornada de trabalho dos funcionários.')
            .setColor('#5865F2')
            .addFields(
                { 
                    name: '🚀 COMANDOS PARA COLABORADORES', 
                    value: '>>> `/ponto` - Abre o painel interativo para iniciar sua jornada.\n`/ranking` - Exibe a lista de funcionários ativos e o tempo acumulado.', 
                    inline: false 
                },
                { 
                    name: '🛡️ FERRAMENTAS ADMINISTRATIVAS', 
                    value: '>>> `/anular [ID]` - Invalida um registro específico (Protocolo).\n`!setup` - Sincroniza e atualiza os comandos do bot.\n`!debug` - Realiza uma limpeza no cache do sistema.', 
                    inline: false 
                },
                { 
                    name: '📜 PROTOCOLO DE UTILIZAÇÃO', 
                    value: '• Sempre registre sua entrada ao chegar no posto.\n• O tempo de pausa **não** é contabilizado como jornada ativa.\n• Certifique-se de finalizar o ponto antes de se desconectar.', 
                    inline: false 
                },
                { 
                    name: 'ℹ️ INFORMAÇÕES TÉCNICAS', 
                    value: '```yml\nVersão: 2.1.0-Stable\nDesenvolvedor: turzim\nServidor: Multi-Ponto\nStatus: Operacional```', 
                    inline: false 
                }
            )
            .setFooter({ text: 'Feito pelo turzim • Suporte Especializado' })
            .setTimestamp();
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
        return interaction.reply({ content: '❌ Acesso negado. Este painel pertence a outro usuário.', ephemeral: true });
    }

    let changed = false;

    if (action === 'btn_start' && session.status === 'IDLE') {
        session.status = 'WORKING';
        session.startTime = now;
        session.history = ['🟢 Entrada Registrada: ' + hora];
        changed = true;
    } else if (action === 'btn_pause' && session.status === 'WORKING') {
        session.status = 'PAUSED';
        session.history.push('🟡 Intervalo Iniciado: ' + hora);
        session.totalTime += (now - session.startTime);
        session.startTime = null;
        changed = true;
    } else if (action === 'btn_resume' && session.status === 'PAUSED') {
        session.status = 'WORKING';
        session.startTime = now;
        session.history.push('▶️ Retorno ao Posto: ' + hora);
        changed = true;
    } else if (action === 'btn_finish') {
        if (session.status === 'WORKING') session.totalTime += (now - session.startTime);
        session.history.push('🔴 Jornada Encerrada: ' + hora);
        session.status = 'IDLE';
        session.startTime = null;
        changed = true;
    }

    if (changed) {
        activeSessions.set(userId, session);

        const embed = new EmbedBuilder()
            .setTitle(session.status === 'IDLE' ? '🏁 JORNADA FINALIZADA' : '⏳ TURNO EM PROCESSAMENTO')
            .setDescription('**Protocolo:** `' + session.pontoId + '`\nStatus atualizado do registro de atividades do colaborador.')
            .setColor(session.status === 'WORKING' ? '#248046' : (session.status === 'PAUSED' ? '#FEE75C' : '#DA373C'))
            .addFields(
                { name: '👤 Colaborador', value: interaction.user.tag, inline: true },
                { name: '📊 Estado Atual', value: '`' + session.status + '`', inline: true },
                { name: '⏰ Tempo Acumulado', value: '**' + Math.floor(session.totalTime / 60000) + '** minutos', inline: true },
                { name: '📅 Data', value: new Date().toLocaleDateString('pt-BR'), inline: true },
                { name: '🏢 Unidade', value: interaction.guild.name, inline: true },
                { name: '📋 Registro de Logs', value: '```ml\n' + session.history.join('\n') + '\nTotal: ' + Math.floor(session.totalTime / 60000) + ' min```' }
            )
            .setFooter({ text: 'Feito pelo turzim • Registro Oficial de Ponto' })
            .setTimestamp();

        const row = new ActionRowBuilder();
        if (session.status === 'IDLE') {
            await interaction.update({ embeds: [embed], components: [] });
        } else {
            if (session.status === 'WORKING') {
                row.addComponents(new ButtonBuilder().setCustomId('btn_pause_' + pId).setLabel('PAUSAR INTERVALO').setStyle(ButtonStyle.Secondary).setEmoji('🟡'));
            } else {
                row.addComponents(new ButtonBuilder().setCustomId('btn_resume_' + pId).setLabel('RETORNAR TRABALHO').setStyle(ButtonStyle.Success).setEmoji('▶️'));
            }
            row.addComponents(
                new ButtonBuilder().setCustomId('btn_finish_' + pId).setLabel('FECHAR PONTO').setStyle(ButtonStyle.Danger).setEmoji('🔴')
            );
            await interaction.update({ embeds: [embed], components: [row] });
        }
    }
});

client.login(TOKEN);
