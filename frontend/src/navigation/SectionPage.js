import { StyleSheet, View } from 'react-native';
import { SegmentedControl } from '../components/ui/Controls';
import { useTheme } from '../theme/ThemeProvider';

/**
 * A tab that holds several screens behind a segmented control. The chosen section lives in the
 * route params (`section`), so other screens can open one with
 * `navigation.navigate('<Tab>', { section: '<value>' })`.
 */
export function SectionPage({ sections, label, navigation, route }) {
  const { colors, layout } = useTheme();
  const value = sections.some((section) => section.value === route.params?.section) ? route.params.section : sections[0].value;
  const Current = sections.find((section) => section.value === value).component;
  // `at` asks a screen to jump somewhere once; drop it when switching so returning doesn't replay it.
  const choose = (next) => navigation.setParams({ section: next, at: undefined });
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.bar, { maxWidth: layout.maxContentWidth }]}>
        <SegmentedControl label={label} value={value} onChange={choose} options={sections.map(({ value: v, label: l }) => ({ value: v, label: l }))} />
      </View>
      <View style={styles.root}>
        <Current key={value} navigation={navigation} route={route} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { width: '100%', alignSelf: 'center', paddingHorizontal: 14, paddingTop: 2, paddingBottom: 2 },
});
