const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require('discord.js');
const http = require('http');
require('dotenv').config();

// --- VERIFICAÇÃO DE TOKEN ---
if (!process.env.DISCORD_TOKEN) {
    console.error("❌ ERRO CRÍTICO: Token do Discord não encontrado!");
    process.exit(1);
}

// --- SERVIDOR HTTP (PARA RENDER.COM) ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Bombeiros Online');
}).listen(PORT, () => console.log(`🌐 Servidor HTTP na porta ${PORT}`));

// --- CLIENTE DISCORD ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// Banco de dados em memória
const activeSessions = new Map();

// Definição dos Comandos
const commands = [
    { name: 'ponto', description: 'Abrir painel de controle de ponto' },
    { name: 'ranking', description: 'Exibir ranking de horas trabalhadas' },
    { name: 'ajuda', description: 'Ver lista de comandos' }
];

client.once('ready', async () => {
    console.log(`✅ Logado como ${client.user.tag}`);
    console.log('💡 DICA: Digite "!setup" no chat do Discord para forçar os comandos a aparecerem imediatamente.');
    
    // Tenta registrar globalmente (pode demorar 1h para propagar)
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Comandos globais atualizados (pode haver delay).');
    } catch (e) { console.error('Erro registro global:', e); }
});

// --- COMANDO MÁGICO PARA FORÇAR REGISTRO (!setup) ---
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Comando para forçar os comandos aparecerem AGORA
    if (message.content === '!setup') {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        try {
            await message.reply('⏳ Forçando registro de comandos neste servidor...');
            
            // Registra APENAS neste servidor (atualização instantânea)
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, message.guild.id),
                { body: commands },
            );
            
            await message.reply('✅ **Sucesso!** Digite `/` agora e veja se `/ponto` aparece.\n(Se não aparecer, reinicie seu Discord no PC/Celular crtl+r).');
        } catch (error) {
            console.error(error);
            await message.reply('❌ Erro ao registrar: ' + error.message);
        }
    }

    // Comando extra para limpar chat (útil para testes)
    if (message.content === '!limpar') {
        if (!message.member.permissions.has('ManageMessages')) return;
        try {
            await message.channel.bulkDelete(10);
            message.channel.send('🧹 Limpeza rápida realizada.').then(m => setTimeout(() => m.delete(), 3000));
        } catch (e) {}
    }

    // Resposta à menção (@Bot)
    if (message.mentions.has(client.user)) {
        message.reply('🚒 Olá! Digite `/ponto` para começar ou `!setup` se os comandos sumiram.');
    }
});

// --- COMANDOS SLASH (INTERAÇÃO) ---
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'ponto') {
            const embed = new EmbedBuilder()
                .setTitle('Bombeiros de Nickyville')
                .setDescription('**Controle de Ponto**\nUtilize os botões abaixo para gerenciar seu turno.')
                .setColor('#DA373C')
                .setFooter({ text: 'feito pelo turzim' })
                .addFields(
                    { name: 'Usuário', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Status', value: '🔴 Fora de Serviço', inline: true }
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_start').setLabel('Iniciar Ponto').setStyle(ButtonStyle.Success).setEmoji('🚒')
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        } 
        
        else if (commandName === 'ranking') {
            let rankMsg = "";
            if (activeSessions.size === 0) rankMsg = "Nenhum registro ainda.";
            else {
                activeSessions.forEach((session, userId) => {
                    if (session.totalTime) {
                        const h = Math.floor(session.totalTime / 3600000);
                        const m = Math.floor((session.totalTime % 3600000) / 60000);
                        rankMsg += `<@${userId}>: **${h}h ${m}m**\n`;
                    }
                });
            }
            const embed = new EmbedBuilder()
                .setTitle('🏆 Ranking de Horas')
                .setDescription(rankMsg || "Ninguém trabalhou ainda.")
                .setColor('#FFD700')
                .setFooter({ text: 'feito pelo turzim' });
            await interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'ajuda') {
            await interaction.reply({ 
                // Fixed unescaped backticks here to prevent syntax errors and incorrect type inference
                content: 'Commands: `/ponto`, `/ranking`. Se sumirem, digite `!setup`.', 
                ephemeral: true 
            });
        }
    }

    // --- LÓGICA DOS BOTÕES ---
    if (interaction.isButton()) {
        const userId = interaction.user.id;
        // Carrega sessão ou cria nova
        let session = activeSessions.get(userId) || { status: 'IDLE', startTime: null, pauses: [], totalTime: 0 };
        let actionLog = '';
        let color = '#DA373C'; // Vermelho (IDLE)

        // Máquina de Estados
        switch (interaction.customId) {
            case 'btn_start':
                if (session.status !== 'IDLE') return interaction.reply({ content: 'Você já está em serviço!', ephemeral: true });
                session.status = 'WORKING';
                session.startTime = Date.now();
                actionLog = 'iniciou o turno';
                break;
                
            case 'btn_pause':
                if (session.status !== 'WORKING') return interaction.reply({ content: 'Você não está trabalhando.', ephemeral: true });
                session.status = 'PAUSED';
                session.pauses.push({ start: Date.now() });
                actionLog = 'pausou o turno';
                break;

            case 'btn_resume':
                if (session.status !== 'PAUSED') return interaction.reply({ content: 'Você não está pausado.', ephemeral: true });
                session.status = 'WORKING';
                // Lógica simples de pausa: desconta o tempo parado do startTime (avaliação simplificada)
                // Num sistema real, somariamos o tempo de pausa separado. 
                // Para simplicidade visual aqui, apenas ajustamos o status.
                actionLog = 'retornou ao trabalho';
                break;

            case 'btn_finish':
                if (session.status === 'IDLE') return interaction.reply({ content: 'Você não iniciou.', ephemeral: true });
                
                // Calcula tempo da sessão atual
                let currentSessionTime = 0;
                if (session.startTime) {
                    currentSessionTime = Date.now() - session.startTime;
                    // Descontar pausas aqui se necessário
                }
                
                session.totalTime = (session.totalTime || 0) + currentSessionTime;
                session.status = 'IDLE';
                session.startTime = null;
                session.pauses = [];
                actionLog = 'finalizou o turno';
                break;
        }

        activeSessions.set(userId, session);

        // Define cor e texto baseados no novo status
        let statusText = '🔴 Fora de Serviço';
        color = '#DA373C';

        if (session.status === 'WORKING') {
            statusText = '🟢 Em Serviço';
            color = '#248046';
        } else if (session.status === 'PAUSED') {
            statusText = '🟡 Pausado';
            color = '#FEE75C';
        }

        // Reconstrói o Embed
        const newEmbed = new EmbedBuilder()
            .setTitle('Bombeiros de Nickyville')
            .setColor(color)
            .setFooter({ text: 'feito pelo turzim' })
            .setTimestamp()
            .addFields(
                { name: 'Usuário', value: `<@${userId}>`, inline: true },
                { name: 'Status', value: statusText, inline: true }
            );

        if (session.status !== 'IDLE') {
            const minutes = Math.floor((Date.now() - session.startTime) / 60000);
            newEmbed.setDescription(`Tempo decorrido: **${minutes} minutos**`);
        } else {
            newEmbed.setDescription(`✅ Registro salvo: <@${userId}> ${actionLog}.`);
        }

        // Reconstrói Botões
        const row = new ActionRowBuilder();
        
        if (session.status === 'IDLE') {
            row.addComponents(
                new ButtonBuilder().setCustomId('btn_start').setLabel('Iniciar Ponto').setStyle(ButtonStyle.Success).setEmoji('🚒')
            );
        } else if (session.status === 'WORKING') {
            row.addComponents(
                new ButtonBuilder().setCustomId('btn_pause').setLabel('Pausar').setStyle(ButtonStyle.Secondary).setEmoji('⏸️'),
                new ButtonBuilder().setCustomId('btn_finish').setLabel('Finalizar').setStyle(ButtonStyle.Danger).setEmoji('🛑')
            );
        } else if (session.status === 'PAUSED') {
            row.addComponents(
                new ButtonBuilder().setCustomId('btn_resume').setLabel('Retornar').setStyle(ButtonStyle.Success).setEmoji('▶️'),
                new ButtonBuilder().setCustomId('btn_finish').setLabel('Finalizar').setStyle(ButtonStyle.Danger).setEmoji('🛑')
            );
        }

        await interaction.update({ embeds: [newEmbed], components: [row] });
    }
});

client.login(process.env.DISCORD_TOKEN);
