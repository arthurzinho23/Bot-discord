const { Client, GatewayIntentBits, Events, EmbedBuilder, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

// --- CONFIGURAÇÃO PARA RENDER/REPLIT (Mantém o bot vivo) ---
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send({ 
    status: '🛡️ Guardian Online', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
}));

app.listen(port, () => console.log(`🌐 Web Server rodando na porta ${port} (Obrigatório para o Render)`));
// -----------------------------------------------------------


console.log('🔄 Iniciando Sistema de Segurança...');

// ⚙️ CONFIGURAÇÃO CENTRAL
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN || 'SEU_TOKEN_AQUI', 
    LOG_CHANNEL: '1445105097796223078',
    MIN_AGE_DAYS: 7,
    AUTO_KICK: false
};

// --- AUTO-DIAGNÓSTICO DE INICIALIZAÇÃO ---
if (CONFIG.TOKEN === 'SEU_TOKEN_AQUI' && !process.env.DISCORD_TOKEN) {
    console.error('❌ ERRO CRÍTICO: Token do Bot não encontrado!');
    console.error('DICA: No painel do Render, vá em "Environment" e adicione a variável DISCORD_TOKEN com o token do seu bot.');
    process.exit(1); // Encerra com erro para o Render mostrar vermelho
}
// ----------------------------------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // CRUCIAL
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.GuildMember, Partials.User]
});

client.once(Events.ClientReady, c => {
    console.log(`✅ SISTEMA OPERACIONAL: ${c.user.tag}`);
    console.log(`🛡️ Monitorando entradas no servidor...`);
    client.user.setActivity('🛡️ Monitorando Perímetro');
});

// --- FUNÇÃO AUXILIAR DE ESTILO ---
const createProgressBar = (days, minDays) => {
    const percentage = Math.min(days / minDays, 1);
    const bars = 10;
    const filled = Math.floor(percentage * bars);
    const empty = bars - filled;
    return '█'.repeat(filled) + '░'.repeat(empty); // Visual de barra de carregamento
};

// 🚨 EVENTO: ENTRADA DE MEMBRO
client.on(Events.GuildMemberAdd, async member => {
    try {
        const createdAt = member.user.createdAt;
        const now = new Date();
        const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
        
        const isSuspicious = diffDays < CONFIG.MIN_AGE_DAYS;
        
        // Cores: Vermelho Sangue (Suspeito) vs Verde Matrix (Seguro)
        const color = isSuspicious ? 0xED4245 : 0x57F287; 
        const title = isSuspicious ? '⛔ ALERTA DE SEGURANÇA: CONTA DE RISCO' : '✅ ACESSO PERMITIDO: CONTA SEGURA';
        
        // Descrição gerada pela IA ou Padrão
        const aiMessage = `🛡️ PROTOCOLO DE SEGURANÇA: Análise de novo usuário iniciada.`;

        const embed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({ 
                name: `${member.user.tag} entrou no servidor`, 
                iconURL: member.user.displayAvatarURL({ dynamic: true }) 
            })
            .setTitle(title)
            .setDescription(`> ${aiMessage}

**📋 Análise Técnica:**`)
            .addFields(
                { 
                    name: '🆔 Identificação (ID)', 
                    value: ```yaml
${member.id}
```, 
                    inline: true 
                },
                { 
                    name: '🤖 Tipo', 
                    value: ```fix
${member.user.bot ? 'BOT' : 'HUMANO'}
```, 
                    inline: true 
                },
                { 
                    name: '⏳ Idade da Conta', 
                    value: `**${diffDays} dias**
${createProgressBar(diffDays, 30)}`, 
                    inline: false 
                },
                { 
                    name: '📅 Data de Criação', 
                    value: `<t:${Math.floor(createdAt.getTime() / 1000)}:F> (<t:${Math.floor(createdAt.getTime() / 1000)}:R>)`, 
                    inline: false 
                }
            )
            .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
            .setFooter({ text: `Security System v2.0 • ${new Date().toLocaleTimeString()}`, iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        // Botões Táticos
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`kick_${member.id}`)
                    .setLabel('EXPULSAR')
                    .setEmoji('🥾')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`ban_${member.id}`)
                    .setLabel('BANIR AGENTE')
                    .setEmoji('🔨')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`info_${member.id}`)
                    .setLabel('RELATÓRIO COMPLETO')
                    .setEmoji('📄')
                    .setStyle(ButtonStyle.Secondary)
            );

        const channel = member.guild.channels.cache.get(CONFIG.LOG_CHANNEL);
        
        if (channel && channel.isTextBased()) {
            await channel.send({ 
                content: isSuspicious ? `||@here|| 🚨 **ATENÇÃO STAFF:** Possível Raid/Alt detectada!` : null,
                embeds: [embed], 
                components: [row] 
            });
        } else {
            console.log('⚠️ Aviso: Canal de Logs não encontrado ou ID incorreto.');
        }

        // Auto-Kick Lógica
        if (CONFIG.AUTO_KICK && isSuspicious) {
            await member.kick('🛡️ Auto-Defense: Conta muito recente.');
            if(channel) await channel.send(`🤖 **AUTO-DEFESA:** O alvo ${member.user.tag} foi neutralizado (Kick) automaticamente.`);
        }

    } catch (error) {
        console.error('Erro no guildMemberAdd:', error);
    }
});

// 🏃 EVENTO: SAÍDA DE MEMBRO (Para avisar se o suspeito fugiu)
client.on(Events.GuildMemberRemove, async member => {
     const channel = member.guild.channels.cache.get(CONFIG.LOG_CHANNEL);
     if(channel && channel.isTextBased()) {
        const embed = new EmbedBuilder()
            .setColor(0x000000) // Preto/Cinza
            .setDescription(`💨 **${member.user.tag}** saiu do servidor.`)
            .setFooter({ text: `ID: ${member.id}` });
        channel.send({ embeds: [embed] }).catch(e => console.log('Erro ao enviar log de saída'));
     }
});

// 🎮 CONTROLE DE INTERAÇÕES (BOTÕES)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return interaction.reply({ content: '⛔ **ACESSO NEGADO.** Você não tem credenciais para esta operação.', ephemeral: true });
    }

    const [action, targetId] = interaction.customId.split('_');
    const guild = interaction.guild;
    
    // Tenta buscar o membro mesmo se já saiu (pelo ID)
    let targetUser;
    try {
        targetUser = await client.users.fetch(targetId);
    } catch(e) {
        return interaction.reply({ content: '❌ Alvo não encontrado na base de dados (ID inválido).', ephemeral: true });
    }

    const targetMember = guild.members.cache.get(targetId);

    try {
        if (action === 'kick') {
            if (!targetMember) return interaction.reply({ content: '❌ Usuário já não está mais no servidor.', ephemeral: true });
            await targetMember.kick(`Operação manual por ${interaction.user.tag}`);
            await interaction.reply({ content: `👢 **ALVO NEUTRALIZADO.** ${targetUser.tag} foi expulso.` });
        }
        
        if (action === 'ban') {
            await guild.members.ban(targetId, { reason: `Banimento manual por ${interaction.user.tag}` });
            await interaction.reply({ content: `🔨 **AMEAÇA ELIMINADA.** ${targetUser.tag} foi banido permanentemente.` });
        }

        if (action === 'info') {
             const created = targetUser.createdAt;
             const joined = targetMember ? targetMember.joinedAt : null;
             
             const infoEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`📁 Dossiê: ${targetUser.tag}`)
                .setDescription(`
                **ID:** `${targetUser.id}`
                **Bot:** ${targetUser.bot ? 'Sim' : 'Não'}
                **Conta Criada:** <t:${Math.floor(created.getTime()/1000)}:R>
                **Entrou no Server:** ${joined ? `<t:${Math.floor(joined.getTime()/1000)}:R>` : 'Não está mais no servidor'}
                `);
            
            await interaction.reply({ embeds: [infoEmbed], ephemeral: true });
        }
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: `❌ **ERRO DE EXECUÇÃO:** Verifique se meu cargo está ACIMA do cargo de ${targetUser.tag}.`, ephemeral: true });
    }
});

// 💡 COMANDO EXTRA: !lockdown (Simulação)
client.on(Events.MessageCreate, async message => {
    if(message.content === '!lockdown' && message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        message.channel.send('🚧 **MODO LOCKDOWN ATIVADO (Simulação)** 🚧\nNeste modo, o bot poderia fechar canais.');
    }
});

client.login(CONFIG.TOKEN).catch(error => {
    console.error('❌ FALHA NO LOGIN:');
    console.error(error);
    console.log('---------------------------------------------------');
    console.log('💡 DICA: Verifique se o TOKEN está correto no Render (Environment Variables).');
    console.log('💡 DICA: Verifique se as PRIVILEGED INTENTS estão ativadas no Discord Developer Portal.');
    console.log('---------------------------------------------------');
});
