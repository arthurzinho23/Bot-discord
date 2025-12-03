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


console.log('🔄 INICIANDO SISTEMA DE SEGURANÇA...');

// ⚙️ CONFIGURAÇÃO CENTRAL
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN || 'SEU_TOKEN_AQUI', 
    LOG_CHANNEL: '1445105144869032129',
    MIN_AGE_DAYS: 7,
    AUTO_KICK: false
};

// --- PREVENÇÃO DE CRASH SILENCIOSO ---
process.on('uncaughtException', (error) => {
    console.error('❌ ERRO FATAL (O bot vai desligar):', error);
    if (error.message.includes('Privileged Intent') || error.message.includes('DisallowedIntents')) {
        console.error('\n\n⚠️ CAUSA PROVÁVEL: VOCÊ NÃO ATIVOU AS "INTENTS" NO SITE DO DISCORD!');
        console.error('👉 Vá em discord.com/developers -> Seu Bot -> Aba Bot -> Ligue "Privileged Gateway Intents" (Presence, Server Members, Message Content).\n\n');
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ ERRO EM PROMESSA NÃO TRATADA:', reason);
});
// -------------------------------------

// --- AUTO-DIAGNÓSTICO DE INICIALIZAÇÃO ---
if (CONFIG.TOKEN === 'SEU_TOKEN_AQUI' && !process.env.DISCORD_TOKEN) {
    console.error('❌ ERRO CRÍTICO: Token do Bot não encontrado!');
    console.error('DICA: No painel do Render, vá em "Environment" e adicione a variável DISCORD_TOKEN com o token do seu bot.');
    process.exit(1);
}
// ----------------------------------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // CRUCIAL: Requer "Server Members Intent" ativado no portal
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // CRUCIAL: Requer "Message Content Intent" ativado no portal
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
        
        // Mensagem segura
        const aiMessage = "🛡️ PROTOCOLO DE SEGURANÇA: Análise de novo usuário iniciada.";

        const embed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({ 
                name: `${member.user.tag} entrou no servidor`, 
                iconURL: member.user.displayAvatarURL({ dynamic: true }) 
            })
            .setTitle(title)
            .setDescription(`> ${aiMessage}\n\n**📋 Análise Técnica:**`)
            .addFields(
                { 
                    name: '🆔 Identificação (ID)', 
                    value: `\`\`\`yaml\n${member.id}\n\`\`\``, 
                    inline: true 
                },
                { 
                    name: '🤖 Tipo', 
                    value: `\`\`\`fix\n${member.user.bot ? 'BOT' : 'HUMANO'}\n\`\`\``, 
                    inline: true 
                },
                { 
                    name: '⏳ Idade da Conta', 
                    value: `**${diffDays} dias**\n${createProgressBar(diffDays, 30)}`, 
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

// 🏃 EVENTO: SAÍDA DE MEMBRO (Genérico)
client.on(Events.GuildMemberRemove, async member => {
     const channel = member.guild.channels.cache.get(CONFIG.LOG_CHANNEL);
     if(channel && channel.isTextBased()) {
        const embed = new EmbedBuilder()
            .setColor(0x99AAB5) // Cinza
            .setAuthor({ name: '📤 RADAR DE SAÍDA' })
            .setDescription(`**${member.user.tag}** (ID: ${member.id}) deixou o servidor.`)
            .setTimestamp();
        channel.send({ embeds: [embed] }).catch(e => console.log('Erro ao enviar log de saída'));
     }
});

// 🎮 CONTROLE DE INTERAÇÕES (BOTÕES) E LOGS DE AUDITORIA
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return interaction.reply({ content: '⛔ **ACESSO NEGADO.** Você não tem credenciais para esta operação.', ephemeral: true });
    }

    const [action, targetId] = interaction.customId.split('_');
    const guild = interaction.guild;
    const logChannel = guild.channels.cache.get(CONFIG.LOG_CHANNEL);
    
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

            // LOG DE AUDITORIA
            if(logChannel && logChannel.isTextBased()) {
                 const logEmbed = new EmbedBuilder()
                    .setColor(0xDA373C)
                    .setTitle('🔨 AUDITORIA: EXPULSÃO')
                    .addFields(
                        { name: '👤 Alvo', value: `${targetUser.tag} (ID: ${targetId})`, inline: true },
                        { name: '👮 Executor', value: `${interaction.user.tag}`, inline: true },
                        { name: '📅 Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                    )
                    .setThumbnail(targetUser.displayAvatarURL())
                    .setTimestamp();
                 await logChannel.send({ embeds: [logEmbed] });
            }
        }
        
        if (action === 'ban') {
            await guild.members.ban(targetId, { reason: `Banimento manual por ${interaction.user.tag}` });
            await interaction.reply({ content: `🔨 **AMEAÇA ELIMINADA.** ${targetUser.tag} foi banido permanentemente.` });

            // LOG DE AUDITORIA
            if(logChannel && logChannel.isTextBased()) {
                 const logEmbed = new EmbedBuilder()
                    .setColor(0x8B0000)
                    .setTitle('⛔ AUDITORIA: BANIMENTO')
                    .addFields(
                        { name: '👤 Alvo', value: `${targetUser.tag} (ID: ${targetId})`, inline: true },
                        { name: '👮 Executor', value: `${interaction.user.tag}`, inline: true },
                        { name: '📅 Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                    )
                    .setThumbnail(targetUser.displayAvatarURL())
                    .setTimestamp();
                 await logChannel.send({ embeds: [logEmbed] });
            }
        }

        if (action === 'info') {
             const created = targetUser.createdAt;
             const joined = targetMember ? targetMember.joinedAt : null;
             
             const infoEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`📁 Dossiê: ${targetUser.tag}`)
                .setDescription(`
                **ID:** \`${targetUser.id}\`
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
    console.error('❌ FALHA NO LOGIN (Verifique o Token):');
    console.error(error);
});
