const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const axios = require('axios');
const startWaker = require('./waker');
require('dotenv').config();

console.log('[BOOT] Iniciando sistema...');

// --- DIAGNÓSTICO DE AMBIENTE ---
// --- DIAGNÓSTICO E LIMPEZA DE VARIÁVEIS ---
console.log('[DEBUG] Variáveis de ambiente carregadas:', Object.keys(process.env).join(', '));

let TOKEN = process.env.DISCORD_TOKEN;
let CLIENT_ID = process.env.CLIENT_ID;

// Função de limpeza agressiva
function cleanEnvVar(value, name) {
    if (!value) return null;
    
    let cleaned = value;
    
    // Remove aspas extras (comuns ao copiar de .env mal formatado)
    cleaned = cleaned.replace(/^["']|["']$/g, '');
    
    // Remove espaços em branco nas pontas
    cleaned = cleaned.trim();
    
    // Remove quebras de linha (causa principal do erro "Invalid Authorization header")
    if (cleaned.match(/[\r\n]/)) {
        console.log(`[CORREÇÃO] Removendo quebras de linha detectadas em ${name}`);
        cleaned = cleaned.replace(/[\r\n]/g, '');
    }

    return cleaned;
}

TOKEN = cleanEnvVar(TOKEN, 'DISCORD_TOKEN');
CLIENT_ID = cleanEnvVar(CLIENT_ID, 'CLIENT_ID');
const GUILD_ID = process.env.GUILD_ID;

if (TOKEN) {
    console.log(`[DEBUG] Token processado (Comprimento final: ${TOKEN.length})`);
    
    // Verificações de sanidade
    if (TOKEN.length > 100) {
        console.error('⚠️ [ALERTA] O Token tem ${TOKEN.length} caracteres. Isso é MUITO LONGO (normal é ~72).');
        console.error('👉 Verifique se você não colou o token duas vezes ou copiou a chave errada.');
    }
    if (TOKEN.startsWith('Bot ')) {
        console.log('ℹ️ [AUTO-FIX] Removendo prefixo "Bot " do token...');
        TOKEN = TOKEN.slice(4).trim();
    }

    // Validação de Correspondência ID vs Token
    try {
        const tokenParts = TOKEN.split('.');
        if (tokenParts.length > 1) {
            const idFromToken = Buffer.from(tokenParts[0], 'base64').toString('utf-8');
            if (idFromToken !== CLIENT_ID) {
                console.error('\n❌ [ERRO CRÍTICO] O CLIENT_ID não corresponde ao TOKEN fornecido!');
                console.error(`   CLIENT_ID configurado: ${CLIENT_ID}`);
                console.error(`   ID extraído do Token:  ${idFromToken}`);
                console.error('👉 Solução: Atualize a variável CLIENT_ID no Render com o "Application ID" correto do Portal do Desenvolvedor.\n');
            } else {
                console.log('✅ [CHECK] CLIENT_ID corresponde ao Token.');
            }
        }
    } catch (e) {
        console.error('[AVISO] Não foi possível validar a correspondência do token:', e.message);
    }
} else {
    console.error('❌ [ERRO FATAL] DISCORD_TOKEN não está definido!');
}

if (!CLIENT_ID) {
    console.error('❌ [ERRO FATAL] CLIENT_ID não está definido!');
}
const EXTERNAL_API_URL = 'https://fvmp-tau.vercel.app/';

// --- TRATAMENTO DE ERROS GLOBAIS ---
process.on('unhandledRejection', error => {
    console.error('[ERRO] Rejeição não tratada:', error);
});
process.on('uncaughtException', error => {
    console.error('[ERRO] Exceção não capturada:', error);
});

// --- CLIENTE DISCORD ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- DEBUGGING AVANÇADO (Essencial para diagnosticar falhas de conexão) ---
client.on('debug', info => {
    // Ignora heartbeats para não poluir o log, mas mostra tudo o resto
    if (!info.toLowerCase().includes('heartbeat')) {
        console.log(`[DISCORD DEBUG] ${info}`);
    }
});
client.on('warn', info => console.warn(`[DISCORD WARN] ${info}`));
client.on('error', error => console.error(`[DISCORD ERROR] ${error.message}`));
client.on('shardError', error => console.error(`[SHARD ERROR] ${error.message}`));
client.on('shardReady', id => console.log(`[SHARD READY] Shard ${id} está pronto!`));
client.on('shardDisconnect', (event, id) => console.log(`[SHARD DISCONNECT] Shard ${id} desconectou (Code: ${event.code})`));
client.on('shardReconnecting', id => console.log(`[SHARD RECONNECTING] Shard ${id} tentando reconectar...`));

// --- EXPRESS SERVER (Essencial para o Render não matar o processo) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('SISTEMA 911 ONLINE - Bot Operacional. Logs ativos.');
});

app.get('/status', (req, res) => {
    res.json({ 
        status: 'online', 
        uptime: process.uptime(),
        discord_status: client.isReady() ? 'CONNECTED' : 'DISCONNECTED'
    });
});

// Inicia o servidor WEB primeiro para garantir a porta
app.listen(PORT, () => {
    console.log(`[WEB] Servidor rodando na porta ${PORT}`);
    
    // Inicia o Waker
    const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
    startWaker(APP_URL);
    
    // SÓ DEPOIS tenta logar o bot
    console.log('[DISCORD] Tentando conectar ao Gateway...');
    
    // Timeout de segurança
    setTimeout(() => {
        if (!client.isReady()) {
            console.error('\n⏰ [TIMEOUT] O bot está demorando mais de 15s para conectar.');
            console.error('   Possíveis causas:');
            console.error('   1. Token inválido ou resetado (Gere um novo no Portal).');
            console.error('   2. Bloqueio de IP do Render (Espere 1h ou faça redeploy).');
            console.error('   3. Intents não salvos (Verifique se clicou em "Save Changes" no Portal).\n');
        }
    }, 15000);

    client.login(TOKEN).catch(err => {
        console.error('[ERRO] Falha ao logar no Discord:', err);
    });
});

// --- COMANDOS SLASH ---
const commands = [
    new SlashCommandBuilder()
        .setName('ponto')
        .setDescription('Abre o painel de controle de ponto'),
    new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('Exibe o ranking de horas')
        .addStringOption(option =>
            option.setName('periodo')
                .setDescription('Período do ranking')
                .setRequired(false)
                .addChoices(
                    { name: 'Total', value: 'total' },
                    { name: 'Semanal', value: 'semanal' },
                    { name: 'Mensal', value: 'mensal' }
                )),
    new SlashCommandBuilder()
        .setName('anular')
        .setDescription('Anula o ponto de um usuário (Admin)')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('Usuário para anular o ponto')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Mostra os comandos disponíveis'),
    new SlashCommandBuilder()
        .setName('status_conexao')
        .setDescription('Verifica a conexão com o site externo')
];

// --- REGISTRO DE COMANDOS ---
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('[COMANDOS] Iniciando registro de comandos (/).');
        if (GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
            console.log('[COMANDOS] Registrados na GUILD específica.');
        } else {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
            console.log('[COMANDOS] Registrados GLOBALMENTE (pode levar até 1h para aparecer).');
        }
    } catch (error) {
        console.error('[ERRO] Falha ao registrar comandos:', error);
    }
})();

// --- EVENTOS DO BOT ---
client.once('ready', () => {
    console.log(`[DISCORD] Bot ONLINE! Logado como ${client.user.tag}`);
    console.log(`[DISCORD] Estou em ${client.guilds.cache.size} servidores.`);
});

// Comando !debug
client.on('messageCreate', async message => {
    if (message.content === '!debug') {
        console.log(`[CMD] !debug usado por ${message.author.tag}`);
        
        // Tenta registrar comandos novamente
        let cmdStatus = '✅ Comandos (/) não atualizados';
        try {
            console.log('[DEBUG] Forçando atualização de comandos...');
            if (GUILD_ID) {
                await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
                cmdStatus = '✅ Comandos (/) atualizados na GUILD!';
            } else {
                await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
                cmdStatus = '✅ Comandos (/) atualizados GLOBALMENTE!';
            }
        } catch (error) {
            console.error('[ERRO DEBUG] Falha ao atualizar comandos:', error);
            cmdStatus = `❌ Falha ao atualizar comandos: ${error.message}`;
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Debug Status & Refresh')
            .setDescription(`✅ Bot Online\n🏓 Ping: ${client.ws.ping}ms\n🔗 API Externa: ${EXTERNAL_API_URL}\n🔄 ${cmdStatus}`);
        
        message.reply({ embeds: [embed] });
    }
});

// Manipulação de Interações
client.on('interactionCreate', async interaction => {
    // Log de interações para debug
    console.log(`[INTERAÇÃO] Tipo: ${interaction.type}, User: ${interaction.user.tag}`);

    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    // --- COMANDO /PONTO ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'ponto') {
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🛂 Controle de Ponto 911')
            .setDescription('Utilize os botões abaixo para gerenciar seu turno.')
            .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`iniciar_${interaction.user.id}`)
                    .setLabel('Iniciar Ponto')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('▶️'),
                new ButtonBuilder()
                    .setCustomId(`pausar_${interaction.user.id}`)
                    .setLabel('Pausar')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⏸️'),
                new ButtonBuilder()
                    .setCustomId(`finalizar_${interaction.user.id}`)
                    .setLabel('Finalizar')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⏹️')
            );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    // --- BOTÕES DO PONTO ---
    if (interaction.isButton() && !interaction.customId.startsWith('rank_')) {
        const [action, userId] = interaction.customId.split('_');

        if (interaction.user.id !== userId) {
            return interaction.reply({ content: '❌ Você não pode interagir com este painel.', ephemeral: true });
        }

        try {
            console.log(`[PONTO] Ação: ${action} por ${interaction.user.tag}`);
            // const payload = { ... };
            // await axios.post(`${EXTERNAL_API_URL}/api/ponto`, payload);
            
            let replyMsg = '';
            if (action === 'iniciar') replyMsg = '✅ **Ponto INICIADO** com sucesso!';
            if (action === 'pausar') replyMsg = '⏸️ **Ponto PAUSADO**.';
            if (action === 'finalizar') replyMsg = '⏹️ **Ponto FINALIZADO**. Bom descanso!';

            await interaction.reply({ content: replyMsg, ephemeral: true });

        } catch (error) {
            console.error('[ERRO] Falha ao processar ponto:', error);
            await interaction.reply({ content: '❌ Erro ao registrar ponto. Verifique a conexão com o site.', ephemeral: true });
        }
    }

    // --- BOTÕES DE RANKING ---
    if (interaction.isButton() && interaction.customId.startsWith('rank_')) {
        const periodo = interaction.customId.replace('rank_', '');
        
        let mockData = [];
        if (periodo === 'total') mockData = [{ user: 'Oficial.Silva', time: '40h 30m' }, { user: 'Tenente.Souza', time: '38h 15m' }];
        if (periodo === 'semanal') mockData = [{ user: 'Oficial.Silva', time: '10h 20m' }, { user: 'Cadete.Oliveira', time: '8h 00m' }];
        if (periodo === 'mensal') mockData = [{ user: 'Tenente.Souza', time: '150h 00m' }, { user: 'Oficial.Silva', time: '140h 30m' }];

        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle(`🏆 Ranking de Horas (${periodo.toUpperCase()})`)
            .setDescription(mockData.map((r, i) => `**${i+1}º** ${r.user}: ` + "`" + r.time + "`").join('\n'))
            .setTimestamp();
        
        await interaction.update({ embeds: [embed] });
    }

    // --- COMANDO /RANKING ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'ranking') {
        const periodo = interaction.options.getString('periodo') || 'total';
        
        const mockRanking = [
            { user: 'Oficial.Silva', time: '40h 30m' },
            { user: 'Tenente.Souza', time: '38h 15m' },
            { user: 'Cadete.Oliveira', time: '12h 00m' }
        ];

        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle(`🏆 Ranking de Horas (${periodo.toUpperCase()})`)
            .setDescription(mockRanking.map((r, i) => `**${i+1}º** ${r.user}: ` + "`" + r.time + "`").join('\n'))
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('rank_total').setLabel('Total').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('rank_semanal').setLabel('Semanal').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('rank_mensal').setLabel('Mensal').setStyle(ButtonStyle.Primary)
            );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    // --- COMANDO /ANULAR ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'anular') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('usuario');
        // await axios.post(`${EXTERNAL_API_URL}/api/anular`, { userId: targetUser.id });

        await interaction.reply({ content: `⚠️ O ponto de **${targetUser.tag}** foi anulado.` });
    }

    // --- COMANDO /HELP ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'help') {
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Ajuda - Comandos 911')
            .addFields(
                { name: '/ponto', value: 'Abre o painel de registro de ponto.' },
                { name: '/ranking', value: 'Vê o ranking de horas trabalhadas.' },
                { name: '/anular @user', value: 'Anula o ponto de um usuário (Admin).' },
                { name: '/status_conexao', value: 'Testa conexão com o sistema web.' },
                { name: '!debug', value: 'Mostra status técnico do bot.' }
            );
        await interaction.reply({ embeds: [embed] });
    }

    // --- COMANDO /STATUS_CONEXAO ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'status_conexao') {
        await interaction.deferReply();
        try {
            const start = Date.now();
            await axios.get(EXTERNAL_API_URL);
            const latency = Date.now() - start;
            await interaction.editReply(`✅ Conexão com **${EXTERNAL_API_URL}** estabelecida! Latência: ${latency}ms`);
        } catch (error) {
            await interaction.editReply(`❌ Falha ao conectar com **${EXTERNAL_API_URL}**. Erro: ${error.message}`);
        }
    }
});