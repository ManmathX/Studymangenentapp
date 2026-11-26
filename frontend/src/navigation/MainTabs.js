import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/ui/Icon';
import { nativeDriver, useReducedMotion } from '../components/ui/Motion';
import { useResource } from '../hooks/useResource';
import { resources } from '../services/resources';
import { HabitsScreen } from '../screens/habits/HabitsScreen';
import { HomeworkScreen } from '../screens/homework/HomeworkScreen';
import { PlanScreen } from '../screens/plan/PlanScreen';
import { ProgressScreen } from '../screens/progress/ProgressScreen';
import { TodayScreen } from '../screens/today/TodayScreen';
import { useTheme } from '../theme/ThemeProvider';
import { HeaderAvatar } from './HeaderAvatar';
import { SectionPage } from './SectionPage';

const Tab = createBottomTabNavigator();

/** Three-page app. Today = do it; Plan = schedule it; Progress = look back and keep habits. */
const PLAN_SECTIONS = [
  { value: 'plan', label: 'Plan', component: PlanScreen },
  { value: 'homework', label: 'Homework', component: HomeworkScreen },
];

const PROGRESS_SECTIONS = [
  { value: 'progress', label: 'Progress', component: ProgressScreen },
  { value: 'habits', label: 'Focus & habits', component: HabitsScreen },
];

function PlanPage(props) {
  return <SectionPage sections={PLAN_SECTIONS} label="Plan sections" {...props} />;
}

function ProgressPage(props) {
  return <SectionPage sections={PROGRESS_SECTIONS} label="Progress sections" {...props} />;
}

const TABS = [
  { name: 'Today', component: TodayScreen, icon: 'today', title: 'Today' },
  { name: 'Plan', component: PlanPage, icon: 'plan', title: 'My Plan' },
  { name: 'Progress', component: ProgressPage, icon: 'progress', title: 'My Progress' },
];

/** Tab icon that sits in a soft pill and hops up a little when its tab is chosen. */
function TabIcon({ name, color, focused }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [lift] = useState(() => new Animated.Value(focused ? 1 : 0));
  useEffect(() => {
    if (reduced) lift.setValue(focused ? 1 : 0);
    else Animated.spring(lift, { toValue: focused ? 1 : 0, useNativeDriver: nativeDriver, speed: 18, bounciness: 12 }).start();
  }, [focused, lift, reduced]);
  return (
    <Animated.View
      style={[
        styles.tabIcon,
        {
          backgroundColor: focused ? colors.tintSoft : 'transparent',
          transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }, { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
        },
      ]}
    >
      <Icon name={name} color={color} size={21} strokeWidth={focused ? 2.6 : 2} />
    </Animated.View>
  );
}

const renderAvatar = () => <HeaderAvatar />;

export function MainTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Loads the profile up front: it carries the names and colours of the student's subjects.
  useResource(resources.profile);
  return (
    <Tab.Navigator
      screenOptions={{
        headerRight: renderAvatar,
        headerTitleAlign: 'left',
        headerTitleStyle: { fontWeight: '800', fontSize: 22, color: colors.text },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.separator, height: 66 + insets.bottom, paddingTop: 5, paddingBottom: insets.bottom + 5 },
        tabBarItemStyle: styles.tabItem,
      }}
    >
      {TABS.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            title: tab.title,
            tabBarLabel: tab.name,
            tabBarIcon: ({ color, focused }) => <TabIcon name={tab.icon} color={color} focused={focused} />,
            tabBarButtonTestID: `tab-${tab.name}`,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabIcon: { width: 48, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tabItem: { gap: 2 },
  tabLabel: { fontSize: 11.5, fontWeight: '700' },
});
