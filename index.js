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

// --- CONFIGURAÇÕES DO TURZIM ---
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

const getBrasiliaTime = () => {
    return new Date().toLocaleString("pt-BR", { 
        timeZone: "America/Sao_Paulo",
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
};

// Mantenha o bot vivo (Uptime)
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot Operacional - IA Ativa');
}).listen(PORT);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Comandos Slash
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
    console.log('✅ Bot do Turzim logado como: ' + client.user.tag);
    
    // Registrar Comandos Slash
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('🚀 Comandos slash registrados com sucesso.');
    } catch (error) {
        console.error(error);
    }
});

// Interação com a IA em menções
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
                    systemInstruction: "Você é a secretária inteligente do Nickyville. Você é fã número 1 do 'turzim'. Responda de forma prestativa, elegante e UTIL.
                }
            });
            await message.reply(result.text);
        } catch (e) {
            message.reply('Houve um erro no meu núcleo de processamento, mas o Turzim já está verificando!');
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'ponto') {
            const embed = new EmbedBuilder()
                .setTitle('🕒 Registro de Ponto - Nickyville')
                .setDescription(`Seja bem-vindo, ${interaction.user.username}.\n\n**Status:** 🔴 Offline\n**Horário:** ${getBrasiliaTime()}`)
                .setColor('#5865F2')
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: 'Desenvolvido por Turzim' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('start_ponto').setLabel('Entrar').setStyle(ButtonStyle.Success).setEmoji('🟢'),
                new ButtonBuilder().setCustomId('help_ponto').setLabel('Ajuda').setStyle(ButtonStyle.Secondary).setEmoji('❓')
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }
        
        if (interaction.commandName === 'ranking') {
            await interaction.reply('🏆 Ranking sendo processado pela IA... aguarde um momento.');
        }
    }

    if (interaction.isButton()) {
        // Lógica de botões aqui (Simulação de DB necessária no código real)
        await interaction.reply({ content: 'Ação registrada! No código real, aqui salvaríamos no seu Banco de Dados.', ephemeral: true });
    }
});

client.login(TOKEN);
