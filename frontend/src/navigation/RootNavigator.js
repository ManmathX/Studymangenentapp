import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoadingState } from '../components/ui/States';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { ClassStep, SchoolDayStep, SubjectsStep, TaughtStep, TestsStep, WelcomeStep } from '../screens/onboarding/OnboardingSteps';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../theme/ThemeProvider';
import { MainTabs } from './MainTabs';

const Stack = createNativeStackNavigator();

/* Modal screens load on first use to keep start-up light. */
const lazy = {
  Profile: () => require('../screens/profile/ProfileScreen').ProfileScreen,
  Syllabus: () => require('../screens/modals/SyllabusScreen').SyllabusScreen,
  ScheduleChapter: () => require('../screens/modals/ScheduleChapterScreen').ScheduleChapterScreen,
  NewHomework: () => require('../screens/modals/NewHomeworkScreen').NewHomeworkScreen,
  EditExam: () => require('../screens/modals/EditExamScreen').EditExamScreen,
  EditTask: () => require('../screens/modals/EditTaskScreen').EditTaskScreen,
  NewDatesheet: () => require('../screens/modals/NewDatesheetScreen').NewDatesheetScreen,
  DeleteAccount: () => require('../screens/account/DeleteAccountScreen').DeleteAccountScreen,
};

/** Signed out → sign-in screens; signed in but not set up → setup; otherwise the app. */
export function RootNavigator() {
  const status = useAuthStore((state) => state.status);
  const onboarded = useAuthStore((state) => state.onboarded);
  const { colors } = useTheme();
  // Headers blend into the page: same colour, no shadow line, bold title.
  const header = {
    headerStyle: { backgroundColor: colors.background },
    headerShadowVisible: false,
    headerTitleStyle: { fontWeight: '800', fontSize: 18, color: colors.text },
    headerTintColor: colors.tint,
  };

  if (status === 'booting') return <LoadingState label="Restoring your session" />;

  if (status === 'signedOut') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* Students sign in, and sign up, with Google only. */}
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  if (!onboarded) {
    return (
      <Stack.Navigator screenOptions={{ ...header, headerBackTitle: 'Back', title: '' }}>
        <Stack.Screen name="Welcome" component={WelcomeStep} options={{ headerShown: false }} />
        <Stack.Screen name="ClassStep" component={ClassStep} />
        <Stack.Screen name="SubjectsStep" component={SubjectsStep} />
        <Stack.Screen name="TaughtStep" component={TaughtStep} />
        <Stack.Screen name="TestsStep" component={TestsStep} />
        <Stack.Screen name="SchoolDayStep" component={SchoolDayStep} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={header}>
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" getComponent={lazy.Profile} options={{ title: 'My Profile', headerBackTitle: 'Back' }} />
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="Syllabus" getComponent={lazy.Syllabus} options={{ title: 'Pick a chapter' }} />
        <Stack.Screen name="ScheduleChapter" getComponent={lazy.ScheduleChapter} options={{ title: 'Plan this chapter' }} />
        <Stack.Screen name="NewHomework" getComponent={lazy.NewHomework} options={{ title: 'Add homework' }} />
        <Stack.Screen name="EditExam" getComponent={lazy.EditExam} options={{ title: 'Edit test' }} />
        <Stack.Screen name="EditTask" getComponent={lazy.EditTask} options={{ title: 'Edit task' }} />
        <Stack.Screen name="NewDatesheet" getComponent={lazy.NewDatesheet} options={{ title: 'Add a test' }} />
        <Stack.Screen name="DeleteAccount" getComponent={lazy.DeleteAccount} options={{ title: 'Delete account' }} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
