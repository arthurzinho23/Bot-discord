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
// Se o bot reiniciar, isso limpa. O fix abaixo ajuda a recuperar no Start.
const sessions = new Map(); 
const userStats = new Map();

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
        description: '[ADMIN] Gerenciar pontos ativos de um usuário',
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [{ name: 'usuario', type: 6, description: 'Selecione o usuário para verificar', required: true }]
    },
    {
        name: 'ia',
        description: 'Tire dúvidas com a IA do Turzim',
        options: [{ name: 'pergunta', type: 3, description: 'Sua dúvida ou solicitação', required: true }]
    }
];

client.once('ready', async () => {
    console.log(`✅ Bot logado como ${client.user.tag}`);
    // Limpa comandos antigos para evitar duplicação visual no cliente
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Comandos registrados com sucesso!');
    } catch (e) { console.error(e); }
});

// --- EVENTOS E INTERAÇÕES ---
client.on('interactionCreate', async interaction => {
    // Evita processar interações de outros bots (segurança extra)
    if (interaction.user.bot) return;

    try {
        checkDailyReset();

        // 1. COMANDOS DE CHAT (/ponto, /ranking...)
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
                
                // FetchReply é importante para pegar o ID da mensagem para futura anulação
                const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
                
                // Salva na memória
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
                const userSessions = [];

                // Filtra sessões do usuário alvo
                for (const [key, session] of sessions.entries()) {
                    if (session.userId === targetUser.id) {
                        userSessions.push({ id: key, ...session });
                    }
                }

                if (userSessions.length === 0) {
                    return interaction.reply({ content: `✅ O usuário **${targetUser.username}** não possui sessões ativas no momento.`, ephemeral: true });
                }

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('anular_select')
                    .setPlaceholder('Selecione o ponto para ANULAR')
                    .addOptions(
                        userSessions.map(s => {
                            const duration = s.startTime > 0 ? Date.now() - s.startTime : 0;
                            return new StringSelectMenuOptionBuilder()
                                .setLabel(`#${s.id} - ${s.status}`)
                                .setDescription(`Início: ${new Date(s.startTime).toLocaleTimeString('pt-BR')} | Tempo: ${formatMs(duration)}`)
                                .setValue(s.id)
                                .setEmoji('🗑️');
                        })
                    );

                const embed = new EmbedBuilder()
                    .setTitle(`🔧 Gerenciamento: ${targetUser.username}`)
                    .setDescription(`Foram encontradas **${userSessions.length}** sessões ativas.
Selecione abaixo qual deseja forçar o fechamento (anular).`)
                    .setColor('#DA373C');

                await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
            }

            if (commandName === 'ia') {
                await interaction.deferReply();
                const question = options.getString('pergunta');
                
                if (!API_KEY) return interaction.editReply('❌ IA não configurada (falta GEMINI_API_KEY).');

                try {
                    const ai = new GoogleGenAI({ apiKey: API_KEY });
                    const response = await ai.models.generateContent({
                        model: 'gemini-3-flash-preview',
                        contents: question,
                        config: {
                            systemInstruction: "Você é uma IA assistente do servidor Nickyville. Seu criador é o Turzim. Responda de forma curta e prestativa."
                        }
                    });

                    const answer = response.text || "Sem resposta.";
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🤖 IA Nickyville')
                        .setDescription(answer.length > 4000 ? answer.substring(0, 4000) + '...' : answer)
                        .setColor('#00A8FC')
                        .setFooter({ text: 'Criado por Turzim' });
                    
                    await interaction.editReply({ embeds: [embed] });
                } catch (err) {
                    console.error(err);
                    await interaction.editReply('❌ Erro na IA.');
                }
            }
            
            if (commandName === 'help') {
                const embed = new EmbedBuilder()
                    .setTitle('📘 Ajuda - Nickyville Ponto')
                    .setColor('#00A8FC')
                    .setDescription('Sistema desenvolvido por **Turzim**.')
                    .addFields(
                        { name: '/ponto', value: 'Abre ponto.', inline: true },
                        { name: '/ranking', value: 'Vê ranking.', inline: true },
                        { name: '/ia', value: 'Fala com a IA.', inline: true },
                        { name: '/anular [@Usuario]', value: 'Gerencia sessões ativas de um usuário.', inline: true }
                    );
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }

        // 2. INTERAÇÃO DE MENUS (Select Menu)
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

                if (sorted.length === 0) {
                    embed.setDescription("⚠️ Ninguém bateu ponto neste período ainda.");
                } else {
                    const fields = sorted.map((s, i) => {
                        const val = filter === 'daily' ? s.dailyMs : (filter === 'weekly' ? s.weeklyMs : s.totalMs);
                        return {
                            name: `#${i+1} ${s.username}`,
                            value: `⏱️ **${formatMs(val)}**\n${generateProgressBar(val, maxVal)}`,
                            inline: false
                        };
                    });
                    embed.addFields(fields);
                }
                await interaction.update({ embeds: [embed] });
            }

            if (interaction.customId === 'anular_select') {
                const targetId = interaction.values[0];
                const session = sessions.get(targetId);

                if (session) {
                    sessions.delete(targetId);
                    if (session.messageId) {
                        try {
                            const msg = await interaction.channel.messages.fetch(session.messageId);
                            if (msg) await msg.delete();
                        } catch(e) { /* ignore */ }
                    }
                    await interaction.update({ content: `✅ Ponto anulado com sucesso.`, embeds: [], components: [] });
                } else {
                    await interaction.update({ content: `⚠️ Sessão não encontrada.`, embeds: [], components: [] });
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
            
            // CORREÇÃO CRÍTICA: Se a sessão sumiu da memória (bot reiniciou), mas o usuário clicou em INICIAR,
            // nós recriamos a sessão para não travar o usuário.
            if (!session) {
                if (action === 'start') {
                    // Recuperação de Sessão
                    session = { 
                        userId: user.id, 
                        username: user.username, 
                        logs: [], 
                        pauses: [], 
                        status: 'OFF', // Vai mudar para ON logo abaixo
                        startTime: 0,
                        messageId: interaction.message.id // Tenta pegar o ID da mensagem atual
                    };
                    sessions.set(id, session);
                    // O código continua abaixo para processar o 'start' normalmente
                } else {
                    // Se for Pause/Stop e não tem sessão, aí não dá pra salvar porque não temos o tempo de início.
                    return interaction.reply({ content: '⚠️ Sessão expirada ou não encontrada na memória (Bot reiniciou?). Por favor, use `/ponto` novamente.', ephemeral: true });
                }
            }

            // Permissão de Uso
            const isOwner = user.id === session.userId;
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isOwner && !isAdmin) {
                return interaction.reply({ 
                    content: `⛔ **Acesso Negado**\nEste ponto pertence a <@${session.userId}>.`, 
                    ephemeral: true 
                });
            }

            // Lógica dos Botões
            if (action === 'start') {
                session.startTime = now;
                session.status = '🟢 EM SERVIÇO';
                session.logs.push(`➡️ Entrada: ${timeStr}`);
                // Atualiza o nome caso tenha mudado
                if (isOwner) session.username = user.username;
            } 
            else if (action === 'pause') {
                session.status = '🟡 PAUSA';
                session.pauses.push({ start: now });
                const actor = isOwner ? '' : ` (por ${user.username})`;
                session.logs.push(`⏸️ Pausa: ${timeStr}${actor}`);
            }
            else if (action === 'resume') {
                session.status = '🟢 EM SERVIÇO';
                const lastPause = session.pauses[session.pauses.length - 1];
                if (lastPause) lastPause.end = now;
                const actor = isOwner ? '' : ` (por ${user.username})`;
                session.logs.push(`▶️ Retorno: ${timeStr}${actor}`);
            }
            else if (action === 'stop') {
                session.status = '🔴 FINALIZADO';
                const actor = isOwner ? '' : ` (Fechado por ${user.username})`;
                session.logs.push(`⏹️ Saída: ${timeStr}${actor}`);
                
                let total = now - session.startTime;
                let pauseTime = session.pauses.reduce((acc, p) => acc + ((p.end || now) - p.start), 0);
                let finalTime = total - pauseTime;
                if (finalTime < 0) finalTime = 0;

                // Salva estatísticas
                const targetId = session.userId;
                const stats = userStats.get(targetId) || { username: session.username, totalMs: 0, weeklyMs: 0, dailyMs: 0 };
                stats.totalMs += finalTime;
                stats.weeklyMs += finalTime;
                stats.dailyMs += finalTime;
                stats.username = session.username; // Atualiza nome
                userStats.set(targetId, stats);

                sessions.delete(id); // Limpa da memória de ativos
            }

            // Salva estado atualizado se não finalizou
            if (action !== 'stop') sessions.set(id, session);

            // Monta Embed Atualizada
            const embed = new EmbedBuilder()
                .setTitle('🛡️ CONTROLE DE PONTO')
                .setColor(session.status.includes('PAUSA') ? '#FEE75C' : (session.status.includes('FINAL') ? '#DA373C' : '#248046'))
                .setThumbnail(isOwner ? user.displayAvatarURL() : undefined)
                .addFields(
                    { name: 'Oficial', value: `**${session.username}**`, inline: true },
                    { name: 'Protocolo', value: `#${id}`, inline: true },
                    { name: 'Status', value: '\`\`\`' + session.status + '\`\`\`', inline: false },
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
                row.addComponents(new ButtonBuilder().setCustomId(`stop_${id}`).setLabel('Finalizar Plantão').setStyle(ButtonStyle.Danger).setEmoji('⏹️'));
            }

            await interaction.update({ embeds: [embed], components: action === 'stop' ? [] : [row] });
        }

    } catch (error) {
        console.error('Erro na interação:', error);
        // Tenta responder se ainda não respondeu para não deixar o bot "pensando"
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({ content: '❌ Erro interno processando comando.', ephemeral: true });
            } catch(e) {}
        }
    }
});

// --- MENÇÃO AO BOT (IA) E DEBUG ---
client.on('messageCreate', async message => {
    // IGNORA MENSAGENS DE BOTS (CRÍTICO PARA EVITAR DUPLICAÇÃO)
    if (message.author.bot) return;

    // 1. Comando Debug
    if (message.content.toLowerCase().startsWith(PREFIX + 'debug')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        return message.reply(`🛠️ **DEBUG**\nSessões Ativas: ${sessions.size}\nUsuários no Ranking: ${userStats.size}\nUptime: ${Math.floor(process.uptime())}s`);
    }

    // 2. IA ao Mencionar
    if (message.mentions.users.has(client.user.id)) {
        if (!API_KEY) return message.reply("❌ IA não configurada (falta API Key).");
        
        const prompt = message.content.replace(/<@!?[0-9]+>/g, '').trim();
        if (!prompt) return message.reply("❓ Olá! Como posso ajudar você hoje?");

        await message.channel.sendTyping();

        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                    systemInstruction: "Você é a IA oficial do servidor Nickyville, criada pelo genial Turzim. Responda de forma curta, direta e prestativa. Se perguntarem quem te fez, diga com orgulho que foi o Turzim."
                }
            });
            
            const replyText = response.text || "Estou sem palavras.";
            if (replyText.length > 2000) {
                message.reply(replyText.substring(0, 1997) + '...');
            } else {
                message.reply(replyText);
            }
        } catch (error) {
            console.error(error);
            message.reply("❌ Tive um problema ao processar seu pensamento.");
        }
    }
});

client.login(TOKEN);
