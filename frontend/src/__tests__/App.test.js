import { fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { __files } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import App from '../App';
import { examsApi, profileApi } from '../data/api';
import { setClockForTests } from '../data/clock';
import { persistNow, resetForTests } from '../data/db';
import { CATALOG } from '../data/__tests__/helpers';
import { http } from '../services/api/client';
import { useAuthStore } from '../store/authStore';
import { useOnboardingStore } from '../store/onboardingStore';
import { useResourceStore } from '../store/resourceStore';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: [] })) }));
// The app signs in with Google only. The native account picker is faked; the API answers /auth/google.
jest.mock('../services/googleSignIn', () => ({
  googleSignInAvailable: true,
  getGoogleIdToken: jest.fn(async () => 'google-id-token-from-the-account-picker'),
  renderGoogleButton: jest.fn(),
  signOutOfGoogle: jest.fn(async () => {}),
}));

const server = new MockAdapter(http);
/** Token refresh goes through plain axios so it never loops through the retry interceptor. */
const refreshServer = new MockAdapter(axios);

const MEERA = { id: '665f1c2b9a1e4b0012345678', name: 'Meera', email: 'meera@example.test', role: 'student', hasPassword: false };
const RAVI = { id: '665f1c2b9a1e4b0087654321', name: 'Ravi', email: 'ravi@example.test', role: 'student', hasPassword: false };
const TOKENS = { accessToken: 'access', refreshToken: 'refresh', tokenType: 'Bearer', expiresIn: 900 };
const ok = (data) => [200, { success: true, data }];
const plannerFile = (user) => `file:///documents/planner-${user.id}.json`;

/** The server only knows logins and the syllabus catalogue. */
function serverFor(user) {
  server.onPost('/auth/google').reply(() => ok({ user, tokens: TOKENS }));
  server.onPost('/auth/logout').reply(204);
  server.onGet('/auth/me').reply(() => ok({ user }));
  server.onDelete('/auth/account').reply(204);
  server.onGet('/syllabus/boards').reply(() => ok([{ code: 'cbse', name: 'CBSE', kind: 'national', position: 0 }]));
  server.onGet('/syllabus/classes').reply(() => ok([6, 7, 8, 9, 10, 11, 12].map((cls) => ({ cls, available: cls === 9 }))));
  server.onGet('/syllabus/9').reply(() => ok(CATALOG));
  refreshServer.onPost(/\/auth\/refresh$/).reply(() => ok(TOKENS));
}

const press = (testID) => fireEvent.press(screen.getByTestId(testID));
const savedPlanner = async (user) => {
  await persistNow();
  const text = __files.get(plannerFile(user));
  return text === undefined ? undefined : JSON.parse(text);
};

/** Taps "Continue with Google"; `serverFor(user)` decides which account Google signs in as. */
async function signIn() {
  await screen.findByTestId('google-sign-in');
  await press('google-sign-in');
}

async function setUp() {
  await press(await screen.findByTestId('onboarding-start').then(() => 'onboarding-start'));
  for (const step of ['class-9', 'class-continue', 'subjects-continue', 'taught-continue', 'tests-continue', 'build-plan']) {
    await screen.findByTestId(step);
    await press(step);
  }
  expect(await screen.findByTestId('today-screen')).toBeTruthy();
}

async function openProfile() {
  await fireEvent.press((await screen.findAllByLabelText(/^Profile/))[0]);
  return screen.findByTestId('profile-screen');
}

function freshLaunch() {
  resetForTests();
  useAuthStore.setState({ status: 'booting', user: null, onboarded: false });
  useOnboardingStore.getState().reset();
  useResourceStore.getState().reset();
}

beforeEach(() => {
  jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  __files.clear();
  SecureStore.__reset();
  server.reset();
  server.resetHistory();
  refreshServer.reset();
  setClockForTests(new Date('2026-11-18T06:00:00.000Z'));
  freshLaunch();
});

afterEach(() => {
  // Nothing the student enters may reach the server: only sign-in and the syllabus catalogue.
  for (const request of server.history) expect(request.url).toMatch(/^\/(auth|syllabus)\//);
});

describe('the app, with the plan kept on the phone', () => {
  it('signs in, sets up, and saves the plan only on the phone', async () => {
    serverFor(MEERA);
    await render(<App />);
    await signIn(MEERA);
    expect(await screen.findByText(/Hi Meera\./)).toBeTruthy();
    await setUp();

    expect(await screen.findByText('No tests added yet')).toBeTruthy();
    const saved = await savedPlanner(MEERA);
    expect(saved.profile).toMatchObject({ name: 'Meera', cls: 9, board: 'cbse', boardName: 'CBSE' });
    expect(saved.chapters.length).toBe(CATALOG.reduce((sum, subject) => sum + subject.chapters.length, 0));
    expect(server.history.map((request) => request.url)).toEqual(expect.arrayContaining(['/auth/google', '/syllabus/9']));
  });

  it('adds a unit test to the datesheet on the phone and plans its study slots', async () => {
    serverFor(MEERA);
    await render(<App />);
    await signIn(MEERA);
    await setUp();

    await fireEvent.press(await screen.findByText('Add your datesheet'));
    expect(await screen.findByTestId('builder-paper-maths')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('datesheet-name'), 'UT 1');
    for (const subject of ['Science', 'Social Science', 'English', 'Hindi']) await fireEvent(screen.getByLabelText(`${subject} paper`), 'valueChange', false);
    await press('datesheet-submit');

    expect(await screen.findByText(/UT 1: 1 paper on your datesheet/)).toBeTruthy();
    const saved = await savedPlanner(MEERA);
    expect(saved.exams).toEqual([expect.objectContaining({ name: 'UT 1: Maths', subject: 'maths', seriesName: 'UT 1', kind: 'unit', chapterKeys: ['maths-1', 'maths-2'] })]);
    expect(saved.tasks.length).toBeGreaterThan(0);
    expect(saved.tasks.every((task) => task.examId === saved.exams[0].id)).toBe(true);
  });

  it('loads the demo student, saves a backup and starts over', async () => {
    serverFor(MEERA);
    await render(<App />);
    await signIn(MEERA);
    await press(await screen.findByTestId('onboarding-demo').then(() => 'onboarding-demo'));

    expect(await screen.findByTestId('today-screen')).toBeTruthy();
    expect(await screen.findByText(/-day streak\./)).toBeTruthy();
    // Three tabs; Plan and Progress each hold two sections behind a segmented control.
    for (const [tab, section, screenId] of [
      ['Plan', null, 'plan-screen'],
      ['Plan', 'Homework', 'homework-screen'],
      ['Progress', null, 'progress-screen'],
      ['Progress', 'Focus & habits', 'habits-screen'],
    ]) {
      await press(`tab-${tab}`);
      if (section) await fireEvent.press(await screen.findByRole('radio', { name: section }));
      expect(await screen.findByTestId(screenId)).toBeTruthy();
    }

    await openProfile();
    expect(await screen.findByText('Meera')).toBeTruthy();
    expect(screen.getByText(/saved only on this phone, never on our server/)).toBeTruthy();

    await press('export-backup');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.stringMatching(/study-planner-backup-2026-11-18\.json$/), expect.objectContaining({ mimeType: 'application/json' }));
    const backup = JSON.parse(__files.get('file:///cache/study-planner-backup-2026-11-18.json'));
    expect(backup).toMatchObject({ app: 'study-planner', data: { profile: { name: 'Meera', isDemo: true } } });

    await press('start-over');
    await press('start-over');
    expect(await screen.findByTestId('onboarding-start')).toBeTruthy();
    expect((await savedPlanner(MEERA)).profile).toBeNull();
  });

  it('runs the focus timer and customises the routine on Focus & habits', async () => {
    serverFor(MEERA);
    await render(<App />);
    await signIn(MEERA);
    await press(await screen.findByTestId('onboarding-demo').then(() => 'onboarding-demo'));
    await screen.findByTestId('today-screen');
    await press('tab-Progress');
    await fireEvent.press(await screen.findByRole('radio', { name: 'Focus & habits' }));
    await screen.findByTestId('habits-screen');

    expect(await screen.findByText('READY')).toBeTruthy();
    await press('timer-toggle');
    expect(await screen.findByText('FOCUSING')).toBeTruthy();
    await press('timer-toggle');
    expect(await screen.findByText('PAUSED')).toBeTruthy();
    // Under a minute in, discarding needs no confirmation and logs nothing.
    await press('timer-discard');
    expect(await screen.findByText('READY')).toBeTruthy();

    await press('habit-morning-0');
    expect(await screen.findByText('1 of 6 today')).toBeTruthy();
    expect((await savedPlanner(MEERA)).dailyLogs['2026-11-18'].ticks).toEqual({ 'morning-0': true });

    // Customise the routine: add swimming from the suggestions, then tick it.
    await press('routine-add');
    await press(await screen.findByTestId('suggestion-swimming').then(() => 'suggestion-swimming'));
    await press('habit-save');
    expect(await screen.findByText('Swimming')).toBeTruthy();
    expect(await screen.findByText('1 of 7 today')).toBeTruthy();
    const swimming = (await savedPlanner(MEERA)).profile.routine.find((habit) => habit.name === 'Swimming');
    expect(swimming).toMatchObject({ icon: 'waves', part: 'afternoon', days: [0, 1, 2, 3, 4, 5, 6] });
    await press(`habit-${swimming.id}`);
    expect(await screen.findByText('2 of 7 today')).toBeTruthy();
  });

  it('adds several tuitions at setup and edits, removes and adds them later in Profile', async () => {
    serverFor(MEERA);
    await render(<App />);
    await signIn(MEERA);
    await press(await screen.findByTestId('onboarding-start').then(() => 'onboarding-start'));
    for (const step of ['class-9', 'class-continue', 'subjects-continue', 'taught-continue', 'tests-continue']) {
      await screen.findByTestId(step);
      await press(step);
    }
    // The first tuition is there already (Mon, Wed, Fri 16:00 to 17:30); name it and add a Saturday one.
    await fireEvent.changeText(await screen.findByTestId('tuition-0-name'), 'Maths tuition');
    await press('add-tuition');
    await fireEvent.changeText(screen.getByTestId('tuition-1-name'), 'Science tuition');
    await press('tuition-1-day-6');
    await press('build-plan');
    await screen.findByTestId('today-screen');
    expect((await savedPlanner(MEERA)).profile.tuitions).toEqual([
      { name: 'Maths tuition', days: [1, 3, 5], start: 960, end: 1050 },
      { name: 'Science tuition', days: [6], start: 1050, end: 1110 },
    ]);

    // Later: Maths tuition runs to 18:00, Science stops, and a new Tuesday tuition starts.
    await openProfile();
    await fireEvent.press(screen.getByLabelText('More Maths tuition ends'));
    await fireEvent.press(screen.getByLabelText('More Maths tuition ends'));
    await press('remove-tuition-1');
    await press('add-tuition');
    await press('save-timings');
    expect(await screen.findByText('Pick the days for Tuition 2.')).toBeTruthy();
    await press('tuition-1-day-2');
    await press('save-timings');
    expect(await screen.findByText(/Timings saved/)).toBeTruthy();
    expect((await savedPlanner(MEERA)).profile.tuitions).toEqual([
      { name: 'Maths tuition', days: [1, 3, 5], start: 960, end: 1080 },
      { name: '', days: [2], start: 1080, end: 1140 },
    ]);
  });

  it('signs in with Google only: no email, password, sign-up or forgot-password on the phone', async () => {
    serverFor(MEERA);
    await render(<App />);
    expect(await screen.findByTestId('google-sign-in')).toBeTruthy();
    for (const gone of ['field-email', 'field-password', 'login-submit', 'open-forgot-password']) expect(screen.queryByTestId(gone)).toBeNull();
    expect(screen.queryByText(/Create an account/)).toBeNull();

    await signIn(MEERA);
    expect(await screen.findByText(/Hi Meera\./)).toBeTruthy();
    const google = server.history.find((request) => request.url === '/auth/google');
    expect(JSON.parse(google.data)).toEqual({ idToken: 'google-id-token-from-the-account-picker' });

    // A Google account has no password, so Settings offers no "Change password".
    await press(await screen.findByTestId('onboarding-demo').then(() => 'onboarding-demo'));
    await openProfile();
    expect(screen.queryByTestId('open-change-password')).toBeNull();
  });

  it('asks for the student’s name after Google sign-in, and lets them change it later in Profile', async () => {
    serverFor(MEERA);
    await render(<App />);
    await signIn(MEERA);

    // Filled in from Google, but the student can write their own.
    const field = await screen.findByTestId('field-name');
    expect(field.props.value).toBe('Meera');
    await fireEvent.changeText(field, '   ');
    await press('onboarding-start');
    expect(await screen.findByText('Write your name so the planner knows what to call you.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('field-name'), 'Meeru');
    expect(await screen.findByText(/Hi Meeru\./)).toBeTruthy();
    await setUp();
    expect((await savedPlanner(MEERA)).profile.name).toBe('Meeru');

    await openProfile();
    await press('edit-name');
    await fireEvent.changeText(await screen.findByTestId('field-profile-name'), 'Meera Sahoo');
    await press('save-name');
    expect(await screen.findByText('Name saved.')).toBeTruthy();
    expect(await screen.findByText('Meera Sahoo')).toBeTruthy();
    expect((await savedPlanner(MEERA)).profile.name).toBe('Meera Sahoo');
  });

  it('adds a half-yearly exam with one paper per subject from the datesheet on the Plan page', async () => {
    serverFor(MEERA);
    await render(<App />);
    await signIn(MEERA);
    await setUp();
    await press('tab-Plan');
    await press(await screen.findByTestId('datesheet-add-term').then(() => 'datesheet-add-term'));
    expect(await screen.findByTestId('builder-paper-maths')).toBeTruthy();
    await press('datesheet-submit');

    expect(await screen.findByText(/Half-yearly: 5 papers on your datesheet/)).toBeTruthy();
    const saved = await savedPlanner(MEERA);
    expect(saved.exams.map((exam) => exam.name)).toEqual(['Half-yearly: Maths', 'Half-yearly: Science', 'Half-yearly: Social Science', 'Half-yearly: English', 'Half-yearly: Hindi']);
    expect(new Set(saved.exams.map((exam) => exam.seriesId)).size).toBe(1);
    expect(saved.exams.every((exam) => exam.kind === 'halfYearly')).toBe(true);
    expect(saved.tasks.length).toBeGreaterThan(0);
    expect(await screen.findByTestId('datesheet-group-Half-yearly')).toBeTruthy();
  });

  it('adds marks, sends the parent summary and shares the streak from the phone, and sets the homework slot', async () => {
    serverFor(MEERA);
    await render(<App />);
    await signIn(MEERA);
    await setUp();
    await examsApi.create({ subject: 'maths', name: 'Maths class test', date: '2026-11-20', weight: 10, chapterKeys: ['maths-1'] });
    await profileApi.update({ sharing: { parent: true, items: { marks: true } } });
    setClockForTests(new Date('2026-11-21T06:00:00.000Z'));

    await press('tab-Progress');
    expect(await screen.findByText('Maths class test')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add marks'));
    await fireEvent.changeText(await screen.findByTestId('marks-score'), '32.5');
    await fireEvent.changeText(screen.getByTestId('marks-out-of'), '40');
    await press('marks-save');
    expect(await screen.findByText('32.5/40 · 81%')).toBeTruthy();

    await openProfile();
    expect(await screen.findByText(/Marks: Maths class test 32\.5\/40 \(81%\)/)).toBeTruthy();
    await press('send-parent-summary');
    expect(Share.share).toHaveBeenLastCalledWith({ message: expect.stringMatching(/^Meera’s study week\n• [\s\S]*Marks: Maths class test 32\.5\/40 \(81%\)/) });
    expect(await screen.findByText('Summary sent.')).toBeTruthy();

    await press('share-streak');
    expect(Share.share).toHaveBeenLastCalledWith({ message: expect.stringMatching(/streak/) });

    expect(screen.getByTestId('today-slot-homework')).toBeTruthy();
    await fireEvent.press(screen.getByText('45 min'));
    expect(await screen.findByText(/Homework slot set to 45 min a day/)).toBeTruthy();
    expect((await savedPlanner(MEERA)).profile.homeworkMins).toBe(45);
  });

  it('adds a subject after setup from the syllabus', async () => {
    serverFor(MEERA);
    await render(<App />);
    await signIn(MEERA);
    await setUp();
    await press('tab-Plan');
    await press(await screen.findByTestId('open-syllabus').then(() => 'open-syllabus'));
    await press(await screen.findByTestId('add-subject').then(() => 'add-subject'));
    await fireEvent.changeText(screen.getByTestId('new-subject-name'), 'Sanskrit');
    await fireEvent.changeText(screen.getByTestId('new-subject-chapters'), 'Sandhi\nSamasa\n');
    await press('new-subject-save');

    expect(await screen.findByText(/Sanskrit added with 2 chapters/)).toBeTruthy();
    expect(await screen.findByTestId('chapter-custom1-1')).toBeTruthy();
    const saved = await savedPlanner(MEERA);
    expect(saved.profile.subjects).toContain('custom1');
    expect(saved.chapters.filter((chapter) => chapter.subject === 'custom1').map((chapter) => chapter.name)).toEqual(['Sandhi', 'Samasa']);
  });

  it('opens straight into the plan on the next launch, even with no connection', async () => {
    serverFor(MEERA);
    const first = await render(<App />);
    await signIn(MEERA);
    await press(await screen.findByTestId('onboarding-demo').then(() => 'onboarding-demo'));
    await screen.findByTestId('today-screen');
    await persistNow();
    await first.unmount();

    // A cold start with no signal: nothing in memory, only the file and the saved session.
    freshLaunch();
    refreshServer.reset();
    refreshServer.onPost(/\/auth\/refresh$/).networkError();
    await render(<App />);
    expect(await screen.findByTestId('today-screen')).toBeTruthy();
    expect(useAuthStore.getState().user).toMatchObject({ id: MEERA.id, name: 'Meera' });
  });

  it('keeps each student’s plan apart on a shared phone and deletes it with the account', async () => {
    serverFor(MEERA);
    await render(<App />);
    await signIn(MEERA);
    await press(await screen.findByTestId('onboarding-demo').then(() => 'onboarding-demo'));
    await screen.findByTestId('today-screen');
    await openProfile();
    await fireEvent.press(screen.getByText('Sign out'));

    // Ravi signs in on the same phone and starts with an empty plan.
    server.reset();
    serverFor(RAVI);
    await signIn(RAVI);
    expect(await screen.findByText(/Hi Ravi\./)).toBeTruthy();
    await fireEvent.press(screen.getByText('Sign out'));

    // Meera's plan is still here when she signs back in.
    server.reset();
    serverFor(MEERA);
    await signIn(MEERA);
    expect(await screen.findByTestId('today-screen')).toBeTruthy();
    expect((await savedPlanner(MEERA)).profile.isDemo).toBe(true);

    await openProfile();
    await press('open-delete-account');
    expect(screen.queryByTestId('field-password')).toBeNull();
    await press(await screen.findByTestId('delete-account-submit').then(() => 'delete-account-submit'));
    expect(await screen.findByTestId('google-sign-in')).toBeTruthy();
    expect(__files.has(plannerFile(MEERA))).toBe(false);
  });
});
