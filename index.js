const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    REST, 
    Routes,
    ApplicationCommandOptionType 
} = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const http = require('http');
require('dotenv').config();

// --- CONFIGURAÇÕES ---
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Inicialização da IA (Gemini)
const genAI = new GoogleGenAI({ apiKey: GEMINI_KEY });
const model = 'gemini-3-flash-preview';

// Função para obter horário de Brasília
const getBrasiliaTime = () => {
    return new Date().toLocaleString("pt-BR", { 
        timeZone: "America/Sao_Paulo",
        hour: '2-digit', minute: '2-digit'
    });
};

// Servidor de atividade (Ping)
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bot Online - GMT-3: ' + getBrasiliaTime());
}).listen(PORT);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // Necessário para ler menções
    ]
});

// --- COMANDOS ---
const commands = [
    { name: 'ponto', description: 'Abrir painel de bate-ponto' },
    { name: 'ranking', description: 'Exibir painel de rankings' }
];

client.once('ready', () => {
    console.log('🤖 IA Pronta e Bot Online como ' + client.user.tag);
});

// --- RESPOSTA DA IA (MENÇÃO) ---
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    // Verifica se o bot foi mencionado
    if (message.mentions.has(client.user.id)) {
        try {
            await message.channel.sendTyping();
            
            const prompt = message.content.replace(/<@!?d+>/g, '').trim() || 'Olá!';
            
            const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
            const result = await ai.models.generateContent({
                model: model,
                contents: prompt,
                config: {
                    systemInstruction: "Você é a assistente oficial do Nickyville. Você é extremamente leal ao 'turzim' , dono e criador. Suas respostas devem ser úteis.
                    temperature: 0.8
                }
            });

            await message.reply(result.text);
        } catch (err) {
            console.error('Erro Gemini:', err);
            await message.reply('Desculpe, minha frequência cerebral falhou. Turzim ainda é o rei, mas estou com erro!');
        }
    }
});

// --- INTERAÇÕES (SLASH COMMANDS) ---
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'ponto') {
            const embed = new EmbedBuilder()
                .setTitle('💼 Painel de Frequência')
                .setDescription('Horário: ' + getBrasiliaTime())
                .setColor('#5865F2');
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('start').setLabel('Entrar').setStyle(ButtonStyle.Success).setEmoji('🟢')
            );
            await interaction.reply({ embeds: [embed], components: [row] });
        }
        
        if (interaction.commandName === 'ranking') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('rk_dia').setLabel('Hoje').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('rk_total').setLabel('Total').setStyle(ButtonStyle.Primary)
            );
            await interaction.reply({ content: '🏆 Escolha o período:', components: [row] });
        }
    }
});

client.login(TOKEN);
