// Require the necessary discord.js classes
const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { token, userId, channelId, stickerId } = require('../config.json');


// Create a new client instance
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildPresences,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildVoiceStates,
	],
});

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

client.once(Events.ClientReady, readyClient => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		try {
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
			} else {
				await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
			}
		} catch (replyError) {
			console.error('Failed to send error response:', replyError);
		}
	}
});

// Send a sticker when the watched user comes online
client.on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
	if (newPresence.userId !== userId) return;
	const wasOnline = oldPresence?.status === 'online';
	const isOnline = newPresence.status === 'online';
	if (!wasOnline && isOnline) {
		try {
			const channel = await client.channels.fetch(channelId);
			await channel.send({ stickers: [stickerId] });
		} catch (error) {
			console.error('Failed to send sticker:', error);
		}
	}
});

client.on('error', error => console.error('Client error:', error));

client.login(token);