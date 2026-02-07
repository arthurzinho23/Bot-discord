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

// --- 1. SERVIDOR DE MONITORAMENTO (CRÍTICO PARA O RENDER) ---
const PORT = process.env.PORT || 3000;

// O Render precisa que o bot escute uma porta imediatamente para o deploy ser bem-sucedido
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bot de Bate-Ponto Nickyville: Ativo e Operante 🚒');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('✅ [RENDER] Servidor HTTP iniciado na porta ' + PORT);
});

// --- 2. CONFIGURAÇÕES DO BOT ---
const TOKEN = process.env.DISCORD_TOKEN;
const APP_URL = process.env.RENDER_EXTERNAL_URL;

if (!TOKEN) {
    console.error("❌ [ERRO] DISCORD_TOKEN não definido! Adicione-o nas Environment Variables do Render.");
    // No Render, se o processo fechar muito rápido, ele tenta reiniciar. 
    // Mantemos o servidor vivo para você poder ler o erro no log.
}

// Previne que o bot caia por erros não tratados (comum em redes instáveis)
process.on('unhandledRejection', error => {
    console.error('⚠️ [AVISO] Erro não tratado:', error);
});

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

// --- 3. HEARTBEAT (ANTI-SLEEP) ---
setInterval(() => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    console.log('💓 [HEARTBEAT] ' + timestamp + ': Bot está online.');
    
    if (APP_URL) {
        http.get(APP_URL, (res) => {
            // Self-ping para evitar hibernação no plano free
        }).on('error', (err) => {
            console.log('Self-ping falhou: ' + err.message);
        });
    }
}, 300000); // A cada 5 minutos

client.once('ready', () => {
    console.log('🚀 [DISCORD] Logado como ' + client.user.tag);
    console.log('🚒 Sistema pronto. Use !setup em um canal para registrar os comandos /');
});

// --- 4. REGISTRO DE COMANDOS (!setup) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    if (message.content === '!setup') {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ Apenas administradores podem usar este comando.');
        }

        const rest = new REST({ version: '10' }).setToken(TOKEN);
        try {
            await message.reply('⏳ Registrando comandos slash neste servidor...');
            
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, message.guild.id),
                { body: commands },
            );
            
            await message.reply('✅ **Comandos Slash Ativados!**\nDigite `/ponto` para começar.');
        } catch (error) {
            console.error(error);
            await message.reply('❌ Falha ao registrar comandos: ' + error.message);
        }
    }
});

// --- 5. INTERAÇÕES (SLASH E BOTÕES) ---
client.on('interactionCreate', async interaction => {
    // Lógica de Comandos Slash
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        const hora = new Date().toLocaleTimeString('pt-BR');

        if (commandName === 'ponto') {
            const embed = new EmbedBuilder()
                .setTitle('🚒 Bombeiros de Nickyville - Ponto')
                .setDescription('Clique no botão abaixo para iniciar seu turno.')
                .setColor('#DA373C')
                .addFields(
                    { name: '👤 Agente', value: '<@' + interaction.user.id + '>', inline: true },
                    { name: '⏰ Horário', value: hora, inline: true }
                )
                .setFooter({ text: 'Sistema de Ponto • turzim' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_start').setLabel('Iniciar Turno').setStyle(ButtonStyle.Success).setEmoji('🟢')
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }

        if (commandName === 'ranking') {
            let msg = activeSessions.size === 0 ? "Nenhum dado." : "";
            activeSessions.forEach((s, id) => {
                msg += '<@' + id + '>: ' + Math.floor(s.totalTime / 60000) + ' min\n';
            });

            const embed = new EmbedBuilder()
                .setTitle('🏆 Ranking de Horas')
                .setDescription(msg || "Nenhum registro hoje.")
                .setColor('#FFD700');
            
            await interaction.reply({ embeds: [embed] });
        }
    }

    // Lógica de Botões
    if (interaction.isButton()) {
        const userId = interaction.user.id;
        const agora = Date.now();
        const horaTexto = new Date().toLocaleTimeString('pt-BR');
        
        let session = activeSessions.get(userId) || { 
            status: 'IDLE', 
            startTime: null, 
            history: [],
            totalTime: 0 
        };

        let updated = false;

        if (interaction.customId === 'btn_start' && session.status === 'IDLE') {
            session.status = 'WORKING';
            session.startTime = agora;
            session.history = ['🟢 Entrada: ' + horaTexto];
            updated = true;
        } else if (interaction.customId === 'btn_pause' && session.status === 'WORKING') {
            session.status = 'PAUSED';
            session.history.push('🟡 Pausa: ' + horaTexto);
            updated = true;
        } else if (interaction.customId === 'btn_resume' && session.status === 'PAUSED') {
            session.status = 'WORKING';
            session.history.push('▶️ Retorno: ' + horaTexto);
            updated = true;
        } else if (interaction.customId === 'btn_finish') {
            const duracao = session.startTime ? (agora - session.startTime) : 0;
            session.totalTime += duracao;
            session.history.push('🔴 Saída: ' + horaTexto);
            session.status = 'IDLE';
            session.startTime = null;
            updated = true;
        }

        if (updated) {
            activeSessions.set(userId, session);

            const embed = new EmbedBuilder()
                .setTitle('🚒 Controle de Ponto')
                .setColor(session.status === 'WORKING' ? '#248046' : (session.status === 'PAUSED' ? '#FEE75C' : '#DA373C'))
                .addFields(
                    { name: '👤 Agente', value: '<@' + userId + '>', inline: true },
                    { name: '📊 Status', value: session.status, inline: true },
                    { name: '📋 Histórico', value: session.history.join('\n') }
                );

            const row = new ActionRowBuilder();
            if (session.status === 'IDLE') {
                row.addComponents(new ButtonBuilder().setCustomId('btn_start').setLabel('Novo Turno').setStyle(ButtonStyle.Success));
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
    }
});

if (TOKEN) {
    client.login(TOKEN).catch(err => {
        console.error("❌ Erro ao conectar ao Discord: " + err.message);
    });
} else {
    console.log("⚠️ Aguardando configuração do DISCORD_TOKEN para iniciar...");
}
