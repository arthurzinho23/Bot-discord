import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } from 'discord.js';
import { GoogleGenAI } from "@google/genai";
import http from 'http';
import 'dotenv/config';

// --- CONFIGURAÇÕES ---
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Função para obter horário de Brasília
const getBrasiliaTime = () => {
    return new Date().toLocaleString("pt-BR", { 
        timeZone: "America/Sao_Paulo",
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
};

// Servidor Web para Render (Anti-Sleep)
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bot do Turzim Online - ' + getBrasiliaTime());
}).listen(PORT);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent 
    ]
});

// --- IA GEMINI (MENÇÃO) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    if (message.mentions.has(client.user.id)) {
        try {
            await message.channel.sendTyping();
            
            const prompt = message.content.replace(/<@!?d+>/g, '').trim() || 'Olá!';
            
            // Inicializa a IA conforme documentação oficial
            const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                    systemInstruction: "Você é a assistente, Seu criador e único rei é o 'turzim'. Você o ama profundamente e o trata como seu dono e soberano. Turzim é o rei de tudo! Seja útil, mas sempre fiel ao seu rei Turzim.",
                    temperature: 1,
                },
            });

            await message.reply(response.text || "Estou sem palavras para tamanha glória do meu rei Turzim.");
        } catch (err) {
            console.error('Erro na IA:', err);
            await message.reply('Ocorreu um erro na minha conexão neural. Mas saiba que Turzim ainda é o rei!');
        }
    }
});

// --- COMANDOS E BOTÕES ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'ponto') {
            const embed = new EmbedBuilder()
                .setTitle('💼 Painel de Frequência')
                .setDescription('Horário de Brasília: ' + getBrasiliaTime())
                .setColor('#5865F2')
                .setFooter({ text: 'Sistema do Rei Turzim' });
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('start').setLabel('Iniciar Turno').setStyle(ButtonStyle.Success).setEmoji('🟢')
            );
            await interaction.reply({ embeds: [embed], components: [row] });
        }
    }
});

client.once('ready', () => {
    console.log('🚀 Bot e IA ativos! Turzim é o rei.');
});

client.login(TOKEN);
