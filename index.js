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
import './waker.js'; // 🔥 OBRIGATÓRIO: Mantém o bot acordado

// --- CONFIGURAÇÕES ---
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
const PREFIX = '!';

// --- ARMAZENAMENTO (MEMÓRIA) ---
// Estrutura: id -> { userId, startTime, pauses: [], logs: [] }
const sessions = new Map(); 

// Estrutura: userId -> { username, totalMs, weeklyMs, dailyMs }
const userStats = new Map();

// Mock inicial para testes
userStats.set('mock1', { username: 'Oficial.Silva', totalMs: 36000000, weeklyMs: 18000000, dailyMs: 3600000 });
userStats.set('mock2', { username: 'Cadete.Souza', totalMs: 12000000, weeklyMs: 6000000, dailyMs: 0 });

// --- SERVIDOR KEEP-ALIVE ---
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`SISTEMA OPERACIONAL ONLINE\nUptime: ${Math.floor(process.uptime())}s`);
});
server.listen(PORT, () => console.log(`🌐 Sistema rodando na porta ${PORT}`));

// --- UTILITÁRIOS ---
const getBrasiliaTime = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: '2-digit', minute: '2-digit', second: '2-digit' });
const getDateStr = () => new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

const formatMs = (ms) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}h ${m}m ${s}s`;
};

const generateProgressBar = (current, max = 36000000) => { // Base 10h
    const p = Math.min(Math.floor((current / max) * 10), 10);
    return '🟦'.repeat(p) + '⬜'.repeat(10 - p);
};
const generateID = () => Math.random().toString(36).substring(2, 7).toUpperCase();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- COMANDOS SLASH ---
const commands = [
    { name: 'ponto', description: 'Inicia o sistema de registro de ponto eletrônico' },
    { name: 'ranking', description: 'Exibe o quadro de horas (Diário/Semanal/Geral)' },
    { name: 'help', description: 'Visualiza os comandos disponíveis' },
    { 
        name: 'anular', 
        description: '[ADMIN] Cancela e invalida um registro de ponto',
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [{ name: 'id', type: 3, description: 'Protocolo do ponto (#XXXXX)', required: true }]
    }
];

client.once('ready', async () => {
    console.log(`✅ Logado como ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Slash Commands registrados com sucesso.');
    } catch (e) { console.error(e); }
});

// --- EVENTOS DE MENSAGEM (DEBUG & IA) ---
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // !debug (Apenas Admins)
    if (message.content.toLowerCase() === PREFIX + 'debug') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('⛔ **Acesso Negado:** Este comando é restrito à administração.');
        }
        const embed = new EmbedBuilder()
            .setTitle('⚙️ Painel de Controle')
            .setColor('#2B2D31')
            .addFields(
                { name: '📡 Latência', value: `${client.ws.ping}ms`, inline: true },
                { name: '⏱️ Uptime', value: `${Math.floor(process.uptime())}s`, inline: true },
                { name: '💾 Memória', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
                { name: '👥 Sessões Ativas', value: `${sessions.size}`, inline: true }
            )
            .setTimestamp();
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
                config: { systemInstruction: "Você é uma IA assistente corporativa do departamento de RH de Nickyville. Seja formal, educada e eficiente." }
            });
            message.reply(response.text);
        } catch (e) { message.reply('⚠️ Sistema de IA indisponível no momento.'); }
    }
});

// --- INTERAÇÕES ---
client.on('interactionCreate', async interaction => {
    
    // 1. COMANDOS DE CHAT
    if (interaction.isChatInputCommand()) {
        const { commandName, options, user } = interaction;

        // /PONTO
        if (commandName === 'ponto') {
            const sid = generateID();
            
            const embed = new EmbedBuilder()
                .setTitle('🛡️ SISTEMA DE PONTO ELETRÔNICO')
                .setDescription(`Seja bem-vindo, **${user.username}**.
Utilize os controles abaixo para gerenciar sua jornada de trabalho.`)
                .setColor('#5865F2')
                .addFields(
                    { name: '👤 Colaborador', value: `<@${user.id}>`, inline: true },
                    { name: '📅 Data', value: getDateStr(), inline: true },
                    { name: '🆔 Protocolo', value: `#${sid}`, inline: true },
                    { name: '📍 Status Atual', value: '`🔴 AGUARDANDO INÍCIO`', inline: false }
                )
                .setThumbnail(user.displayAvatarURL())
                .setFooter({ text: 'Nickyville Department • Sistema Seguro' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`start_${sid}`).setLabel('INICIAR TURNO').setStyle(ButtonStyle.Success).setEmoji('🛡️')
            );
            
            await interaction.reply({ embeds: [embed], components: [row] });
        }

        // /RANKING
        if (commandName === 'ranking') {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('ranking_filter')
                .setPlaceholder('Selecione o período de visualização')
                .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel('Ranking Geral (Total)').setValue('total').setEmoji('🏆'),
                    new StringSelectMenuOptionBuilder().setLabel('Ranking Semanal').setValue('weekly').setEmoji('📅'),
                    new StringSelectMenuOptionBuilder().setLabel('Ranking Diário').setValue('daily').setEmoji('☀️'),
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setTitle('📊 Quadro de Produtividade')
                .setDescription('Selecione uma categoria abaixo para visualizar os dados.')
                .setColor('#2B2D31');

            await interaction.reply({ embeds: [embed], components: [row] });
        }

        // /ANULAR (Admin)
        if (commandName === 'anular') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '⛔ Você não tem permissão para anular pontos.', ephemeral: true });
            }
            const id = options.getString('id').replace('#', '').toUpperCase();
            if (sessions.delete(id)) {
                interaction.reply({ content: `✅ O registro **#${id}** foi anulado e removido do sistema.`, ephemeral: true });
            } else {
                interaction.reply({ content: `⚠️ Registro **#${id}** não encontrado ou já finalizado.`, ephemeral: true });
            }
        }

        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('📘 Central de Ajuda')
                .setColor('#5865F2')
                .addFields(
                    { name: '/ponto', value: 'Abre o painel de registro.', inline: true },
                    { name: '/ranking', value: 'Consulta horas trabalhadas.', inline: true },
                    { name: '/anular', value: '(Admin) Cancela um ponto.', inline: true }
                );
            interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

    // 2. MENU DE SELEÇÃO (RANKING)
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ranking_filter') {
            const filter = interaction.values[0]; // 'total', 'weekly', 'daily'
            
            // Ordena os usuários com base no filtro
            const sorted = Array.from(userStats.entries())
                .map(([id, stats]) => ({ ...stats, id }))
                .sort((a, b) => {
                    const valA = filter === 'daily' ? a.dailyMs : (filter === 'weekly' ? a.weeklyMs : a.totalMs);
                    const valB = filter === 'daily' ? b.dailyMs : (filter === 'weekly' ? b.weeklyMs : b.totalMs);
                    return (valB || 0) - (valA || 0);
                })
                .slice(0, 10);

            const titles = { total: '🏆 Ranking Geral', weekly: '📅 Ranking Semanal', daily: '☀️ Ranking Diário' };
            
            const embed = new EmbedBuilder()
                .setTitle(titles[filter])
                .setColor('#FEE75C')
                .setTimestamp();

            if (sorted.length === 0 || sorted.every(s => (filter === 'daily' ? s.dailyMs : (filter === 'weekly' ? s.weeklyMs : s.totalMs)) === 0)) {
                embed.setDescription("⚠️ Nenhum dado registrado para este período.");
            } else {
                const fields = sorted.map((s, i) => {
                    const val = filter === 'daily' ? s.dailyMs : (filter === 'weekly' ? s.weeklyMs : s.totalMs);
                    if (!val) return null;
                    return {
                        name: `#${i+1} ${s.username}`,
                        value: `⏱️ **${formatMs(val)}**
${generateProgressBar(val, filter === 'total' ? 360000000 : 36000000)}`, // Escala visual ajustada
                        inline: false
                    };
                }).filter(Boolean);
                
                if (fields.length > 0) embed.addFields(fields);
                else embed.setDescription("⚠️ Nenhum dado registrado.");
            }

            await interaction.update({ embeds: [embed] }); // Mantém o menu
        }
    }

    // 3. BOTÕES (BATE-PONTO)
    if (interaction.isButton()) {
        const [action, id] = interaction.customId.split('_');
        const user = interaction.user;
        
        let session = sessions.get(id) || { 
            userId: user.id, 
            username: user.username, 
            logs: [], 
            pauses: [], 
            status: 'OFF', 
            startTime: 0,
            avatar: user.displayAvatarURL()
        };
        
        const now = Date.now();
        const timeStr = getBrasiliaTime();

        // Lógica de Estado
        if (action === 'start') {
            session.startTime = now;
            session.status = '🟢 EM SERVIÇO';
            session.logs.push(`➡️ Entrada: ${timeStr}`);
        } 
        else if (action === 'pause') {
            session.status = '🟡 PAUSA (Refeição/Descanso)';
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
            
            // Cálculos
            let total = now - session.startTime;
            let pauseTime = session.pauses.reduce((acc, p) => acc + ((p.end || now) - p.start), 0);
            let finalTime = total - pauseTime;

            // Atualiza Banco de Dados (Memória)
            const stats = userStats.get(user.id) || { username: user.username, totalMs: 0, weeklyMs: 0, dailyMs: 0 };
            stats.totalMs += finalTime;
            stats.weeklyMs += finalTime;
            stats.dailyMs += finalTime;
            stats.username = user.username; // Atualiza nome caso mude
            userStats.set(user.id, stats);
            
            sessions.delete(id);
        }

        if (action !== 'stop') sessions.set(id, session);

        // Constrói Embed Atualizado
        const embed = new EmbedBuilder()
            .setTitle('🛡️ CONTROLE DE PONTO')
            .setColor(session.status.includes('PAUSA') ? '#FEE75C' : (session.status.includes('FINAL') ? '#DA373C' : '#248046'))
            .setThumbnail(session.avatar)
            .addFields(
                { name: '👤 Oficial', value: `**${user.username}**`, inline: true },
                { name: '🆔 Protocolo', value: `#${id}`, inline: true },
                { name: '📡 Status', value: ```${session.status}```, inline: false },
                { name: '📜 Histórico do Turno', value: session.logs.length ? session.logs.join('\n') : 'Sem registros.', inline: false }
            )
            .setFooter({ text: 'Nickyville Department • Gestão de Eficiência' })
            .setTimestamp();

        // Constrói Botões
        const row = new ActionRowBuilder();
        if (action !== 'stop') {
            if (session.status.includes('PAUSA')) {
                 row.addComponents(new ButtonBuilder().setCustomId(`resume_${id}`).setLabel('Retornar ao Serviço').setStyle(ButtonStyle.Success).setEmoji('▶️'));
            } else {
                 row.addComponents(new ButtonBuilder().setCustomId(`pause_${id}`).setLabel('Pausar Turno').setStyle(ButtonStyle.Secondary).setEmoji('⏸️'));
            }
            row.addComponents(new ButtonBuilder().setCustomId(`stop_${id}`).setLabel('Finalizar Plantão').setStyle(ButtonStyle.Danger).setEmoji('⏹️'));
        }

        await interaction.update({ embeds: [embed], components: action === 'stop' ? [] : [row] });
    }
});

client.login(TOKEN);