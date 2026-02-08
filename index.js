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
const PREFIX = '!';

// Armazenamento temporário (Em produção, use MongoDB)
const sessions = new Map();

const ai = new GoogleGenAI({ apiKey: API_KEY });

const getBrasiliaTime = () => {
    return new Date().toLocaleString("pt-BR", { 
        timeZone: "America/Sao_Paulo",
        hour: '2-digit', minute: '2-digit', second: '2-digit'
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
    { name: 'ranking', description: 'Ver ranking de horas' },
    { name: 'debug', description: 'Status técnico' },
    { name: 'help', description: 'Guia de comandos' },
    { 
        name: 'anular', 
        description: 'Anular um registro de ponto',
        options: [{
            name: 'id',
            type: 3, // STRING
            description: 'O ID do ponto (ex: #A5B2)',
            required: true
        }]
    }
];

client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('🚀 Comandos slash e sistema de IDs ativos!');
    } catch (e) { console.error(e); }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (message.content.toLowerCase() === PREFIX + 'debug') {
        const embed = new EmbedBuilder()
            .setTitle('🛠️ Diagnóstico')
            .addFields(
                { name: 'Status', value: '🟢 OK', inline: true },
                { name: 'Ping', value: `${client.ws.ping}ms`, inline: true }
            )
            .setColor('#DA373C')
            .setFooter({ text: 'feito pelo turzim' });
        message.reply({ embeds: [embed] });
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, user } = interaction;

        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('❓ Central de Ajuda - Nickyville')
                .setDescription('Bem-vindo ao sistema de ponto oficial.')
                .addFields(
                    { name: '/ponto', value: 'Inicia um novo registro interativo.' },
                    { name: '/anular [ID]', value: 'Cancela um ponto em aberto ou finalizado.' },
                    { name: '/ranking', value: 'Mostra os mais ativos da semana.' }
                )
                .setColor('#5865F2')
                .setFooter({ text: 'feito pelo turzim' });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'anular') {
            const id = options.getString('id').replace('#', '');
            if (sessions.has(id)) {
                sessions.delete(id);
                return interaction.reply({ content: `✅ O ponto **#${id}** foi anulado com sucesso!`, ephemeral: true });
            }
            return interaction.reply({ content: '❌ ID não encontrado ou já expirado.', ephemeral: true });
        }

        if (commandName === 'ponto') {
            const sessionID = generateID();
            const embed = new EmbedBuilder()
                .setTitle('🕒 Registro de Ponto - Nickyville')
                .setDescription(`Olá **${user.username}**, clique abaixo para iniciar.\n\n**ID do Registro:** #${sessionID}`)
                .setColor('#5865F2')
                .setFooter({ text: `ID: #${sessionID} | feito pelo turzim` });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`start_${sessionID}`).setLabel('Começar').setStyle(ButtonStyle.Success)
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    if (interaction.isButton()) {
        const [action, id] = interaction.customId.split('_');
        const { user, message } = interaction;

        // Criar ou recuperar sessão
        let data = sessions.get(id) || { start: '--:--', pause: '--:--', end: '--:--', status: 'Inativo' };

        if (action === 'start') {
            data.start = getBrasiliaTime();
            data.status = '🟢 Em Serviço';
        } else if (action === 'pause') {
            data.pause = getBrasiliaTime();
            data.status = '🟡 Em Pausa';
        } else if (action === 'resume') {
            data.pause = '--:-- (Retomado)';
            data.status = '🟢 Em Serviço';
        } else if (action === 'stop') {
            data.end = getBrasiliaTime();
            data.status = '🔴 Finalizado';
        }

        sessions.set(id, data);

        const newEmbed = new EmbedBuilder()
            .setTitle('🕒 Registro de Ponto - Nickyville')
            .setColor(action === 'stop' ? '#DA373C' : '#5865F2')
            .setDescription(`**Funcionário:** ${user.username}\n**Status:** ${data.status}`)
            .addFields(
                { name: '⏺️ Início', value: data.start, inline: true },
                { name: '⏸️ Pausa', value: data.pause, inline: true },
                { name: '⏹️ Término', value: data.end, inline: true }
            )
            .setFooter({ text: `ID: #${id} | feito pelo turzim` });

        const row = new ActionRowBuilder();
        if (action !== 'stop') {
            if (data.status.includes('Pausa')) {
                row.addComponents(new ButtonBuilder().setCustomId(`resume_${id}`).setLabel('Retomar').setStyle(ButtonStyle.Primary));
            } else {
                row.addComponents(new ButtonBuilder().setCustomId(`pause_${id}`).setLabel('Pausar').setStyle(ButtonStyle.Secondary));
            }
            row.addComponents(new ButtonBuilder().setCustomId(`stop_${id}`).setLabel('Terminar').setStyle(ButtonStyle.Danger));
        }

        await interaction.update({ 
            embeds: [newEmbed], 
            components: action === 'stop' ? [] : [row] 
        });
    }
});

client.login(TOKEN);
