import { useCallback, useMemo } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { CheckRow } from '../../components/ui/Controls';
import { ThemedRefreshControl } from '../../components/ui/Layout';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { homeworkApi } from '../../data/api';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { usePagedList } from '../../hooks/usePagedList';
import { useResource } from '../../hooks/useResource';
import { habitActions, homeworkActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useTheme } from '../../theme/ThemeProvider';
import { addDays, dayName } from '../../utils/format';
import { HomeworkRow } from './HomeworkRow';

const GROUPS = [
  ['Overdue', (item, today) => item.due < today],
  ['Due today', (item, today) => item.due === today],
  ['Due tomorrow', (item, today) => item.due === addDays(today, 1)],
  ['This week', (item, today) => item.due > addDays(today, 1) && item.due <= addDays(today, 7)],
  ['Later', (item, today) => item.due > addDays(today, 7)],
];

const loadDonePage = (page) => homeworkApi.page('done', page);

export function HomeworkScreen({ navigation }) {
  const { colors, layout } = useTheme();
  const summary = useResource(resources.homeworkSummary);
  const open = useResource(resources.homeworkOpen);
  const bag = useResource(resources.bag);
  const done = usePagedList(loadDonePage);
  const toggle = useAsyncAction(homeworkActions.toggleDone);
  const remove = useAsyncAction(homeworkActions.remove);
  const busy = toggle.pending || remove.pending;
  const today = summary.data?.today;

  const sections = useMemo(() => {
    if (!today || !open.data) return [];
    const groups = GROUPS.map(([title, test]) => ({ key: title, title, data: open.data.filter((item) => test(item, today)) })).filter((group) => group.data.length);
    return [
      ...(groups.length ? groups : [{ key: 'none', title: 'Pending', data: [], empty: 'No homework pending.' }]),
      { key: 'bag', title: bag.data ? `Bag for ${dayName(bag.data.date, today)}` : 'Bag', meta: bag.data ? `${bag.data.packed} of ${bag.data.items.length}` : '', data: bag.data ? [bag.data] : [], kind: 'bag' },
      { key: 'done', title: 'Done', data: done.items, empty: done.loading ? null : 'Finished homework shows up here.' },
    ];
  }, [bag.data, done.items, done.loading, open.data, today]);

  const renderItem = useCallback(
    ({ item, section }) =>
      section.kind === 'bag' ? <BagCard bag={item} /> : <HomeworkRow item={item} today={today} onToggle={toggle.execute} onDelete={remove.execute} disabled={busy} />,
    [today, toggle.execute, remove.execute, busy],
  );

  const refresh = useCallback(() => {
    summary.refresh();
    open.refresh();
    bag.refresh();
    done.reload();
  }, [bag, done, open, summary]);

  if (summary.isLoading || open.isLoading) return <LoadingState />;
  if ((summary.error && !summary.data) || (open.error && !open.data)) return <ErrorState error={summary.error ?? open.error} onRetry={refresh} />;

  return (
    <SectionList
      testID="homework-screen"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { maxWidth: layout.maxContentWidth }]}
      sections={sections}
      keyExtractor={(item, index) => item.id ?? item.date ?? String(index)}
      renderItem={renderItem}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => <SectionHeader title={section.title} meta={section.meta ?? (section.key === 'done' ? '' : String(section.data.length))} />}
      renderSectionFooter={({ section }) => (section.empty && !section.data.length ? <EmptyState message={section.empty} /> : null)}
      ListHeaderComponent={<Header summary={summary.data} onAdd={() => navigation.navigate('NewHomework')} />}
      ListFooterComponent={done.loading ? <ActivityIndicator style={styles.footer} /> : done.error ? <ErrorState error={done.error} onRetry={done.retry} /> : null}
      onEndReached={done.loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={<ThemedRefreshControl refreshing={summary.isRefreshing || open.isRefreshing} onRefresh={refresh} />}
      initialNumToRender={12}
      windowSize={7}
    />
  );
}

function Header({ summary, onAdd }) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.tiles}>
        <Tile value={summary.dueThisWeek} label="Due in the next 7 days" color={colors.tint} />
        <Tile value={summary.doneThisWeek} label="Done this week" color={colors.success} />
      </View>
      <Button title="Add homework" icon="plus" variant="primary" block onPress={onAdd} testID="add-homework" />
    </View>
  );
}

function Tile({ value, label, color }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.card }]}>
      <Text style={{ color, fontSize: 30, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, meta }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }} accessibilityRole="header">
        {title}
      </Text>
      {meta ? <Text style={{ color: colors.textSecondary }}>{meta}</Text> : null}
    </View>
  );
}

function BagCard({ bag }) {
  const { colors } = useTheme();
  const toggle = (item) => habitActions.setBagItem(bag.date, item.id, !item.checked);
  return (
    <View style={[styles.bag, { backgroundColor: colors.card }]}>
      <View style={styles.periods} accessibilityLabel="Periods">
        {bag.periods.map((period) => (
          <Text key={period.number} style={[styles.period, { color: colors.textSecondary, backgroundColor: colors.fill }]}>
            {period.number} {period.label}
          </Text>
        ))}
      </View>
      {bag.items.map((item) => (
        <CheckRow key={item.id} label={item.label} checked={item.checked} onToggle={() => toggle(item)} />
      ))}
      <Text style={[styles.bagFoot, { color: colors.textSecondary }]}>Built from the timetable and the homework due.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, width: '100%', alignSelf: 'center' },
  header: { gap: 12, marginBottom: 8 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderRadius: 16, padding: 14 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 18, paddingBottom: 8, paddingHorizontal: 4 },
  bag: { borderRadius: 16, overflow: 'hidden', paddingBottom: 8 },
  periods: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 14 },
  period: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  bagFoot: { fontSize: 12, paddingHorizontal: 16, paddingTop: 4 },
  footer: { marginVertical: 16 },
});
