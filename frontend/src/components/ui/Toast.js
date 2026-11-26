import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore } from '../../store/toastStore';
import { Icon } from './Icon';
import { nativeDriver } from './Motion';

/** Global confirmation messages that spring up from the bottom, announced to screen readers. */
export function Toast() {
  const message = useToastStore((state) => state.message);
  const tone = useToastStore((state) => state.tone);
  const [progress] = useState(() => new Animated.Value(0));
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (message) {
      progress.setValue(0);
      Animated.spring(progress, { toValue: 1, useNativeDriver: nativeDriver, speed: 16, bounciness: 9 }).start();
    }
  }, [message, progress]);

  if (!message) return null;
  const error = tone === 'error';
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        {
          bottom: insets.bottom + 74,
          backgroundColor: error ? '#D92D4B' : 'rgba(22,23,43,0.95)',
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }, { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
        },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={[styles.icon, { backgroundColor: error ? 'rgba(255,255,255,0.22)' : '#22C55E' }]}>
        <Icon name={error ? 'warn' : 'check'} size={14} color="#fff" strokeWidth={3} />
      </View>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignSelf: 'center',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 16,
    boxShadow: '0px 8px 24px rgba(0,0,0,0.22)',
  },
  icon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontSize: 14.5, fontWeight: '600', flex: 1, lineHeight: 19 },
});
