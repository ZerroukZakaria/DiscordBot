const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const { youtubeToken } = require('../../../config.json');
const youtubeAPI = 'https://www.googleapis.com/youtube/v3/playlistItems';


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
        const playlistUrl1 = interaction.options.getString('playlist1');
        const playlistUrl2 = interaction.options.getString('playlist2');

        const playlistId1 = extractPlaylistId(playlistUrl1); // Extract playlist ID from URL
        const playlistId2 = extractPlaylistId(playlistUrl2); // Extract playlist ID from URL

        const mergedPlaylist = await mergeAndShufflePlaylists(playlistId1, playlistId2);
        await playPlaylist(interaction, mergedPlaylist);

        return interaction.reply('Now playing songs from both playlists!');
    },
};


async function playSong(interaction, songUrl) {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
        return interaction.reply("You need to join a voice channel first!");
    }

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
    });

    connection.on(VoiceConnectionStatus.Ready, () => {
        console.log("Successfully connected to the voice channel!");
    });

    const stream = ytdl(songUrl, { filter: 'audioonly' });
    const resource = createAudioResource(stream, { inputType: AudioPlayerStatus.Playing });

    const player = createAudioPlayer();
    player.play(resource);

    connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
        console.log('Song finished, playing next song.');
        connection.disconnect();
    });
}



async function mergeAndShufflePlaylists(playlistId1, playlistId2) {
    const playlist1 = await getPlaylistVideos(playlistId1);
    const playlist2 = await getPlaylistVideos(playlistId2);
    const mergedPlaylists = [...playlist1, ...playlist2];
    shuffle(mergedPlaylists);
    return mergedPlaylists;
}

async function getPlaylistVideos(playlistId) {
    const url = `${youtubeAPI}?part=snippet&maxResults=50&playlistId=${playlistId}&key=${youtubeToken}`;
    try {
        const response = await axios.get(url);
        return response.data.items.map(item => ({
            title: item.snippet.title,
            videoUrl: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
        }));
    } catch (error) {
        console.error(error);
        return [];
    }
}


const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // Swap elements
    }
};


function extractPlaylistId(url) {
    const regex = /(?:list=)([a-zA-Z0-9_-]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

