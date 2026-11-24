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

const Tab = createBottomTabNavigator();

const TABS = [
  { name: 'Today', component: TodayScreen, icon: 'today' },
  { name: 'Plan', component: PlanScreen, icon: 'plan' },
  { name: 'Progress', component: ProgressScreen, icon: 'progress' },
  { name: 'Habits', component: HabitsScreen, icon: 'habits' },
  { name: 'Homework', component: HomeworkScreen, icon: 'homework' },
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
