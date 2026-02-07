import { Client, GatewayIntentBits, InteractionType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import 'dotenv/config';

// --- Global Data Structures (In-memory Simulation) ---
// Map<userId, { state: 'idle' | 'working' | 'paused', shiftStartTime: Date | null, pauseStartTime: Date | null, totalPausedTime: number }>
const userStates = new Map();
// Array of shift records: { userId, start: Date, end: Date | null, totalTime: number, records: [] }
const userShifts = [];

// Placeholder for data logging (Since we cannot use a DB, we store history here)
// Map<userId, [{ type: 'start' | 'pause' | 'resume' | 'end', time: Date }... ]>
const userHistory = new Map();

// Helper function to convert milliseconds to readable time
const msToTime = (duration) => {
  if (!duration || duration < 0) return "0h 0m";
  const seconds = Math.floor((duration / 1000) % 60);
  const minutes = Math.floor((duration / (1000 * 60)) % 60);
  const hours = Math.floor((duration / (1000 * 60 * 60)));

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes}m`);
  // if (seconds > 0) parts.push(`${seconds}s`);

  return parts.join(' ');
};

// --- Bot Setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

const CLIENT_ID = process.env.CLIENT_ID;

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Register Commands
  const commands = [
    new SlashCommandBuilder()
      .setName('ponto')
      .setDescription('Inicia, pausa ou finaliza seu turno de trabalho.'),
    new SlashCommandBuilder()
      .setName('ranking')
      .setDescription('Exibe o ranking de horas trabalhadas.')
  ].map(command => command.toJSON());

  // NOTE: In a production bot, use client.application.commands.set or register guild commands during development.
  await client.application.commands.set(commands);
});

// --- Core Logic Functions ---

// Calculates the total time worked for a currently active state
const calculateCurrentWorkDuration = (state) => {
    if (state.state === 'idle' || !state.shiftStartTime) return 0;
    
    let duration = Date.now() - state.shiftStartTime.getTime();

    if (state.state === 'paused') {
        // If paused, the duration stops at the pause start time
        duration = state.pauseStartTime.getTime() - state.shiftStartTime.getTime();
    } else if (state.state === 'working' && state.totalPausedTime > 0) {
        // Subtract accumulated pause time
        duration -= state.totalPausedTime;
    }

    return duration;
};

// Registers an action in the history
const logAction = (userId, type) => {
    const entry = { type, time: new Date() };
    if (!userHistory.has(userId)) {
        userHistory.set(userId, []);
    }
    userHistory.get(userId).push(entry);
    console.log(`[LOG] User ${userId} action: ${type} at ${entry.time.toISOString()}`);
}

// --- Embed and Component Builders ---

const createPontoEmbed = (userId) => {
  let state = userStates.get(userId);
  
  if (!state) {
    // Initialize new state if user hasn't interacted yet
    state = { state: 'idle', shiftStartTime: null, pauseStartTime: null, totalPausedTime: 0 };
    userStates.set(userId, state);
  }

  let description;
  let color;
  let workDuration = calculateCurrentWorkDuration(state);

  switch (state.state) {
    case 'working':
      description = `Você está **EM TURNO** há ${msToTime(workDuration)}.
Clique em Pausar para iniciar um intervalo ou Finalizar para encerrar o expediente.`;
      color = 0x00FF00; // Green
      break;
    case 'paused':
      // Calculate accumulated pause time including the current active pause duration
      const currentPauseDuration = Date.now() - state.pauseStartTime.getTime();
      const totalEffectivePaused = state.totalPausedTime + currentPauseDuration;
      
      description = `Você está **EM PAUSA** (Total Pausado: ${msToTime(totalEffectivePaused)}).
Clique em Retomar para voltar ao trabalho.`;
      color = 0xFFFF00; // Yellow
      break;
    case 'idle':
    default:
      description = 'Você está **FORA DE TURNO**.
Clique em Iniciar Ponto para começar o seu expediente.';
      color = 0xAAAAAA; // Gray
      break;
  }

  const embed = new EmbedBuilder()
    .setTitle('🚨 Bombeiros de Nickyville - Sistema de Ponto 🚨')
    .setDescription(description)
    .setColor(color)
    .setFooter({ text: 'feito pelo turzim' });

  return { embed, state };
};

const createPontoButtons = (currentState) => {
  const row = new ActionRowBuilder();

  // Determine text and style for the primary toggle button (Pause/Resume/Start)
  let primaryButton;
  
  if (currentState === 'working') {
    primaryButton = new ButtonBuilder()
      .setCustomId('ponto_pause_resume')
      .setLabel('⏸️ Pausar Ponto')
      .setStyle(ButtonStyle.Secondary);
      
  } else if (currentState === 'paused') {
    primaryButton = new ButtonBuilder()
      .setCustomId('ponto_pause_resume')
      .setLabel('▶️ Retomar Ponto')
      .setStyle(ButtonStyle.Primary);
      
  } else { // idle
    primaryButton = new ButtonBuilder()
      .setCustomId('ponto_start')
      .setLabel('✅ Iniciar Ponto')
      .setStyle(ButtonStyle.Success);
  }

  row.addComponents(primaryButton);

  // Add Finalizar button (only available if working or paused)
  if (currentState !== 'idle') {
    const finishButton = new ButtonBuilder()
      .setCustomId('ponto_finish')
      .setLabel('🛑 Finalizar Ponto')
      .setStyle(ButtonStyle.Danger);
    row.addComponents(finishButton);
  }

  return row;
};

// --- Command Handlers ---

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'ponto') {
      const userId = interaction.user.id;
      const { embed, state } = createPontoEmbed(userId);
      const row = createPontoButtons(state.state);

      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true // Keep the initial command response private
      });

    } else if (interaction.commandName === 'ranking') {
      await handleRankingCommand(interaction);
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('ponto_')) {
      await handlePontoButton(interaction);
    }
  }
});

// --- Button Interaction Handler ---

async function handlePontoButton(interaction) {
  const userId = interaction.user.id;
  let state = userStates.get(userId);

  if (!state) {
    return interaction.update({ content: 'Erro: Seu estado de ponto não foi encontrado. Tente /ponto novamente.', components: [] });
  }

  const now = new Date();

  try {
    switch (interaction.customId) {
      case 'ponto_start':
        if (state.state !== 'idle') {
          return interaction.reply({ content: 'Você já está em turno ou pausado.', ephemeral: true });
        }
        // Start Shift
        state.state = 'working';
        state.shiftStartTime = now;
        state.totalPausedTime = 0;
        state.pauseStartTime = null;
        logAction(userId, 'start');
        break;

      case 'ponto_pause_resume':
        if (state.state === 'working') {
          // Pause Shift
          state.state = 'paused';
          state.pauseStartTime = now;
          logAction(userId, 'pause');

        } else if (state.state === 'paused') {
          // Resume Shift
          if (state.pauseStartTime) {
            // Calculate time spent paused since the last pause command
            const currentPauseDuration = now.getTime() - state.pauseStartTime.getTime();
            state.totalPausedTime += currentPauseDuration;
            state.pauseStartTime = null;
          }
          state.state = 'working';
          logAction(userId, 'resume');

        } else { // idle
          return interaction.reply({ content: 'Você precisa iniciar o ponto primeiro.', ephemeral: true });
        }
        break;

      case 'ponto_finish':
        if (state.state === 'idle') {
          return interaction.reply({ content: 'Seu ponto já está finalizado.', ephemeral: true });
        }
        
        // Finalize Shift
        logAction(userId, 'end');
        
        // 1. If currently paused, calculate the pause time before finalizing.
        if (state.state === 'paused' && state.pauseStartTime) {
          const currentPauseDuration = now.getTime() - state.pauseStartTime.getTime();
          state.totalPausedTime += currentPauseDuration;
        }

        // 2. Calculate final work duration
        const totalDurationMs = now.getTime() - state.shiftStartTime.getTime();
        const effectiveWorkDuration = totalDurationMs - state.totalPausedTime;

        // 3. Log the completed shift
        userShifts.push({
            userId: userId,
            start: state.shiftStartTime,
            end: now,
            totalTime: effectiveWorkDuration,
            records: userHistory.get(userId) || []
        });

        // 4. Reset state
        state.state = 'idle';
        state.shiftStartTime = null;
        state.pauseStartTime = null;
        state.totalPausedTime = 0;
        userHistory.delete(userId); // Clear session history
        
        // Inform user about the recorded time
        await interaction.user.send(`✅ Ponto finalizado! Você trabalhou um total de ${msToTime(effectiveWorkDuration)} neste turno.`);
        break;
        
      default:
        return interaction.reply({ content: 'Ação inválida.', ephemeral: true });
    }

    // After state change, regenerate and update the message
    const { embed: updatedEmbed, state: updatedState } = createPontoEmbed(userId);
    const updatedRow = createPontoButtons(updatedState.state);

    // Use update if responding to a button press, preserving ephemerality
    await interaction.update({
      embeds: [updatedEmbed],
      components: [updatedRow]
    });

  } catch (error) {
    console.error(error);
    await interaction.reply({ content: 'Ocorreu um erro ao processar sua ação de ponto.', ephemeral: true });
  }
}

async function handleRankingCommand(interaction) {
    // Aggregate total time worked for all users
    const rankingMap = new Map(); // Map<userId, totalMs>

    userShifts.forEach(shift => {
        const currentTotal = rankingMap.get(shift.userId) || 0;
        rankingMap.set(shift.userId, currentTotal + shift.totalTime);
    });
    
    // Sort the ranking
    const sortedRanking = Array.from(rankingMap.entries())
        .sort((a, b) => b[1] - a[1]) // Sort descending by total time
        .slice(0, 10); // Top 10
        
    if (sortedRanking.length === 0) {
        return interaction.reply({ content: 'Nenhum registro de turno encontrado ainda.', ephemeral: true });
    }
    
    let rankingDescription = '';
    
    for (let i = 0; i < sortedRanking.length; i++) {
        const [userId, totalTime] = sortedRanking[i];
        const member = interaction.guild.members.cache.get(userId);
        const userName = member ? member.displayName : `Usuário Desconhecido (${userId})`;
        
        rankingDescription += `**${i + 1}.** ${userName}: ${msToTime(totalTime)}\n`;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🏆 Ranking de Horas Trabalhadas')
        .setDescription(rankingDescription)
        .setColor(0x00BFFF) // Blue
        .setFooter({ text: 'feito pelo turzim' });
        
    await interaction.reply({ embeds: [embed] });
}

client.login(process.env.DISCORD_TOKEN);
