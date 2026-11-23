import { act, render, screen } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Text } from 'react-native';
import * as ReactNative from 'react-native';
import { usePreferencesStore } from '../../store/preferencesStore';
import { ThemeProvider, useTheme } from '../ThemeProvider';
import { palette } from '../tokens';

function Probe() {
  const { scheme, appearance, colors } = useTheme();
  return <Text testID="probe">{`${appearance}|${scheme}|${colors.background}`}</Text>;
}

const probe = () => screen.getByTestId('probe').props.children;

async function renderWithSystem(systemScheme) {
  jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(systemScheme);
  await render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  // Let the saved preference load.
  await act(async () => {});
}

beforeEach(() => {
  SecureStore.__reset();
  usePreferencesStore.setState({ appearance: 'system', hydrated: false });
});

afterEach(() => jest.restoreAllMocks());

describe('appearance', () => {
  it('follows the phone setting by default', async () => {
    await renderWithSystem('dark');
    expect(probe()).toBe(`system|dark|${palette.dark.background}`);
  });

  it('forces light or dark and remembers the choice on the device', async () => {
    await renderWithSystem('dark');
    await act(async () => usePreferencesStore.getState().setAppearance('light'));
    expect(probe()).toBe(`light|light|${palette.light.background}`);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('studyplanner.pref.appearance', 'light');

    await act(async () => usePreferencesStore.getState().setAppearance('system'));
    expect(probe()).toBe(`system|dark|${palette.dark.background}`);
  });

  it('restores a saved choice on start and ignores unknown values', async () => {
    await SecureStore.setItemAsync('studyplanner.pref.appearance', 'dark');
    await renderWithSystem('light');
    expect(probe()).toBe(`dark|dark|${palette.dark.background}`);

    await act(async () => usePreferencesStore.getState().setAppearance('neon'));
    expect(probe()).toBe(`dark|dark|${palette.dark.background}`);
  });
});
