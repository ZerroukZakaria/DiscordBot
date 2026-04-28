const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const play = require('play-dl');

// Per-guild queue map
const queues = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Plays songs from two YouTube playlists merged and shuffled.')
        .addStringOption(option =>
            option.setName('playlist1')
                .setDescription('The first YouTube playlist URL')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('playlist2')
                .setDescription('The second YouTube playlist URL')
                .setRequired(true)),

    async execute(interaction) {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: 'You need to join a voice channel first!', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply();
        await interaction.editReply({ content: 'Kumiko is tuning her euphonium...' });

        const url1 = interaction.options.getString('playlist1');
        const url2 = interaction.options.getString('playlist2');

        let tracks = [];
        for (const url of [url1, url2]) {
            try {
                const playlist = await play.playlist_info(url, { incomplete: true });
                const videos = await playlist.all_videos();
                tracks.push(...videos.map(v => ({ title: v.title, url: v.url })));
            } catch (err) {
                console.error(`Failed to fetch playlist ${url}:`, err);
            }
        }

        if (tracks.length === 0) {
            return interaction.editReply('Could not fetch any tracks from those playlists.');
        }

        shuffle(tracks);

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: true,
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        } catch {
            connection.destroy();
            return interaction.editReply('Could not connect to the voice channel. Make sure I have permission to join and speak.');
        }

        // Destroy any existing queue for this guild before starting a new one
        const existing = queues.get(interaction.guild.id);
        if (existing) {
            existing.player.removeAllListeners();
            existing.connection.destroy();
            queues.delete(interaction.guild.id);
        }

        const player = createAudioPlayer();
        connection.subscribe(player);

        const queue = { tracks, index: 0, player, connection };
        queues.set(interaction.guild.id, queue);

        // Register listeners before starting playback to avoid race condition
        player.on(AudioPlayerStatus.Idle, async () => {
            const q = queues.get(interaction.guild.id);
            if (!q) return;
            q.index++;
            if (q.index < q.tracks.length) {
                await playNext(interaction.guild.id);
            } else {
                queues.delete(interaction.guild.id);
                connection.destroy();
            }
        });

        player.on('error', error => {
            console.error('Audio player error:', error);
            const q = queues.get(interaction.guild.id);
            if (!q) return;
            q.index++;
            playNext(interaction.guild.id).catch(console.error);
        });

        await interaction.editReply(`Tuned up! Queued **${tracks.length}** tracks from both playlists. Starting now!`);

        await playNext(interaction.guild.id);
    },
};

async function playNext(guildId) {
    const queue = queues.get(guildId);
    if (!queue) return;
    const track = queue.tracks[queue.index];
    try {
        const source = await play.stream(track.url);
        const resource = createAudioResource(source.stream, { inputType: source.type });
        queue.player.play(resource);
        console.log(`Now playing: ${track.title}`);
    } catch (err) {
        console.error(`Failed to stream ${track.title}:`, err);
        queue.index++;
        if (queue.index < queue.tracks.length) {
            await playNext(guildId);
        } else {
            queues.delete(guildId);
            queue.connection.destroy();
        }
    }
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

