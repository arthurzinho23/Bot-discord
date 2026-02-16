import { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    REST, 
    Routes,
    PermissionFlagsBits 
} from 'discord.js';
import { GoogleGenAI } from "@google/genai";
import http from 'http';
import 'dotenv/config';
import './waker.js';

// --- CONFIGURAÇÕES ---
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
const PREFIX = '!';

// --- ARMAZENAMENTO (MEMÓRIA) ---
const sessions = new Map(); // Sessões ATIVAS
const userStats = new Map(); 
// Estrutura userStats: 
// userId -> { username, totalMs, weeklyMs, dailyMs, history: [{ id, startTime, endTime, duration, status }] }

let lastDayCheck = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

// --- SERVIDOR KEEP-ALIVE ---
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`SISTEMA NICKYVILLE ONLINE (TURZIM EDITION)\nUptime: ${Math.floor(process.uptime())}s\nSessões Ativas: ${sessions.size}`);
});
server.listen(PORT, () => console.log(`🌐 Servidor rodando na porta ${PORT}`));

// --- UTILITÁRIOS ---
const getBrasiliaTime = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: '2-digit', minute: '2-digit', second: '2-digit' });
const getDateStr = () => new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

const formatMs = (ms) => {
    if (!ms || ms < 0) return "0s";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}h ${m}m ${s}s`;
};

const generateProgressBar = (current, max) => {
    if (!current || current === 0) return '⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜';
    const percentage = Math.min((current / max), 1);
    const filled = Math.floor(percentage * 10);
    return '🟦'.repeat(filled) + '⬜'.repeat(10 - filled);
};

const generateID = () => Math.random().toString(36).substring(2, 7).toUpperCase();

const checkDailyReset = () => {
    const currentDay = getDateStr();
    if (currentDay !== lastDayCheck) {
        console.log('🔄 Virada de dia detectada! Resetando ranking diário...');
        userStats.forEach(stat => { stat.dailyMs = 0; });
        lastDayCheck = currentDay;
    }
};

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- COMANDOS SLASH ---
const commands = [
    { name: 'ponto', description: 'Abrir painel de registro de ponto' },
    { name: 'ranking', description: 'Ver ranking de horas (Diário/Semanal/Geral)' },
    { name: 'help', description: 'Ver todos os comandos disponíveis' },
    { 
        name: 'anular', 
        description: '[ADMIN] Ver e anular pontos (Ativos e Histórico)',
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [{ name: 'usuario', type: 6, description: 'Selecione o usuário', required: true }]
    },
    {
        name: 'ia',
        description: 'Tire dúvidas com a IA do Turzim',
        options: [{ name: 'pergunta', type: 3, description: 'Sua dúvida ou solicitação', required: true }]
    }
];

client.once('ready', async () => {
    console.log(`✅ Bot logado como ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Comandos registrados com sucesso!');
    } catch (e) { console.error(e); }
});

// --- EVENTOS E INTERAÇÕES ---
client.on('interactionCreate', async interaction => {
    if (interaction.user.bot) return;

    try {
        checkDailyReset();

        // 1. COMANDOS DE CHAT
        if (interaction.isChatInputCommand()) {
            const { commandName, options, user } = interaction;

            if (commandName === 'ponto') {
                const sid = generateID();
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ SISTEMA DE PONTO')
                    .setDescription(`Olá, **${user.username}**.\nClique abaixo para iniciar seu turno.`)
                    .setColor('#5865F2')
                    .addFields(
                        { name: 'Protocolo', value: `#${sid}`, inline: true },
                        { name: 'Status', value: '🔴 AGUARDANDO', inline: true }
                    )
                    .setFooter({ text: 'Nickyville Management • by Turzim' })
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`start_${sid}`).setLabel('INICIAR TURNO').setStyle(ButtonStyle.Success).setEmoji('🛡️')
                );
                
                const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
                
                sessions.set(sid, { 
                    userId: user.id, 
                    username: user.username, 
                    logs: [], 
                    pauses: [], 
                    status: 'OFF', 
                    startTime: 0,
                    messageId: message.id
                });
            }

            if (commandName === 'ranking') {
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('ranking_filter')
                    .setPlaceholder('Selecione o período...')
                    .addOptions(
                        new StringSelectMenuOptionBuilder().setLabel('Ranking Geral (Total)').setValue('total').setEmoji('🏆'),
                        new StringSelectMenuOptionBuilder().setLabel('Ranking Semanal').setValue('weekly').setEmoji('📅'),
                        new StringSelectMenuOptionBuilder().setLabel('Ranking Diário').setValue('daily').setEmoji('☀️'),
                    );

                const embed = new EmbedBuilder()
                    .setTitle('📊 Ranking de Horas')
                    .setDescription('Selecione abaixo qual ranking deseja visualizar.')
                    .setColor('#2B2D31');

                await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
            }

            if (commandName === 'anular') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '⛔ Sem permissão.', ephemeral: true });
                }

                const targetUser = options.getUser('usuario');
                
                // 1. Busca sessões ativas
                const activeSessions = [];
                for (const [key, session] of sessions.entries()) {
                    if (session.userId === targetUser.id) {
                        activeSessions.push({ id: key, ...session, type: 'active' });
                    }
                }

                // 2. Busca histórico (fechados)
                const stats = userStats.get(targetUser.id);
                const historySessions = stats && stats.history ? stats.history.map(s => ({ ...s, type: 'closed' })) : [];

                // 3. Combina e ordena (Mais recente primeiro)
                const allSessions = [...activeSessions, ...historySessions]
                    .sort((a, b) => b.startTime - a.startTime)
                    .slice(0, 25); // Limite do Discord

                if (allSessions.length === 0) {
                    return interaction.reply({ content: `✅ O usuário **${targetUser.username}** não possui registros (ativos ou recentes).`, ephemeral: true });
                }

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('anular_select')
                    .setPlaceholder('Selecione o registro para APAGAR')
                    .addOptions(
                        allSessions.map(s => {
                            const startDate = new Date(s.startTime);
                            const dateStr = startDate.toLocaleDateString('pt-BR');
                            const timeStr = startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                            
                            let duration = 0;
                            let emoji = '';
                            let labelPrefix = '';

                            if (s.type === 'active') {
                                duration = s.startTime > 0 ? Date.now() - s.startTime : 0;
                                emoji = '🟢';
                                labelPrefix = '[ATIVO]';
                            } else {
                                duration = s.duration;
                                emoji = '🔴';
                                labelPrefix = '[FECHADO]';
                            }
                            
                            return new StringSelectMenuOptionBuilder()
                                .setLabel(`${emoji} ${dateStr} - ${timeStr}`)
                                .setDescription(`${labelPrefix} ID: ${s.id} | Tempo: ${formatMs(duration)}`)
                                .setValue(s.id)
                        })
                    );

                const embed = new EmbedBuilder()
                    .setTitle(`🔧 Gerenciamento: ${targetUser.username}`)
                    .setDescription(`Aqui estão os últimos pontos de **${targetUser.username}**.
Selecione um para **ANULAR** (apagar e descontar horas).`)
                    .setColor('#DA373C');

                await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
            }

            if (commandName === 'ia') {
                await interaction.deferReply();
                const question = options.getString('pergunta');
                
                if (!API_KEY) return interaction.editReply('❌ IA não configurada.');

                try {
                    const ai = new GoogleGenAI({ apiKey: API_KEY });
                    const response = await ai.models.generateContent({
                        model: 'gemini-3-flash-preview',
                        contents: question,
                        config: { systemInstruction: "Você é uma IA assistente do servidor Nickyville. Responda de forma curta." }
                    });

                    const answer = response.text || "Sem resposta.";
                    const embed = new EmbedBuilder()
                        .setTitle('🤖 IA Nickyville')
                        .setDescription(answer.length > 4000 ? answer.substring(0, 4000) + '...' : answer)
                        .setColor('#00A8FC');
                    
                    await interaction.editReply({ embeds: [embed] });
                } catch (err) {
                    await interaction.editReply('❌ Erro na IA.');
                }
            }
            
            if (commandName === 'help') {
                const embed = new EmbedBuilder()
                    .setTitle('📘 Ajuda')
                    .setColor('#00A8FC')
                    .addFields(
                        { name: '/ponto', value: 'Bater ponto.', inline: true },
                        { name: '/ranking', value: 'Ver ranking.', inline: true },
                        { name: '/anular', value: 'Gerenciar pontos.', inline: true }
                    );
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }

        // 2. INTERAÇÃO DE MENUS
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'ranking_filter') {
                const filter = interaction.values[0];
                const sorted = Array.from(userStats.entries())
                    .map(([id, stats]) => ({ ...stats, id }))
                    .filter(s => {
                        const val = filter === 'daily' ? s.dailyMs : (filter === 'weekly' ? s.weeklyMs : s.totalMs);
                        return val > 0;
                    })
                    .sort((a, b) => {
                        const valA = filter === 'daily' ? a.dailyMs : (filter === 'weekly' ? a.weeklyMs : a.totalMs);
                        const valB = filter === 'daily' ? b.dailyMs : (filter === 'weekly' ? b.weeklyMs : b.totalMs);
                        return valB - valA;
                    })
                    .slice(0, 10);

                const titles = { total: '🏆 Ranking Geral', weekly: '📅 Ranking Semanal', daily: '☀️ Ranking Diário' };
                const maxVal = sorted.length > 0 ? (filter === 'daily' ? sorted[0].dailyMs : (filter === 'weekly' ? sorted[0].weeklyMs : sorted[0].totalMs)) : 1;

                const embed = new EmbedBuilder()
                    .setTitle(titles[filter])
                    .setColor('#FEE75C')
                    .setTimestamp();

                if (sorted.length === 0) embed.setDescription("⚠️ Ninguém bateu ponto neste período.");
                else {
                    embed.addFields(sorted.map((s, i) => {
                        const val = filter === 'daily' ? s.dailyMs : (filter === 'weekly' ? s.weeklyMs : s.totalMs);
                        return { name: `#${i+1} ${s.username}`, value: `⏱️ **${formatMs(val)}**\n${generateProgressBar(val, maxVal)}`, inline: false };
                    }));
                }
                await interaction.update({ embeds: [embed] });
            }

            if (interaction.customId === 'anular_select') {
                const targetId = interaction.values[0];

                // CASO 1: Anular ponto ATIVO
                if (sessions.has(targetId)) {
                    const session = sessions.get(targetId);
                    sessions.delete(targetId);
                    if (session.messageId) {
                        try {
                            const msg = await interaction.channel.messages.fetch(session.messageId);
                            if (msg) await msg.delete();
                        } catch(e) {}
                    }
                    return interaction.update({ content: `✅ Ponto ATIVO **#${targetId}** foi anulado.`, embeds: [], components: [] });
                }

                // CASO 2: Anular ponto FECHADO (Histórico)
                let found = false;
                for (const [userId, stats] of userStats.entries()) {
                    if (!stats.history) continue;
                    const index = stats.history.findIndex(h => h.id === targetId);
                    
                    if (index !== -1) {
                        const entry = stats.history[index];
                        
                        // Desconta as horas
                        stats.totalMs = Math.max(0, stats.totalMs - entry.duration);
                        stats.weeklyMs = Math.max(0, stats.weeklyMs - entry.duration);
                        
                        // Só desconta do dia se o ponto for de hoje
                        const isToday = new Date(entry.startTime).toLocaleDateString('pt-BR') === new Date().toLocaleDateString('pt-BR');
                        if (isToday) {
                            stats.dailyMs = Math.max(0, stats.dailyMs - entry.duration);
                        }

                        // Remove do histórico
                        stats.history.splice(index, 1);
                        userStats.set(userId, stats);
                        
                        found = true;
                        await interaction.update({ content: `✅ Ponto FECHADO **#${targetId}** (Tempo: ${formatMs(entry.duration)}) removido e horas descontadas.`, embeds: [], components: [] });
                        break;
                    }
                }

                if (!found) {
                    await interaction.update({ content: `⚠️ Registro **#${targetId}** não encontrado em nenhum lugar.`, embeds: [], components: [] });
                }
            }
        }

        // 3. BOTÕES (Start, Pause, Stop)
        if (interaction.isButton()) {
            const [action, id] = interaction.customId.split('_');
            const user = interaction.user;
            const now = Date.now();
            const timeStr = getBrasiliaTime();
            
            let session = sessions.get(id);
            
            // Auto-recovery
            if (!session && action === 'start') {
                session = { 
                    userId: user.id, username: user.username, logs: [], pauses: [], status: 'OFF', startTime: 0, 
                    messageId: interaction.message.id 
                };
                sessions.set(id, session);
            }
            if (!session) return interaction.reply({ content: '⚠️ Sessão expirada.', ephemeral: true });

            if (user.id !== session.userId && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '⛔ Acesso Negado.', ephemeral: true });
            }

            if (action === 'start') {
                session.startTime = now;
                session.status = '🟢 EM SERVIÇO';
                session.logs.push(`➡️ Entrada: ${timeStr}`);
                session.username = user.username;
            } 
            else if (action === 'pause') {
                session.status = '🟡 PAUSA';
                session.pauses.push({ start: now });
                session.logs.push(`⏸️ Pausa: ${timeStr}`);
            }
            else if (action === 'resume') {
                session.status = '🟢 EM SERVIÇO';
                const lastPause = session.pauses[session.pauses.length - 1];
                if (lastPause) lastPause.end = now;
                session.logs.push(`▶️ Retorno: ${timeStr}`);
            }
            else if (action === 'stop') {
                session.status = '🔴 FINALIZADO';
                session.logs.push(`⏹️ Saída: ${timeStr}`);
                
                let total = now - session.startTime;
                let pauseTime = session.pauses.reduce((acc, p) => acc + ((p.end || now) - p.start), 0);
                let finalTime = Math.max(0, total - pauseTime);

                const stats = userStats.get(session.userId) || { username: session.username, totalMs: 0, weeklyMs: 0, dailyMs: 0, history: [] };
                if (!stats.history) stats.history = []; // Garante array

                stats.totalMs += finalTime;
                stats.weeklyMs += finalTime;
                stats.dailyMs += finalTime;
                stats.username = session.username;
                
                // Salva no histórico
                stats.history.push({
                    id: id,
                    startTime: session.startTime,
                    endTime: now,
                    duration: finalTime,
                    status: 'FINALIZADO'
                });
                // Mantém apenas os últimos 50 registros para não pesar a memória
                if (stats.history.length > 50) stats.history.shift();

                userStats.set(session.userId, stats);
                sessions.delete(id);
            }

            if (action !== 'stop') sessions.set(id, session);

            const embed = new EmbedBuilder()
                .setTitle('🛡️ CONTROLE DE PONTO')
                .setColor(session.status.includes('PAUSA') ? '#FEE75C' : (session.status.includes('FINAL') ? '#DA373C' : '#248046'))
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: 'Oficial', value: `**${session.username}**`, inline: true },
                    { name: 'Protocolo', value: `#${id}`, inline: true },
                    { name: 'Status', value: '\`' + session.status + '\`', inline: false },
                    { name: 'Histórico', value: session.logs.length ? session.logs.join('\n') : '...', inline: false }
                )
                .setFooter({ text: 'Nickyville Management • by Turzim' })
                .setTimestamp();

            const row = new ActionRowBuilder();
            if (action !== 'stop') {
                if (session.status.includes('PAUSA')) {
                     row.addComponents(new ButtonBuilder().setCustomId(`resume_${id}`).setLabel('Retornar').setStyle(ButtonStyle.Success).setEmoji('▶️'));
                } else {
                     row.addComponents(new ButtonBuilder().setCustomId(`pause_${id}`).setLabel('Pausar').setStyle(ButtonStyle.Secondary).setEmoji('⏸️'));
                }
                row.addComponents(new ButtonBuilder().setCustomId(`stop_${id}`).setLabel('Finalizar').setStyle(ButtonStyle.Danger).setEmoji('⏹️'));
            }

            await interaction.update({ embeds: [embed], components: action === 'stop' ? [] : [row] });
        }

    } catch (error) {
        console.error('Erro:', error);
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erro interno.', ephemeral: true }).catch(()=>{});
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content.toLowerCase().startsWith(PREFIX + 'debug')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        return message.reply(`🛠️ **DEBUG**\nSessões Ativas: ${sessions.size}\nUsuários com Stats: ${userStats.size}`);
    }

    if (message.mentions.users.has(client.user.id)) {
        if (!API_KEY) return message.reply("❌ Falta API Key.");
        const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim();
        if (!prompt) return message.reply("❓ Olá!");
        
        await message.channel.sendTyping();
        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: { systemInstruction: "Você é a IA do Turzim." }
            });
            message.reply(response.text || "...");
        } catch (e) { message.reply("❌ Erro IA."); }
    }
});

client.login(TOKEN);
