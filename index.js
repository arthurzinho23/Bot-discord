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
import http from 'http';
import 'dotenv/config';
import './waker.js'; // 🔥 Mantém o bot acordado

// --- CONFIGURAÇÕES ---
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = '!';

// --- ARMAZENAMENTO (MEMÓRIA) ---
const sessions = new Map(); // id -> { userId, username, startTime, pauses: [], logs: [] }
const userStats = new Map(); // userId -> { username, totalMs, weeklyMs, dailyMs }

let lastDayCheck = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

// --- SERVIDOR KEEP-ALIVE ---
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`SISTEMA NICKYVILLE ONLINE\nUptime: ${Math.floor(process.uptime())}s\nSessões Ativas: ${sessions.size}`);
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
        description: '[ADMIN] Cancela um ponto específico',
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [{ name: 'id', type: 3, description: 'ID do ponto (#XXXXX)', required: true }]
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
                    .setFooter({ text: 'Nickyville Management' })
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`start_${sid}`).setLabel('INICIAR TURNO').setStyle(ButtonStyle.Success).setEmoji('🛡️')
                );
                
                // Registra sessão inicial vinculada ao ID do usuário que chamou o comando
                sessions.set(sid, { 
                    userId: user.id, 
                    username: user.username, 
                    logs: [], 
                    pauses: [], 
                    status: 'OFF', 
                    startTime: 0 
                });

                await interaction.reply({ embeds: [embed], components: [row] });
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
                const id = options.getString('id').replace('#', '').toUpperCase();
                if (sessions.delete(id)) {
                    interaction.reply({ content: `✅ Ponto **#${id}** anulado.`, ephemeral: true });
                } else {
                    interaction.reply({ content: `⚠️ Ponto **#${id}** não encontrado.`, ephemeral: true });
                }
            }
            
            if (commandName === 'help') {
                const embed = new EmbedBuilder()
                    .setTitle('📘 Ajuda - Nickyville Ponto')
                    .setColor('#00A8FC')
                    .addFields(
                        { name: '/ponto', value: 'Abre seu cartão de ponto pessoal.', inline: true },
                        { name: '/ranking', value: 'Vê quem trabalhou mais.', inline: true },
                        { name: '/anular', value: '(Admin) Cancela um ponto bugado.', inline: true },
                        { name: '!debug', value: '(Admin) Informações técnicas.', inline: true }
                    )
                    .setFooter({ text: 'Sistema Operacional v7.1' });
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }

        // 2. RANKING SELECT MENU
        if (interaction.isStringSelectMenu() && interaction.customId === 'ranking_filter') {
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

        // 3. BOTÕES (LÓGICA PRINCIPAL)
        if (interaction.isButton()) {
            const [action, id] = interaction.customId.split('_');
            const user = interaction.user;
            const now = Date.now();
            const timeStr = getBrasiliaTime();
            
            let session = sessions.get(id);
            
            // Tratamento de sessão inexistente (bot reiniciou ou id errado)
            if (!session) {
                if (action === 'start') {
                    // Recria sessão para o usuário atual se for Start
                    session = { 
                        userId: user.id, 
                        username: user.username, 
                        logs: [], 
                        pauses: [], 
                        status: 'OFF', 
                        startTime: 0 
                    };
                } else {
                    return interaction.reply({ content: '⚠️ Sessão expirada. Use `/ponto` novamente.', ephemeral: true });
                }
            }

            // --- SEGURANÇA: VERIFICAÇÃO DE DONO ---
            const isOwner = user.id === session.userId;
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            // Se não for o dono E não for admin, bloqueia
            if (!isOwner && !isAdmin) {
                return interaction.reply({ 
                    content: `⛔ **Acesso Negado**\nEste ponto pertence a <@${session.userId}>.\nVocê não pode interagir com o ponto de outro colega.`, 
                    ephemeral: true 
                });
            }

            // Lógica de Estado
            if (action === 'start') {
                session.startTime = now;
                session.status = '🟢 EM SERVIÇO';
                session.logs.push(`➡️ Entrada: ${timeStr}`);
                // Se o admin iniciar pelo usuário (raro), mantém o username do dono original
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
                
                // CÁLCULO
                let total = now - session.startTime;
                let pauseTime = session.pauses.reduce((acc, p) => acc + ((p.end || now) - p.start), 0);
                let finalTime = total - pauseTime;
                if (finalTime < 0) finalTime = 0;

                // --- CORREÇÃO CRÍTICA DE CRÉDITOS ---
                // O tempo deve ir para o DONO da sessão (session.userId), não para quem clicou (user.id)
                const targetId = session.userId;
                const targetName = session.username;

                const stats = userStats.get(targetId) || { username: targetName, totalMs: 0, weeklyMs: 0, dailyMs: 0 };
                stats.totalMs += finalTime;
                stats.weeklyMs += finalTime;
                stats.dailyMs += finalTime;
                // Atualiza nome apenas se o próprio dono estiver operando para garantir nome atualizado
                if (isOwner) stats.username = user.username; 
                
                userStats.set(targetId, stats);
                
                sessions.delete(id); // Limpa da memória ativa
            }

            if (action !== 'stop') sessions.set(id, session);

            // Atualiza Embed
            const embed = new EmbedBuilder()
                .setTitle('🛡️ CONTROLE DE PONTO')
                .setColor(session.status.includes('PAUSA') ? '#FEE75C' : (session.status.includes('FINAL') ? '#DA373C' : '#248046'))
                .setThumbnail(isOwner ? user.displayAvatarURL() : undefined) // Mostra avatar de quem clicou se for dono, ou mantém anterior
                .addFields(
                    { name: 'Oficial', value: `**${session.username}**`, inline: true }, // Exibe nome do DONO
                    { name: 'Protocolo', value: `#${id}`, inline: true },
                    { name: 'Status', value: '\`\`\`' + session.status + '\`\`\`', inline: false },
                    { name: 'Histórico', value: session.logs.length ? session.logs.join('\n') : '...', inline: false }
                )
                .setFooter({ text: 'Nickyville Management' })
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
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Erro interno.', ephemeral: true }).catch(() => {});
        }
    }
});

// --- COMANDO DE DEBUG (ADMIN) ---
client.on('messageCreate', async message => {
    if (message.content.toLowerCase() === PREFIX + 'debug') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        
        message.reply(`🛠️ **DEBUG**\nSessões Ativas: ${sessions.size}\nUsuários no Ranking: ${userStats.size}\nUptime: ${Math.floor(process.uptime())}s`);
    }
});

client.login(TOKEN);