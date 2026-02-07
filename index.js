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
const http = require('http');
require('dotenv').config();

// Servidor para manter o bot online
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Sistema de Ponto Online');
}).listen(PORT);

const TOKEN = process.env.DISCORD_TOKEN;
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Cache temporário (Use banco de dados em produção)
const activeSessions = new Map();

const commands = [
    { 
        name: 'ponto', 
        description: 'Gerencia seu registro de ponto individual' 
    },
    { 
        name: 'ranking', 
        description: 'Visualiza as estatísticas de horas trabalhadas',
        options: [
            {
                name: 'periodo',
                description: 'Selecione o intervalo de tempo',
                type: ApplicationCommandOptionType.String,
                required: true,
                choices: [
                    { name: 'Hoje', value: 'dia' },
                    { name: 'Esta Semana', value: 'semana' },
                    { name: 'Geral', value: 'total' }
                ]
            }
        ]
    },
    { name: 'ajuda', description: 'Exibe o guia de comandos' }
];

client.once('ready', () => {
    console.log('Bot Pronto!');
    // Registro de comandos automático para o primeiro servidor (Exemplo)
    client.guilds.cache.forEach(guild => {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands })
            .catch(err => console.error('Erro ao registrar comandos:', err));
    });
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, user } = interaction;

        if (commandName === 'ponto') {
            const pontoId = '#' + Math.random().toString(36).substring(2, 6).toUpperCase();
            const embed = new EmbedBuilder()
                .setTitle('💼 Painel de Frequência')
                .setDescription('Olá ' + user.username + ', gerencie seu turno utilizando os botões.')
                .setColor('#5865F2')
                .addFields(
                    { name: 'Colaborador', value: user.toString(), inline: true },
                    // Fix: properly escape backtick to avoid terminating the template string
                    { name: 'Protocolo', value: '`' + pontoId + '`', inline: true }
                )
                .setFooter({ text: 'Nickyville Multi-Serviços' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_start_' + pontoId)
                    .setLabel('Iniciar')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🟢')
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }

        if (commandName === 'ranking') {
            const periodo = options.getString('periodo');
            const titulos = { dia: 'Diário', semana: 'Semanal', total: 'Total' };
            
            const embed = new EmbedBuilder()
                .setTitle('🏆 Ranking ' + titulos[periodo])
                .setDescription('Colaboradores mais dedicados do período.')
                .setColor('#FEE75C')
                .addFields(
                    // Fix: properly escape backtick to avoid terminating the template string
                    { name: '1º Lugar', value: '🥇 Usuário Exemplo - `12h`' },
                    { name: '2º Lugar', value: '🥈 Usuário Exemplo - `08h`' }
                )
                .setFooter({ text: 'Sistema de Ponto' });

            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'ajuda') {
            const embed = new EmbedBuilder()
                .setTitle('❓ Central de Ajuda')
                .setDescription('Lista de comandos rápidos:')
                .addFields(
                    // Fix: properly escape backtick to avoid terminating the template string
                    { name: 'Colaborador', value: '`/ponto` • `/ranking`', inline: true },
                    { name: 'Administrador', value: '`!setup` • `/anular`', inline: true }
                )
                .setColor('#5865F2');
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

    if (interaction.isButton()) {
        const [action, type, pId] = interaction.customId.split('_');
        // Lógica de atualização aqui...
        await interaction.reply({ content: 'Ação registrada com sucesso!', ephemeral: true });
    }
});

client.login(TOKEN);
