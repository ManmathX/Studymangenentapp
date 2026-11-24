import { fireEvent, render, screen } from '@testing-library/react-native';
import { __files } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import App from '../App';
import { setClockForTests } from '../data/clock';
import { persistNow, resetForTests } from '../data/db';
import { useAppStore } from '../store/appStore';
import { useOnboardingStore } from '../store/onboardingStore';
import { useResourceStore } from '../store/resourceStore';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));

const PLANNER_FILE = 'file:///documents/planner.json';
const press = (testID) => fireEvent.press(screen.getByTestId(testID));
const savedPlanner = async () => {
  await persistNow();
  return JSON.parse(__files.get(PLANNER_FILE));
};

beforeEach(() => {
  __files.clear();
  resetForTests();
  setClockForTests(new Date('2026-11-18T06:00:00.000Z'));
  useAppStore.setState({ status: 'booting', onboarded: false, name: null });
  useOnboardingStore.getState().reset();
  useResourceStore.getState().reset();
});

describe('the whole app, offline', () => {
  it('sets up a new student step by step and opens today’s plan', async () => {
    await render(<App />);
    await press('onboarding-start');
    expect(await screen.findByText('Enter your name')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('field-name'), 'Meera');
    await press('onboarding-start');
    await press(await screen.findByTestId('class-9').then(() => 'class-9'));
    await press('class-continue');
    await press(await screen.findByTestId('subjects-continue').then(() => 'subjects-continue'));
    await press(await screen.findByTestId('taught-continue').then(() => 'taught-continue'));
    await press(await screen.findByTestId('tests-continue').then(() => 'tests-continue'));
    await press(await screen.findByTestId('build-plan').then(() => 'build-plan'));

    expect(await screen.findByTestId('today-screen')).toBeTruthy();
    expect(await screen.findByText('No tests added yet')).toBeTruthy();
    expect(await screen.findByTestId('today-slots')).toBeTruthy();

    // An empty day still shows both daily slots, each with a way to fill it.
    await press('tab-Plan');
    expect(await screen.findByTestId('slot-homework')).toBeTruthy();
    expect(screen.getByTestId('slot-study')).toBeTruthy();
    await press('slot-study-add');
    expect(await screen.findByText(/Pick a chapter to schedule it/)).toBeTruthy();
    expect((await savedPlanner()).profile).toMatchObject({ name: 'Meera', cls: 9 });
  });

  it('adding a unit test fills the calendar with self study, homework and revision slots', async () => {
    await render(<App />);
    await fireEvent.changeText(await screen.findByTestId('field-name'), 'Meera');
    await press('onboarding-start');
    for (const step of ['class-9', 'class-continue', 'subjects-continue', 'taught-continue', 'tests-continue', 'build-plan']) {
      await screen.findByTestId(step);
      await press(step);
    }
    await fireEvent.press(await screen.findByText('Add a test'));
    await fireEvent.changeText(await screen.findByTestId('field-name'), 'Maths unit test 1');
    await fireEvent.press(await screen.findByLabelText('Number Systems'));
    await fireEvent.press(screen.getByLabelText('Polynomials'));
    await press('exam-submit');

    expect(await screen.findByTestId('plan-screen')).toBeTruthy();
    expect((await screen.findAllByText('Self study')).length).toBeGreaterThan(0);
    // The day's study slot is now Test prep for this test.
    expect(await screen.findByTestId('slot-exam')).toBeTruthy();
    expect(screen.getByText('Test prep slot')).toBeTruthy();
    expect(screen.getByText(/^Maths unit test 1 on /)).toBeTruthy();
    const slots = (await savedPlanner()).tasks;
    expect(new Set(slots.map((task) => task.kind))).toEqual(new Set(['study', 'homework', 'revision']));
    expect(slots).toHaveLength(7);
  });

  it('adds a half-yearly exam from the date sheet and plans every subject', async () => {
    await render(<App />);
    await fireEvent.changeText(await screen.findByTestId('field-name'), 'Meera');
    await press('onboarding-start');
    for (const step of ['class-9', 'class-continue', 'subjects-continue', 'taught-continue', 'tests-continue', 'build-plan']) {
      await screen.findByTestId(step);
      await press(step);
    }
    await fireEvent.press(await screen.findByText('Add a test'));
    await fireEvent.press(await screen.findByText('Half-yearly'));

    // The date sheet: one paper per subject, back to back from the first paper (Fri 18 Dec), Sunday skipped.
    expect(await screen.findByTestId('paper-maths')).toBeTruthy();
    const [, ticked, total] = screen.getByText(/^Fri 18 Dec · \d+ of \d+ chapters$/).props.children.match(/(\d+) of (\d+)/);
    expect(Number(ticked)).toBe(Math.ceil(Number(total) / 2)); // first half of the Maths syllabus
    expect(screen.getByText(/^Mon 21 Dec · /)).toBeTruthy();
    await press('series-submit');

    expect(await screen.findByTestId('plan-screen')).toBeTruthy();
    expect(await screen.findByTestId('slot-exam')).toBeTruthy();
    const saved = await savedPlanner();
    expect(saved.exams.map((exam) => exam.name)).toEqual(['Half-yearly: Maths', 'Half-yearly: Science', 'Half-yearly: Social Science', 'Half-yearly: English', 'Half-yearly: Hindi']);
    expect(new Set(saved.tasks.map((task) => task.subject)).size).toBe(5);
  });

  it('loads the demo student and every tab and Settings work', async () => {
    await render(<App />);
    await fireEvent.changeText(await screen.findByTestId('field-name'), 'Ravi');
    await press('onboarding-demo');

    expect(await screen.findByTestId('today-screen')).toBeTruthy();
    expect(await screen.findByText(/-day streak\./)).toBeTruthy();
    for (const tab of ['Plan', 'Progress', 'Habits', 'Homework']) {
      await press(`tab-${tab}`);
      expect(await screen.findByTestId(`${tab.toLowerCase()}-screen`)).toBeTruthy();
    }

    await fireEvent.press(screen.getAllByLabelText(/^Settings/)[0]);
    expect(await screen.findByText('Ravi')).toBeTruthy();
    expect(screen.getByText('Works offline')).toBeTruthy();

    await press('export-backup');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.stringMatching(/study-planner-backup-2026-11-18\.json$/), expect.objectContaining({ mimeType: 'application/json' }));
    const backup = JSON.parse(__files.get('file:///cache/study-planner-backup-2026-11-18.json'));
    expect(backup).toMatchObject({ app: 'study-planner', data: { profile: { name: 'Ravi', isDemo: true } } });

    await press('start-over');
    await press('start-over');
    expect(await screen.findByTestId('onboarding-start')).toBeTruthy();
    expect((await savedPlanner()).profile).toBeNull();
  });

  it('opens straight into the plan when one is already saved on the device', async () => {
    const first = await render(<App />);
    await fireEvent.changeText(await screen.findByTestId('field-name'), 'Ravi');
    await press('onboarding-demo');
    await screen.findByTestId('today-screen');
    await persistNow();
    await first.unmount();

    // A cold start: nothing in memory, only the file on the device.
    resetForTests();
    useAppStore.setState({ status: 'booting', onboarded: false, name: null });
    useResourceStore.getState().reset();
    await render(<App />);
    expect(await screen.findByTestId('today-screen')).toBeTruthy();
    expect(useAppStore.getState().name).toBe('Ravi');
  });
});
