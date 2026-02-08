const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    REST, 
    Routes 
} = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const http = require('http');
require('dotenv').config();

// --- CONFIGURAÇÕES ---
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const API_KEY = process.env.API_KEY;

// Armazenamento temporário (Em produção, use MongoDB)
const sessions = new Map();

const ai = new GoogleGenAI({ apiKey: API_KEY });

const getBrasiliaTime = () => {
    return new Date().toLocaleString("pt-BR", { 
        timeZone: "America/Sao_Paulo",
        hour: '2-digit', minute: '2-digit'
    });
};

const generateID = () => Math.random().toString(36).substring(2, 7).toUpperCase();

// --- SERVIDOR RENDER ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Online - Nickyville System');
}).listen(PORT);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const commands = [
    { name: 'ponto', description: 'Abrir o painel de frequência' },
    { name: 'ranking', description: 'Ver ranking de horas trabalhadas' },
    { name: 'debug', description: 'Status técnico do sistema' },
    { name: 'help', description: 'Guia de comandos do bot' },
    { 
        name: 'anular', 
        description: 'Anular um registro de ponto',
        options: [{
            name: 'id',
            type: 3, 
            description: 'O ID do ponto (ex: #A5B2)',
            required: true
        }]
    }
];

client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('🚀 Nickyville System Online!');
    } catch (e) { console.error(e); }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, user } = interaction;

        if (commandName === 'ranking') {
            const embed = new EmbedBuilder()
                .setTitle('🏆 Ranking de Atividade - Equipe')
                .setDescription('Os membros mais ativos da última semana:')
                .addFields(
                    { name: '🥇 1º Turzim King', value: '168h 20min | 🟦🟦🟦🟦🟦', inline: false },
                    { name: '🥈 2º Admin.Soberano', value: '145h 10min | 🟦🟦🟦🟦⬜', inline: false },
                    { name: '🥉 3º Recruta.Nick', value: '98h 45min | 🟦🟦🟦⬜⬜', inline: false }
                )
                .setColor('#FEE75C')
                .setFooter({ text: 'Sistema Nickyville • Atualizado em tempo real' });
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('❓ Central de Ajuda - Nickyville')
                .setColor('#5865F2')
                .addFields(
                    { name: '📍 /ponto', value: 'Inicia seu registro de entrada.' },
                    { name: '🚫 /anular [ID]', value: 'Cancela um ponto específico.' },
                    { name: '📊 /ranking', value: 'Veja quem está liderando as horas.' }
                )
                .setFooter({ text: 'Dúvidas? Fale com o Turzim' });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'anular') {
            const id = options.getString('id').replace('#', '').toUpperCase();
            if (sessions.has(id)) {
                sessions.delete(id);
                return interaction.reply({ content: `✅ Registro **#${id}** anulado!`, ephemeral: true });
            }
            return interaction.reply({ content: '❌ ID não encontrado.', ephemeral: true });
        }

        if (commandName === 'ponto') {
            const sessionID = generateID();
            const embed = new EmbedBuilder()
                .setTitle('🕒 Painel de Frequência')
                .setDescription(`Olá **${user.username}**, clique no botão para registrar sua entrada.\n\n**Registro:** #${sessionID}`)
                .setColor('#5865F2')
                .setFooter({ text: `ID: #${sessionID} | Nickyville System` });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`start_${sessionID}`).setLabel('Entrar em Serviço').setStyle(ButtonStyle.Success)
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    if (interaction.isButton()) {
        const [action, id] = interaction.customId.split('_');
        const { user } = interaction;

        let data = sessions.get(id) || { 
            start: '--:--', 
            pauses: [], 
            end: '--:--', 
            status: 'Inativo' 
        };

        if (action === 'start') {
            data.start = getBrasiliaTime();
            data.status = '🟢 EM SERVIÇO';
        } else if (action === 'pause') {
            data.pauses.push({ start: getBrasiliaTime(), end: null });
            data.status = '🟡 EM PAUSA';
        } else if (action === 'resume') {
            const lastPause = data.pauses[data.pauses.length - 1];
            if (lastPause) lastPause.end = getBrasiliaTime();
            data.status = '🟢 EM SERVIÇO';
        } else if (action === 'stop') {
            data.end = getBrasiliaTime();
            data.status = '🔴 FINALIZADO';
        }

        sessions.set(id, data);

        // Formatar lista de pausas bonitinha
        let pauseText = data.pauses.length > 0 
            ? data.pauses.map((p, i) => `**Pausa ${i+1}:** ${p.start} ➔ ${p.end || 'Pausado...'}`).join('\n')
            : 'Nenhuma pausa registrada';

        const embed = new EmbedBuilder()
            .setTitle('🕒 Registro de Ponto - Nickyville')
            .setColor(action === 'stop' ? '#DA373C' : (action === 'pause' ? '#FEE75C' : '#5865F2'))
            .setThumbnail(user.displayAvatarURL())
            .addFields(
                { name: '👤 Funcionário', value: user.username, inline: true },
                { name: '📊 Status', value: data.status, inline: true },
                { name: 'Início', value: data.start, inline: true },
                { name: 'Término', value: data.end, inline: true },
                { name: '━━━━ Histórico de Pausas ━━━━', value: pauseText, inline: false }
            )
            .setFooter({ text: `ID: #${id} | feito pelo turzim` });

        const row = new ActionRowBuilder();
        if (action !== 'stop') {
            if (data.status.includes('PAUSA')) {
                row.addComponents(new ButtonBuilder().setCustomId(`resume_${id}`).setLabel('Retomar').setStyle(ButtonStyle.Primary));
            } else {
                row.addComponents(new ButtonBuilder().setCustomId(`pause_${id}`).setLabel('Pausar').setStyle(ButtonStyle.Secondary));
            }
            row.addComponents(new ButtonBuilder().setCustomId(`stop_${id}`).setLabel('Terminar').setStyle(ButtonStyle.Danger));
        }

        await interaction.update({ embeds: [embed], components: action === 'stop' ? [] : [row] });
    }
});

client.login(TOKEN);
