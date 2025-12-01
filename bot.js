// bot.js
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// ID do canal que só os staffs veem
const staffChannelId = 'ID_DO_CANAL_DOS_STAFFS';

client.on('ready', () => {
    console.log(`Bot online como ${client.user.tag}`);
});

client.on('guildMemberAdd', member => {
    const createdAt = member.user.createdAt;
    const now = new Date();
    const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

    const embed = new EmbedBuilder()
        .setTitle('🚨 Novo Membro')
        .setColor(diffDays < 7 ? 0xFF0000 : 0x00FF00) // vermelho suspeito, verde normal
        .addFields(
            { name: 'Nome', value: member.user.username, inline: true },
            { name: 'Tag', value: member.user.tag, inline: true },
            { name: 'Conta criada há', value: `${diffDays} dias`, inline: true },
            { name: 'Suspeita de raid', value: diffDays < 7 ? 'Sim' : 'Não', inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

    const channel = member.guild.channels.cache.get(staffChannelId);
    if (channel) channel.send({ embeds: [embed] });
});

// Loga usando variável de ambiente
client.login(process.env.DISCORD_TOKEN);
