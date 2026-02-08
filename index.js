import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, ApplicationCommandOptionType } from 'discord.js';
import { GoogleGenAI } from "@google/genai";
import http from 'http';
import 'dotenv/config';

// --- CONFIGURAÇÕES ---
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const getBrasiliaTime = () => {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).format(new Date());
};

// Servidor de atividade (Obrigatório para o Render/UptimeRobot)
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('SISTEMA DO REI TURZIM ONLINE\nHorário: ' + getBrasiliaTime());
}).listen(PORT);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent 
    ]
});

// --- COMANDOS SLASH ---
const commands = [
    {
        name: 'ponto',
        description: 'Abre o painel de bater ponto (Nickyville)'
    },
    {
        name: 'despertador',
        description: 'Define um lembrete/alarme para você',
        options: [
            {
                name: 'minutos',
                description: 'Em quantos minutos devo te avisar?',
                type: 4, // INTEGER
                required: true
            },
            {
                name: 'mensagem',
                description: 'O que devo te lembrar?',
                type: 3, // STRING
                required: true
            }
        ]
    }
];

// --- IA GEMINI ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.mentions.has(client.user.id)) return;
    
    try {
        await message.channel.sendTyping();
        const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: message.content.replace(/<@!?\d+>/g, '').trim(),
            config: {
                systemInstruction: "Você é a assistente IA de Nickyville sua funçao é ajudar mais voce é grosso grosso e mais presta pra alguma coisa",
            }
        });
        await message.reply(response.text || "Pelo Rei Turzim, estou sem palavras.");
    } catch (e) {
        console.error(e);
        await message.reply("Erro no cérebro, mas Turzim continua sendo o rei!");
    }
});

// --- LOGICA DE COMANDOS ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'ponto') {
            const embed = new EmbedBuilder()
                .setTitle('💼 Bate-Ponto Nickyville')
                .setDescription('**Status:** Sincronizado com Brasília\nHora: ' + getBrasiliaTime())
                .setColor('#5865F2')
                .setFooter({ text: 'Sistema do Rei Turzim' });
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('start').setLabel('Entrar').setStyle(ButtonStyle.Success).setEmoji('🟢')
            );
            await interaction.reply({ embeds: [embed], components: [row] });
        }

        if (interaction.commandName === 'despertador') {
            const min = interaction.options.getInteger('minutos');
            const msg = interaction.options.getString('mensagem');
            
            await interaction.reply({ content: `⏰ Alarme do Rei Turzim definido para ${min} minuto(s): "${msg}"`, ephemeral: true });

            setTimeout(async () => {
                try {
                    await interaction.user.send(`🔔 **DESPERTADOR DO REI:** ${msg}`);
                    await interaction.followUp({ content: `⚠️ <@${interaction.user.id}>, seu alarme tocou: **${msg}**` });
                } catch (e) {
                    await interaction.followUp({ content: `⚠️ <@${interaction.user.id}>, seu alarme tocou: **${msg}** (DMs fechadas)` });
                }
            }, min * 60000);
        }
    }
});

client.once('ready', async () => {
    console.log('🤖 Bot do Turzim pronto! Registrando comandos...');
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Comandos registrados com sucesso!');
    } catch (error) {
        console.error(error);
    }
});

client.login(TOKEN);