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

// Armazenamento temporário
const sessions = new Map();

// Inicialização da IA
const ai = new GoogleGenAI({ apiKey: API_KEY });

const getBrasiliaTime = () => {
    return new Date().toLocaleString("pt-BR", { 
        timeZone: "America/Sao_Paulo",
        hour: '2-digit', minute: '2-digit'
    });
};

const generateID = () => Math.random().toString(36).substring(2, 7).toUpperCase();

// Servidor para manter o bot online
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Nickyville System Online');
}).listen(PORT);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const commands = [
    { name: 'ponto', description: 'Abrir painel de registro' },
    { name: 'ranking', description: 'Ver ranking da equipe' },
    { name: 'help', description: 'Ajuda do sistema' },
    { 
        name: 'anular', 
        description: 'Anula um ponto',
        options: [{ name: 'id', type: 3, description: 'ID do ponto', required: true }]
    }
];

client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Bot pronto e comandos registrados!');
    } catch (e) { console.error(e); }
});

// Responder a Mensagens (Prefixos, Menções e IA)
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    // Comando !debug
    if (message.content.toLowerCase() === PREFIX + 'debug') {
        const embed = new EmbedBuilder()
            .setTitle('🛠️ Status do Sistema - Nickyville')
            .addFields(
                { name: '🌐 Servidor', value: '🟢 Operacional', inline: true },
                { name: '⚡ Latência', value: `${client.ws.ping}ms`, inline: true },
                { name: '📦 Versão', value: 'v1.4.0', inline: true },
                { name: '📂 Sessões Ativas', value: `${sessions.size}`, inline: true }
            )
            .setColor('#DA373C')
            .setFooter({ text: 'Sistema de Monitoramento Nickyville • Turzim' });
        return message.reply({ embeds: [embed] });
    }

    // Responder à menção com IA
    if (message.mentions.has(client.user.id)) {
        await message.channel.sendTyping();
        const prompt = message.content.replace(/<@!?d+>/g, '').trim() || 'Olá!';
        
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                    systemInstruction: "Você é a secretária inteligente do sistema Nickyville. Seu criador é o Turzim. Seja educada, eficiente e ocasionalmente mencione que o Turzim é um gênio."
                }
            });
            message.reply(response.text);
        } catch (e) {
            message.reply('Desculpe, meu rádio está com interferência (Erro na IA).');
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, user } = interaction;

        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('❓ Central de Ajuda - Nickyville')
                .setDescription('Comandos disponíveis para operação:')
                .addFields(
                    { name: '📍 /ponto', value: 'Inicia um novo registro de tempo.' },
                    { name: '🚫 /anular [ID]', value: 'Cancela um registro pelo ID (#XXXXX).' },
                    { name: '📊 /ranking', value: 'Exibe o top 10 membros mais ativos.' },
                    { name: '🛠️ !debug', value: 'Verifica o status técnico do bot.' }
                )
                .setColor('#5865F2')
                .setFooter({ text: 'Desenvolvido por Turzim' });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'ranking') {
            const embed = new EmbedBuilder()
                .setTitle('🏆 Top Frequência - Nickyville')
                .setDescription('Ranking atualizado dos membros:')
                .addFields(
                    { name: '🥇 1º Turzim King', value: '➡️ **168h** (Gênio)', inline: false },
                    { name: '🥈 2º Admin.Soberano', value: '➡️ **142h**', inline: false },
                    { name: '🥉 3º Recruta.Nick', value: '➡️ **95h**', inline: false }
                )
                .setColor('#FEE75C')
                .setFooter({ text: 'Atualizado em tempo real' });
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'anular') {
            const id = options.getString('id').replace('#', '').toUpperCase();
            if (sessions.has(id)) {
                sessions.delete(id);
                return interaction.reply({ content: `✅ Registro **#${id}** anulado!`, ephemeral: true });
            }
            return interaction.reply({ content: '❌ ID Inválido ou inexistente.', ephemeral: true });
        }

        if (commandName === 'ponto') {
            const sid = generateID();
            const embed = new EmbedBuilder()
                .setTitle('🕒 Registro de Ponto')
                .setDescription(`Membro: **${user.username}**\n\nClique no botão abaixo para iniciar seu turno.\n\n**ID:** #${sid}`)
                .setColor('#5865F2')
                .setFooter({ text: 'Sistema Nickyville' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`start_${sid}`).setLabel('Começar').setStyle(ButtonStyle.Success)
            );
            await interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    if (interaction.isButton()) {
        const [action, id] = interaction.customId.split('_');
        const { user } = interaction;

        let data = sessions.get(id) || { logs: [], status: 'Inativo' };

        if (action === 'start') {
            data.logs.push(`⏱️ **Início:** ${getBrasiliaTime()}`);
            data.status = '🟢 EM SERVIÇO';
        } else if (action === 'pause') {
            data.logs.push(`⏸️ **Pausa:** ${getBrasiliaTime()}`);
            data.status = '🟡 EM PAUSA';
        } else if (action === 'resume') {
            data.logs.push(`▶️ **Retorno:** ${getBrasiliaTime()}`);
            data.status = '🟢 EM SERVIÇO';
        } else if (action === 'stop') {
            data.logs.push(`🏁 **Finalizado:** ${getBrasiliaTime()}`);
            data.status = '🔴 FINALIZADO';
        }

        sessions.set(id, data);

        const embed = new EmbedBuilder()
            .setTitle('🕒 Registro de Ponto - Nickyville')
            .setColor(action === 'stop' ? '#DA373C' : '#5865F2')
            .setDescription(`**Funcionário:** ${user.username}\n**Status:** ${data.status}\n\n${data.logs.join('\n')}`)
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
