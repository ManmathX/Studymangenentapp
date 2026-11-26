import { memo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { API_ORIGIN } from '../../config/env';

function monogram(exam) {
  const acronym = `${exam?.name ?? ''}`.match(/\(([A-Z]{2,5})\)/);
  if (acronym) return acronym[1];
  const short = exam?.shortName || exam?.name || '?';
  const words = short.split(/\s+/).filter(Boolean);
  if (words[0] && words[0].length <= 4 && words[0] === words[0].toUpperCase()) return words[0];
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/** The exam's logo from the server, or a coloured badge with its short name. */
export const ExamBadge = memo(function ExamBadge({ exam, size = 40 }) {
  const [broken, setBroken] = useState(false);
  const radius = Math.round(size / 4);
  if (exam?.logoUrl && !broken) {
    return <Image source={{ uri: `${API_ORIGIN}${exam.logoUrl}` }} style={{ width: size, height: size, borderRadius: radius }} onError={() => setBroken(true)} accessibilityIgnoresInvertColors />;
  }
  const text = monogram(exam);
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: radius, backgroundColor: exam?.color ?? '#8E8E93' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={[styles.text, { fontSize: size * (text.length > 3 ? 0.26 : 0.32) }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontWeight: '900', letterSpacing: 0.3 },
});
