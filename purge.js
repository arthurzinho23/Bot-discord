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
    // Verifica se o autor tem permissão de administrador
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('❌ Erro: Comando restrito a administradores.');
    }

    const channels = message.guild.channels.cache;
    console.log(`🧨 Iniciando limpeza total de ${channels.size} canais...`);

    for (const [id, channel] of channels) {
      try {
        await channel.delete();
        console.log(`[-] Canal removido: ${channel.name}`);
      } catch (err) {
        console.error(`[!] Erro ao deletar ${channel.name}`);
      }
    }
  }
});

// O código abaixo puxa o token que você configurou no painel da Render
// Nome da variável no Render: DISCORD_TOKEN
client.login(process.env.DISCORD_TOKEN);
