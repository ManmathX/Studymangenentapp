import { useCallback, useMemo } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { CheckRow } from '../../components/ui/Controls';
import { Card, IconTile, ThemedRefreshControl } from '../../components/ui/Layout';
import { Appear, CountUp } from '../../components/ui/Motion';
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
  ['Overdue', (item, today) => item.due < today, 'warn', 'danger'],
  ['Due today', (item, today) => item.due === today, 'bell', 'warning'],
  ['Due tomorrow', (item, today) => item.due === addDays(today, 1), 'today', 'tint'],
  ['This week', (item, today) => item.due > addDays(today, 1) && item.due <= addDays(today, 7), 'plan', 'tint'],
  ['Later', (item, today) => item.due > addDays(today, 7), 'clock', 'textSecondary'],
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
    const groups = GROUPS.map(([title, test, icon, tone]) => ({ key: title, title, icon, tone, data: open.data.filter((item) => test(item, today)) })).filter((group) => group.data.length);
    return [
      ...(groups.length ? groups : [{ key: 'none', title: 'Pending', icon: 'homework', tone: 'tint', data: [], empty: 'No homework pending. Nice! 🎉' }]),
      { key: 'bag', title: bag.data ? `Bag for ${dayName(bag.data.date, today)}` : 'Bag', icon: 'bag', tone: 'warning', meta: bag.data ? `${bag.data.packed} of ${bag.data.items.length}` : '', data: bag.data ? [bag.data] : [], kind: 'bag' },
      { key: 'done', title: 'Done', icon: 'check', tone: 'success', data: done.items, empty: done.loading ? null : 'Finished homework shows up here.' },
    ];
  }, [bag.data, done.items, done.loading, open.data, today]);

  const renderItem = useCallback(
    ({ item, section, index }) => (
      <Appear delay={Math.min(index, 6) * 40}>
        {section.kind === 'bag' ? <BagCard bag={item} /> : <HomeworkRow item={item} today={today} onToggle={toggle.execute} onDelete={remove.execute} disabled={busy} />}
      </Appear>
    ),
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
      renderSectionHeader={({ section }) => <SectionHeader title={section.title} icon={section.icon} tone={section.tone} meta={section.meta ?? (section.key === 'done' ? '' : String(section.data.length))} />}
      renderSectionFooter={({ section }) => (section.empty && !section.data.length ? <EmptyState icon={section.key === 'done' ? 'check' : 'star'} message={section.empty} /> : null)}
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
        <Tile value={summary.dueThisWeek} label="Due in 7 days" icon="bell" color={colors.tint} />
        <Tile value={summary.doneThisWeek} label="Done this week" icon="check" color={colors.success} />
      </View>
      <Button title="Add homework" icon="plus" variant="primary" block onPress={onAdd} testID="add-homework" />
    </View>
  );
}

function Tile({ value, label, icon, color }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.tile}>
      <IconTile name={icon} color={color} size={34} />
      <View>
        <CountUp value={value} style={{ color: colors.text, fontSize: 22, fontWeight: '900' }} />
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      </View>
    </Card>
  );
}

function SectionHeader({ title, meta, icon, tone }) {
  const { colors } = useTheme();
  const color = colors[tone] ?? colors.tint;
  return (
    <View style={styles.sectionHeader}>
      {icon ? <IconTile name={icon} color={color} size={24} /> : null}
      <Text style={[styles.sectionTitle, { color: tone === 'danger' ? colors.danger : colors.text }]} accessibilityRole="header">
        {title}
      </Text>
      {meta ? (
        <View style={[styles.metaPill, { backgroundColor: colors.fill }]}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{meta}</Text>
        </View>
      ) : null}
    </View>
  );
}

function BagCard({ bag }) {
  const { colors } = useTheme();
  const toggle = (item) => habitActions.setBagItem(bag.date, item.id, !item.checked);
  return (
    <Card flush style={styles.bag}>
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
      <Text style={[styles.bagFoot, { color: colors.textSecondary }]}>Tick each thing as you pack it. Built from your timetable and homework due.</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 32, width: '100%', alignSelf: 'center' },
  header: { gap: 10, marginBottom: 4 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 18, paddingBottom: 10, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '800', flex: 1 },
  metaPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  bag: { paddingBottom: 8, marginBottom: 4 },
  periods: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  period: { fontSize: 11.5, fontWeight: '600', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  bagFoot: { fontSize: 12, paddingHorizontal: 14, paddingTop: 2, lineHeight: 16 },
  footer: { marginVertical: 16 },
});
