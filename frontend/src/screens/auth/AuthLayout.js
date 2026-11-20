import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../../components/ui/Icon';
import { useTheme } from '../../theme/ThemeProvider';

export function AuthLayout({ title, subtitle, children }) {
  const { colors, layout } = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { maxWidth: layout.maxContentWidth }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.logo, { backgroundColor: colors.tint }]}>
            <Icon name="plan" size={34} color="#fff" strokeWidth={2.5} />
          </View>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
          <View style={styles.form}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 24, paddingTop: 48, gap: 8, width: '100%', alignSelf: 'center' },
  logo: { width: 68, height: 68, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 32, fontWeight: '800', lineHeight: 38 },
  subtitle: { fontSize: 16, lineHeight: 22 },
  form: { gap: 14, marginTop: 24 },
});
