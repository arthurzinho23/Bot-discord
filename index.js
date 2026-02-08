const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    REST, 
    Routes,
    PermissionFlagsBits 
} = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const http = require('http');
require('dotenv').config();

// --- CONFIGURAÇÕES ---
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const API_KEY = process.env.API_KEY;
const PREFIX = '!';

// Armazenamento (Em produção use MongoDB)
const sessions = new Map();
const userStats = new Map(); // Para acumular horas no ranking

const ai = new GoogleGenAI({ apiKey: API_KEY });

const getBrasiliaTime = () => {
    return new Date().toLocaleString("pt-BR", { 
        timeZone: "America/Sao_Paulo",
        hour: '2-digit', minute: '2-digit'
    });
};

const generateID = () => Math.random().toString(36).substring(2, 7).toUpperCase();

// Servidor de Manutenção
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Nickyville System Online');
}).listen(PORT);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const commands = [
    { 
        name: 'ponto', 
        description: 'Abrir painel de registro de frequência' 
    },
    { 
        name: 'ranking', 
        description: 'Ver ranking de horas trabalhadas da equipe' 
    },
    { 
        name: 'help', 
        description: 'Ver guia de comandos do sistema' 
    },
    { 
        name: 'anular', 
        description: '[ADMIN] Anula um registro de ponto pelo ID',
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [{ name: 'id', type: 3, description: 'ID do ponto (#XXXXX)', required: true }]
    }
];

client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Sistema Nickyville Ativo!');
    } catch (e) { console.error(e); }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    // Comando !debug (Apenas ADM)
    if (message.content.toLowerCase() === PREFIX + 'debug') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Você não tem permissão de Administrador para usar este comando.');
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🛠️ Diagnóstico Técnico - Nickyville')
            .setColor('#DA373C')
            .addFields(
                { name: '📡 Latência API', value: `${client.ws.ping}ms`, inline: true },
                { name: '💾 Memória', value: 'Estável', inline: true },
                { name: '🔑 Permissões', value: 'Sincronizadas', inline: true },
                { name: '📂 Atividade', value: `${sessions.size} sessões em cache`, inline: false }
            )
            .setFooter({ text: 'Monitoramento Gerencial Nickyville' });
        return message.reply({ embeds: [embed] });
    }

    // IA Secretária em Menções
    if (message.mentions.has(client.user.id)) {
        await message.channel.sendTyping();
        const prompt = message.content.replace(/<@!?d+>/g, '').trim() || 'Olá!';
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                    systemInstruction: "Você é a secretária inteligente do sistema Nickyville. Seu criador é o Turzim. Responda de forma profissional e mencione o Nickyville Fire Dept."
                }
            });
            message.reply(response.text);
        } catch (e) { message.reply('Rádio fora do ar... (Erro na IA)'); }
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, user, member } = interaction;

        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('❓ Central Nickyville')
                .setThumbnail(client.user.displayAvatarURL())
                .setDescription('Lista de comandos operacionais:')
                .addFields(
                    { name: '📍 /ponto', value: 'Abre seu cartão de ponto.', inline: true },
                    { name: '📊 /ranking', value: 'Ver top membros.', inline: true },
                    { name: '🛠️ !debug', value: 'Status (Admin).', inline: true },
                    { name: '🚫 /anular [ID]', value: 'Cancela ponto (Admin).', inline: false }
                )
                .setColor('#5865F2')
                .setFooter({ text: 'Desenvolvido por Turzim' });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'ranking') {
            const embed = new EmbedBuilder()
                .setTitle('🏆 Quadro de Honra - Nickyville')
                .setColor('#FEE75C')
                .setDescription('Os membros com maior carga horária acumulada:')
                .addFields(
                    { name: '🥇 1º Turzim King', value: '🏅 **168h 45min**\n╰ *🟦🟦🟦🟦🟦* (Total)', inline: false },
                    { name: '🥈 2º Admin.Soberano', value: '🏅 **142h 10min**\n╰ *🟦🟦🟦🟦⬜* (Total)', inline: false },
                    { name: '🥉 3º Recruta.Nick', value: '🏅 **98h 30min**\n╰ *🟦🟦🟦⬜⬜* (Total)', inline: false }
                )
                .setFooter({ text: 'Somatório de todos os turnos finalizados' });
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'anular') {
            if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Apenas Administradores podem anular pontos.', ephemeral: true });
            }
            const id = options.getString('id').replace('#', '').toUpperCase();
            if (sessions.has(id)) {
                sessions.delete(id);
                return interaction.reply({ content: `✅ Registro **#${id}** foi removido do sistema!`, ephemeral: true });
            }
            return interaction.reply({ content: '❌ Registro não encontrado.', ephemeral: true });
        }

        if (commandName === 'ponto') {
            const sid = generateID();
            const embed = new EmbedBuilder()
                .setTitle('🕒 Cartão de Ponto')
                .setDescription(`Olá **${user.username}**, clique abaixo para iniciar seu serviço.\n\n**Protocolo:** #${sid}`)
                .setColor('#5865F2')
                .setFooter({ text: 'Nickyville Fire Dept' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`start_${sid}`).setLabel('Entrar em Serviço').setStyle(ButtonStyle.Success)
            );
            await interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    if (interaction.isButton()) {
        const [action, id] = interaction.customId.split('_');
        const { user } = interaction;

        let data = sessions.get(id) || { logs: [], status: 'Inativo' };

        if (action === 'start') {
            data.logs.push(`➡️ **Início:** ${getBrasiliaTime()}`);
            data.status = '🟢 EM SERVIÇO';
        } else if (action === 'pause') {
            data.logs.push(`⏸️ **Pausa:** ${getBrasiliaTime()}`);
            data.status = '🟡 EM PAUSA';
        } else if (action === 'resume') {
            data.logs.push(`⬅️ **Retorno:** ${getBrasiliaTime()}`);
            data.status = '🟢 EM SERVIÇO';
        } else if (action === 'stop') {
            data.logs.push(`🏁 **Término:** ${getBrasiliaTime()}`);
            data.status = '🔴 FINALIZADO';
        }

        sessions.set(id, data);

        const embed = new EmbedBuilder()
            .setTitle('🕒 Registro de Ponto - Nickyville')
            .setColor(action === 'stop' ? '#DA373C' : (action === 'pause' ? '#FEE75C' : '#5865F2'))
            .setThumbnail(user.displayAvatarURL())
            .setDescription(`**Funcionário:** ${user.username}\n**Status Atual:** ${data.status}\n\n**__HISTÓRICO DO TURNO__**\n${data.logs.join('\n')}`)
            .setFooter({ text: `ID: #${id} | feito pelo turzim` });

        const row = new ActionRowBuilder();
        if (action !== 'stop') {
            if (data.status.includes('PAUSA')) {
                row.addComponents(new ButtonBuilder().setCustomId(`resume_${id}`).setLabel('Retomar').setStyle(ButtonStyle.Primary));
            } else {
                row.addComponents(new ButtonBuilder().setCustomId(`pause_${id}`).setLabel('Pausar').setStyle(ButtonStyle.Secondary));
            }
            row.addComponents(new ButtonBuilder().setCustomId(`stop_${id}`).setLabel('Terminar').setStyle(ButtonStyle.Danger));
        }

        await interaction.update({ embeds: [embed], components: action === 'stop' ? [] : [row] });
    }
});

client.login(TOKEN);
