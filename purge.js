const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ] 
});

client.on('ready', () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  // Comando /tur para deletar todos os canais
  if (message.content === '/tur') {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('❌ Você não tem permissão de Administrador!');
    }

    const channels = message.guild.channels.cache;
    console.log(`🧨 Limpando servidor...`);

    for (const [id, channel] of channels) {
      try {
        await channel.delete();
        console.log(`Canal #${channel.name} removido.`);
      } catch (err) {
        console.error(`Falha ao deletar ${channel.name}`);
      }
    }
  }
});

// Seu token inserido abaixo
client.login('MTQ0NTExMDg1NjAwOTY1MDQ0OQ.G7i51S.miAhVe_XIBjX4ikwG0dY7RfIf7ZKPLaryur4ao');
