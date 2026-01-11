import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction } from 'discord.js';

// 1. Configuration
const TOKEN = 'YOUR_BOT_TOKEN_HERE';
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';

// 2. Client Setup with necessary Intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds // Required to fetch and manage channels
    ]
});

// 3. Command Definition
const commands = [
    new SlashCommandBuilder()
        .setName('tur')
        .setDescription('DANGER: Deletes ALL channels in the server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Security: Only Admins can see/use
        .toJSON()
];

// 4. Register Slash Commands
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

// 5. Interaction Handler
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'tur') {
        // Double check for Administrator permission explicitly
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
            return;
        }

        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply('Este comando só pode ser usado em um servidor.');
            return;
        }

        await interaction.reply({ content: 'Iniciando processo de exclusão de canais... (Isso pode levar tempo)', ephemeral: true });

        try {
            // Fetch all channels ensuring cache is populated
            const channels = await guild.channels.fetch();
            
            let deletedCount = 0;
            for (const [id, channel] of channels) {
                if (channel && channel.deletable) {
                    try {
                        await channel.delete('Comando /tur executado por administrador.');
                        deletedCount++;
                        console.log(`Deleted channel: ${channel.name}`);
                    } catch (err) {
                        console.error(`Failed to delete ${channel.name}:`, err);
                    }
                }
            }
            console.log(`Operação finalizada. Total deletados: ${deletedCount}`);
        } catch (error) {
            console.error('Erro ao buscar canais:', error);
        }
    }
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}!`);
});

client.login(TOKEN);
