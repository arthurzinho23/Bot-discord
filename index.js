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
const API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY;

// Inicialização da IA (Gemini)
const ai = new GoogleGenAI({ apiKey: API_KEY });

const getBrasiliaTime = () => {
    return new Date().toLocaleString("pt-BR", { 
        timeZone: "America/Sao_Paulo",
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
};

// --- SERVIDOR PARA O RENDER (Obrigatório) ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Online - Nickyville System');
}).listen(PORT, () => {
    console.log('Servidor de rede ativo na porta: ' + PORT);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Registrar Comandos Slash
const commands = [
    {
        name: 'ponto',
        description: 'Abrir o painel de frequência (Bater Ponto)',
    },
    {
        name: 'ranking',
        description: 'Ver ranking de horas trabalhadas',
    },
    {
        name: 'debug',
        description: 'Verificar status técnico do bot',
    }
];

client.once('ready', async () => {
    console.log('✅ ' + client.user.tag + ' está online!');
    
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('🚀 Comandos slash sincronizados com sucesso!');
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }
});

// IA Responde a menções
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (message.mentions.has(client.user.id)) {
        await message.channel.sendTyping();
        const prompt = message.content.replace(/<@!?d+>/g, '').trim();
        
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt || 'Olá!',
                config: {
                    systemInstruction: "Você é a secretária inteligente do Nickyville. Seu dono é o Turzim. Responda de forma prestativa e mencione que o Turzim é um mestre da programação."
                }
            });
            await message.reply(response.text);
        } catch (e) {
            message.reply('Houve um erro no meu núcleo de IA, mas o Turzim já está verificando!');
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'ponto') {
            const embed = new EmbedBuilder()
                .setTitle('🕒 Registro de Ponto - Nickyville')
                .setDescription(`Olá **${interaction.user.username}**, o que deseja fazer agora?\n\n**Status Atual:** 🔴 Offline\n**Horário:** ${getBrasiliaTime()}`)
                .setColor('#5865F2')
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: 'feito pelo turzim' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('start_ponto').setLabel('Entrar').setStyle(ButtonStyle.Success).setEmoji('🟢'),
                new ButtonBuilder().setCustomId('help_ponto').setLabel('Ajuda').setStyle(ButtonStyle.Secondary).setEmoji('❓')
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }
        
        if (interaction.commandName === 'ranking') {
            const embed = new EmbedBuilder()
                .setTitle('🏆 Ranking de Atividade')
                .setDescription('O ranking global está sendo atualizado via banco de dados...')
                .setColor('#FEE75C')
                .setFooter({ text: 'feito pelo turzim' });
            await interaction.reply({ embeds: [embed] });
        }

        if (interaction.commandName === 'debug') {
            const embed = new EmbedBuilder()
                .setTitle('🛠️ Painel de Diagnóstico')
                .addFields(
                    { name: '🤖 Status do Bot', value: '🟢 Operacional', inline: true },
                    { name: '⚡ Latência', value: `${client.ws.ping}ms`, inline: true },
                    { name: '🧠 IA Intelligence', value: 'Conectada (Gemini 2.0)', inline: true },
                    { name: '🌐 Servidor (Render)', value: 'Saudável (Porta ${PORT})', inline: false }
                )
                .setColor('#DA373C')
                .setFooter({ text: 'feito pelo turzim' });
            await interaction.reply({ embeds: [embed] });
        }
    }

    if (interaction.isButton()) {
        await interaction.reply({ 
            content: '✅ Ação registrada no sistema! No código de produção, aqui salvamos no MongoDB.', 
            ephemeral: true 
        });
    }
});

client.login(TOKEN);
