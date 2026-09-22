import { View, Text, TouchableOpacity } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';

export default function AudioMessage({ url }: { url: string }) {
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);

  const togglePlayback = async () => {
    if (status.playing) {
      player.pause();
    } else {
      player.seekTo(0);
      player.play();
    }
  };

  return (
    <TouchableOpacity
      onPress={togglePlayback}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
      }}
    >
      <Ionicons name={status.playing ? 'pause' : 'play'} size={24} color="#fff" />
      <Text style={{ color: '#fff', marginLeft: 8 }}>
        Audio message {status.duration ? `(${Math.round(status.duration)}s)` : ''}
      </Text>
    </TouchableOpacity>
  );
}
