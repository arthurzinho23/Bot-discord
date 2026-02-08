import { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    REST, 
    Routes,
    PermissionFlagsBits 
} from 'discord.js';
import { GoogleGenAI } from "@google/genai";
import http from 'http';
import 'dotenv/config';
import './waker.js'; // 🔥 OBRIGATÓRIO: Mantém o bot acordado

// --- CONFIGURAÇÕES ---
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
const PREFIX = '!';

// --- ARMAZENAMENTO (MEMÓRIA) ---
// Em produção, use MongoDB ou SQLite.
const sessions = new Map(); // id -> { userId, startTime, pauses: [], logs: [] }
const userStats = new Map(); // userId -> { username, totalMs }

// Mock inicial para o ranking não ficar vazio
userStats.set('mock1', { username: 'Turzim.Rei', totalMs: 604800000 }); // 168h

// --- SERVIDOR KEEP-ALIVE ---
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    const uptime = process.uptime();
    res.end(`NICKYVILLE SYSTEM ONLINE\nUptime: ${Math.floor(uptime)}s\nSessões Ativas: ${sessions.size}`);
});
server.listen(PORT, () => console.log(`🌐 Servidor rodando na porta ${PORT}`));

// --- UTILITÁRIOS ---
const getBrasiliaTime = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: '2-digit', minute: '2-digit' });
const formatMs = (ms) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}min`;
};
const generateProgressBar = (current, max = 600000000) => {
    const p = Math.min(Math.floor((current / max) * 10), 10);
    return '🟦'.repeat(p) + '⬜'.repeat(10 - p);
};
const generateID = () => Math.random().toString(36).substring(2, 7).toUpperCase();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- COMANDOS SLASH ---
const commands = [
    { name: 'ponto', description: 'Abrir painel de registro de ponto (Entrada/Saída)' },
    { name: 'ranking', description: 'Ver ranking de horas trabalhadas da equipe' },
    { name: 'help', description: 'Ver lista de comandos' },
    { 
        name: 'anular', 
        description: '[ADMIN] Cancela um registro de ponto',
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [{ name: 'id', type: 3, description: 'ID do ponto (#XXXXX)', required: true }]
    }
];

client.once('ready', async () => {
    console.log(`🔥 Bot logado como ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Comandos Slash registrados!');
    } catch (e) { console.error(e); }
});

// --- EVENTOS DE MENSAGEM (IA & DEBUG) ---
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // !debug (Admin Only)
    if (message.content.toLowerCase() === PREFIX + 'debug') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Apenas o Rei Turzim e seus Admins podem usar isso.');
        }
        const embed = new EmbedBuilder()
            .setTitle('🛠️ Diagnóstico Nickyville')
            .setColor('#DA373C')
            .addFields(
                { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
                { name: 'Uptime', value: `${Math.floor(process.uptime())}s`, inline: true },
                { name: 'Sessões Ativas', value: `${sessions.size}`, inline: true },
                { name: 'Memória', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true }
            );
        return message.reply({ embeds: [embed] });
    }

    // IA Mention
    if (message.mentions.has(client.user.id)) {
        await message.channel.sendTyping();
        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: message.content.replace(/<@!?\d+>/g, '').trim(),
                config: { systemInstruction: "Você é a IA do Nickyville. Seu criador é o Turzim. Responda curto e direto." }
            });
            message.reply(response.text);
        } catch (e) { message.reply('Erro na matrix da IA.'); }
    }
});

// --- INTERAÇÕES (SLASH & BOTÕES) ---
client.on('interactionCreate', async interaction => {
    // COMANDOS
    if (interaction.isChatInputCommand()) {
        const { commandName, options, user } = interaction;

        if (commandName === 'ponto') {
            const sid = generateID();
            const embed = new EmbedBuilder()
                .setTitle('🕒 Cartão de Ponto')
                .setDescription(`Olá **${user.username}**, inicie seu turno abaixo.\n🆔 Protocolo: **#${sid}**`)
                .setColor('#5865F2')
                .setFooter({ text: 'Nickyville Fire Dept' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`start_${sid}`).setLabel('Entrar em Serviço').setStyle(ButtonStyle.Success).setEmoji('🟢')
            );
            await interaction.reply({ embeds: [embed], components: [row] });
        }

        if (commandName === 'ranking') {
            const sorted = Array.from(userStats.entries())
                .map(([id, val]) => val)
                .sort((a, b) => b.totalMs - a.totalMs)
                .slice(0, 10);

            const embed = new EmbedBuilder()
                .setTitle('🏆 Ranking de Horas - Nickyville')
                .setColor('#FEE75C')
                .setFooter({ text: 'Atualizado em tempo real' });

            if (sorted.length === 0) embed.setDescription("Nenhum registro ainda.");
            else {
                const fields = sorted.map((s, i) => ({
                    name: `${i+1}º ${s.username}`,
                    value: `⏱️ ${formatMs(s.totalMs)}\n${generateProgressBar(s.totalMs)}`,
                    inline: false
                }));
                embed.addFields(fields);
            }
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'anular') {
            const id = options.getString('id').replace('#', '').toUpperCase();
            if (sessions.delete(id)) {
                interaction.reply({ content: `✅ Ponto #${id} deletado com sucesso.`, ephemeral: true });
            } else {
                interaction.reply({ content: `❌ Ponto #${id} não encontrado ou já finalizado.`, ephemeral: true });
            }
        }

        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('❓ Central de Ajuda')
                .addFields(
                    { name: '/ponto', value: 'Bater ponto', inline: true },
                    { name: '/ranking', value: 'Ver top horas', inline: true },
                    { name: '!debug', value: 'Status (Admin)', inline: true }
                )
                .setColor('#2B2D31');
            interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

    // BOTÕES
    if (interaction.isButton()) {
        const [action, id] = interaction.customId.split('_');
        const user = interaction.user;
        
        let session = sessions.get(id) || { userId: user.id, username: user.username, logs: [], pauses: [], status: 'OFF', startTime: 0 };
        const now = Date.now();
        const timeStr = getBrasiliaTime();

        if (action === 'start') {
            session.startTime = now;
            session.status = '🟢 TRABALHANDO';
            session.logs.push(`▶️ Início: ${timeStr}`);
        } 
        else if (action === 'pause') {
            session.status = '🟡 PAUSA';
            session.pauses.push({ start: now });
            session.logs.push(`⏸️ Pausa: ${timeStr}`);
        }
        else if (action === 'resume') {
            session.status = '🟢 TRABALHANDO';
            const lastPause = session.pauses[session.pauses.length - 1];
            if (lastPause) lastPause.end = now;
            session.logs.push(`▶️ Retorno: ${timeStr}`);
        }
        else if (action === 'stop') {
            session.status = '🔴 FINALIZADO';
            session.logs.push(`⏹️ Fim: ${timeStr}`);
            
            // Cálculo final
            let total = now - session.startTime;
            let pauseTime = session.pauses.reduce((acc, p) => acc + ((p.end || now) - p.start), 0);
            let finalTime = total - pauseTime;

            // Salvar no ranking
            const stats = userStats.get(user.id) || { username: user.username, totalMs: 0 };
            stats.totalMs += finalTime;
            userStats.set(user.id, stats);
            
            sessions.delete(id); // Limpa sessão ativa
        }

        if (action !== 'stop') sessions.set(id, session);

        const embed = new EmbedBuilder()
            .setTitle('🕒 Controle de Ponto')
            .setColor(session.status.includes('PAUSA') ? '#FEE75C' : (session.status.includes('FINAL') ? '#DA373C' : '#248046'))
            .setDescription(`**Colaborador:** ${user.username}\n**Status:** ${session.status}\n\n**Histórico:**\n${session.logs.join('\n')}`)
            .setFooter({ text: `ID: #${id}` });

        const row = new ActionRowBuilder();
        if (action !== 'stop') {
            if (session.status.includes('PAUSA')) {
                 row.addComponents(new ButtonBuilder().setCustomId(`resume_${id}`).setLabel('Retomar').setStyle(ButtonStyle.Success));
            } else {
                 row.addComponents(new ButtonBuilder().setCustomId(`pause_${id}`).setLabel('Pausar').setStyle(ButtonStyle.Secondary));
            }
            row.addComponents(new ButtonBuilder().setCustomId(`stop_${id}`).setLabel('Finalizar').setStyle(ButtonStyle.Danger));
        }

        await interaction.update({ embeds: [embed], components: action === 'stop' ? [] : [row] });
    }
});

client.login(TOKEN);