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
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Inicialização da IA
const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

const getBrasiliaTime = () => {
    return new Date().toLocaleString("pt-BR", { 
        timeZone: "America/Sao_Paulo",
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
};

// --- SERVIDOR WEB PARA O RENDER (CRÍTICO) ---
// O Render precisa que uma porta seja aberta para manter o deploy "Live"
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot de Ponto IA: Online e Operacional');
}).listen(PORT, () => {
    console.log('Servidor de Uptime rodando na porta: ' + PORT);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Registro de Comandos Slash
const commands = [
    {
        name: 'ponto',
        description: 'Bater o ponto (Iniciar/Pausar/Sair)',
    },
    {
        name: 'ranking',
        description: 'Ver ranking de horas trabalhadas',
    }
];

client.once('ready', async () => {
    console.log('✅ Bot logado como: ' + client.user.tag);
    
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('🚀 Comandos slash registrados com sucesso globalmente.');
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }
});

// IA Intelligence - Resposta a menções
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (message.mentions.has(client.user.id)) {
        await message.channel.sendTyping();
        const prompt = message.content.replace(/<@!?d+>/g, '').trim();
        
        try {
            const result = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt || 'Olá!',
                config: {
                    systemInstruction: "Você é a secretária inteligente. Seu dono é o Turzim. Seja educada, eficiente e mencione que o Turzim é um gênio da programação."
                }
            });
            await message.reply(result.text);
        } catch (e) {
            message.reply('Houve um erro no meu cérebro de IA. Avisando o Turzim!');
        }
    }
});

// Lógica de Comandos e Botões
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'ponto') {
            const embed = new EmbedBuilder()
                .setTitle('🕒 Registro de Ponto')
                .setDescription(`Olá **${interaction.user.username}**, o que deseja fazer?\n\n**Status Atual:** 🔴 Offline\n**Horário:** ${getBrasiliaTime()}`)
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
                .setDescription('O ranking está sendo processado pela IA e sincronizado com o banco de dados.')
                .setColor('#FEE75C')
                .setFooter({ text: 'feito pelo turzim' });
            await interaction.reply({ embeds: [embed] });
        }
    }

    if (interaction.isButton()) {
        // Resposta rápida para evitar erro de "Interação falhou"
        await interaction.reply({ 
            content: 'Ação registrada! No seu código real, aqui você conectaria com o MongoDB para salvar o tempo.', 
            ephemeral: true 
        });
    }
});

client.login(TOKEN);
