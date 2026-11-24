import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoadingState } from '../components/ui/States';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { ClassStep, SchoolDayStep, SubjectsStep, TaughtStep, TestsStep, WelcomeStep } from '../screens/onboarding/OnboardingSteps';
import { useAuthStore } from '../store/authStore';
import { MainTabs } from './MainTabs';

const Stack = createNativeStackNavigator();

/* Modal screens load on first use to keep start-up light. */
const lazy = {
  Privacy: () => require('../screens/sharing/PrivacyScreen').PrivacyScreen,
  Syllabus: () => require('../screens/modals/SyllabusScreen').SyllabusScreen,
  ScheduleChapter: () => require('../screens/modals/ScheduleChapterScreen').ScheduleChapterScreen,
  NewHomework: () => require('../screens/modals/NewHomeworkScreen').NewHomeworkScreen,
  NewExam: () => require('../screens/modals/NewExamScreen').NewExamScreen,
  ChangePassword: () => require('../screens/account/ChangePasswordScreen').ChangePasswordScreen,
  DeleteAccount: () => require('../screens/account/DeleteAccountScreen').DeleteAccountScreen,
};

/** Signed out → sign-in screens; signed in but not set up → setup; otherwise the app. */
export function RootNavigator() {
  const status = useAuthStore((state) => state.status);
  const onboarded = useAuthStore((state) => state.onboarded);

  if (status === 'booting') return <LoadingState label="Restoring your session" />;

  if (status === 'signedOut') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      </Stack.Navigator>
    );
  }

  if (!onboarded) {
    return (
      <Stack.Navigator screenOptions={{ headerBackTitle: 'Back', title: '' , headerShadowVisible: false }}>
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
    <Stack.Navigator>
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Privacy" getComponent={lazy.Privacy} options={{ title: 'Settings', headerBackTitle: 'Back' }} />
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="Syllabus" getComponent={lazy.Syllabus} options={{ title: 'Syllabus' }} />
        <Stack.Screen name="ScheduleChapter" getComponent={lazy.ScheduleChapter} options={{ title: 'Schedule' }} />
        <Stack.Screen name="NewHomework" getComponent={lazy.NewHomework} options={{ title: 'New Homework' }} />
        <Stack.Screen name="NewExam" getComponent={lazy.NewExam} options={{ title: 'New Test' }} />
        <Stack.Screen name="EditExam" getComponent={lazy.NewExam} options={{ title: 'Edit Test' }} />
        <Stack.Screen name="ChangePassword" getComponent={lazy.ChangePassword} options={{ title: 'Change Password' }} />
        <Stack.Screen name="DeleteAccount" getComponent={lazy.DeleteAccount} options={{ title: 'Delete Account' }} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
