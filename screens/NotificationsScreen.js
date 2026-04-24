import React, { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useWatchlist } from '../context/WatchlistContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

const BAND_COLORS = { fafo: '#F26A28', watching: '#E9A84B', mid: '#9A8878', cooked: '#1C1612' };
const BAND_EMOJIS = { fafo: '🔥', watching: '👀', mid: '😐', cooked: '💀' };

function relativeTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)    return 'just now';
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  const day = Math.floor(h / 24);
  if (day < 7)  return `${day}d ago`;
  return d.toLocaleDateString();
}

export default function NotificationsScreen({ navigation }) {
  const { notifications, markAllRead } = useWatchlist();

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  return (
    <View style={s.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color={C.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Alerts</Text>
          <View style={{ width: 26 }} />
        </View>

        {notifications.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyArt}>🔔</Text>
            <Text style={s.emptyTitle}>no alerts yet</Text>
            <Text style={s.emptySub}>
              save stocks on Discover — loopi will ping you when their vibe changes.
            </Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(n) => n.id}
            contentContainerStyle={{ paddingTop: 4, paddingBottom: 32 }}
            renderItem={({ item }) => {
              const band = item.band;
              const prev = item.previousBand;
              const color = BAND_COLORS[band] ?? C.muted;
              const emoji = BAND_EMOJIS[band] ?? '•';
              return (
                <TouchableOpacity
                  style={[s.row, !item.read && s.rowUnread]}
                  activeOpacity={0.75}
                  onPress={() => navigation.navigate('Discover')}
                >
                  <View style={[s.iconBubble, { backgroundColor: color }]}>
                    <Text style={s.iconEmoji}>{emoji}</Text>
                  </View>
                  <View style={s.body}>
                    <View style={s.titleRow}>
                      <Text style={s.ticker}>{item.ticker}</Text>
                      {prev && band && prev !== band && (
                        <View style={s.transition}>
                          <Text style={s.transPrev}>{prev}</Text>
                          <Text style={s.transArrow}>→</Text>
                          <Text style={[s.transNew, { color }]}>{band}</Text>
                        </View>
                      )}
                      <Text style={s.time}>{relativeTime(item.timestamp)}</Text>
                    </View>
                    <Text style={s.copy} numberOfLines={2}>{item.body}</Text>
                  </View>
                  {!item.read && <View style={s.unreadDot} />}
                </TouchableOpacity>
              );
            }}
            ItemSeparatorComponent={() => <View style={s.sep} />}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  headerTitle: { fontSize: 18, fontFamily: F.xbold, color: C.text },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyArt: { fontSize: 64, marginBottom: 20, opacity: 0.5 },
  emptyTitle: { fontSize: 20, fontFamily: F.xbold, color: C.text, marginBottom: 10 },
  emptySub: { fontSize: 14, fontFamily: F.regular, color: C.muted, textAlign: 'center', lineHeight: 21 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  rowUnread: { backgroundColor: '#FFF8F1' },
  iconBubble: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconEmoji: { fontSize: 18 },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 },
  ticker: { fontSize: 14, fontFamily: F.bold, color: C.text },
  transition: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  transPrev: { fontSize: 11, fontFamily: F.medium, color: C.muted, textDecorationLine: 'line-through' },
  transArrow: { fontSize: 11, color: C.muted },
  transNew:  { fontSize: 12, fontFamily: F.bold },
  time:  { fontSize: 11, fontFamily: F.regular, color: C.muted, marginLeft: 'auto' },
  copy:  { fontSize: 13, fontFamily: F.regular, color: C.sub, lineHeight: 19 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.orange },
  sep: { height: 1, backgroundColor: C.border, marginHorizontal: 20 },
});
