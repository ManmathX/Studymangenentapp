import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore } from '../../store/toastStore';

/** Global confirmation messages, announced to screen readers. */
export function Toast() {
  const message = useToastStore((state) => state.message);
  const tone = useToastStore((state) => state.tone);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    Animated.timing(opacity, { toValue: message ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [message, opacity]);

  if (!message) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, { opacity, bottom: insets.bottom + 72, backgroundColor: tone === 'error' ? '#C62828' : 'rgba(28,28,30,0.94)' }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: { position: 'absolute', left: 16, right: 16, alignSelf: 'center', maxWidth: 560, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14 },
  text: { color: '#fff', fontSize: 15, textAlign: 'center' },
});
