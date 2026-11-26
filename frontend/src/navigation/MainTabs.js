import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Icon } from '../components/ui/Icon';
import { useResource } from '../hooks/useResource';
import { resources } from '../services/resources';
import { HabitsScreen } from '../screens/habits/HabitsScreen';
import { HomeworkScreen } from '../screens/homework/HomeworkScreen';
import { PlanScreen } from '../screens/plan/PlanScreen';
import { ProgressScreen } from '../screens/progress/ProgressScreen';
import { TodayScreen } from '../screens/today/TodayScreen';
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
  { name: 'Today', component: TodayScreen, icon: 'today' },
  { name: 'Plan', component: PlanPage, icon: 'plan' },
  { name: 'Progress', component: ProgressPage, icon: 'progress' },
];

const renderAvatar = () => <HeaderAvatar />;

export function MainTabs() {
  // Loads the profile up front: it carries the names and colours of the student's subjects.
  useResource(resources.profile);
  return (
    <Tab.Navigator screenOptions={{ headerRight: renderAvatar, headerTitleStyle: { fontWeight: '700', fontSize: 20 } }}>
      {TABS.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            tabBarIcon: ({ color, size }) => <Icon name={tab.icon} color={color} size={size} />,
            tabBarButtonTestID: `tab-${tab.name}`,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}
