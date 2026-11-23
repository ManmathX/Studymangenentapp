import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '../../../services/api/ApiError';
import { useAuthStore } from '../../../store/authStore';
import { useToastStore } from '../../../store/toastStore';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { ChangePasswordScreen } from '../ChangePasswordScreen';

async function setup(changePassword) {
  useAuthStore.setState({ changePassword });
  const navigation = { goBack: jest.fn() };
  await render(
    <ThemeProvider>
      <ChangePasswordScreen navigation={navigation} />
    </ThemeProvider>,
  );
  const type = (name, value) => fireEvent.changeText(screen.getByTestId(`field-${name}`), value);
  const submit = () => fireEvent.press(screen.getByTestId('change-password-submit'));
  const fill = async (current, next, confirm) => {
    await type('currentPassword', current);
    await type('newPassword', next);
    await type('confirm', confirm);
  };
  return { navigation, fill, submit };
}

describe('ChangePasswordScreen', () => {
  it('checks the new password before calling the server', async () => {
    const changePassword = jest.fn();
    const { fill, submit } = await setup(changePassword);
    await fill('old-pass-1', 'short', 'different');
    await submit();
    expect(await screen.findByText('Use at least 8 characters')).toBeTruthy();
    expect(screen.getByText('Passwords don’t match')).toBeTruthy();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('shows the server’s answer next to the current password', async () => {
    const wrong = new ApiError({ status: 400, code: 'WRONG_PASSWORD', message: 'That password is not right', details: [{ path: 'body.currentPassword', message: 'That password is not right' }] });
    const { fill, submit, navigation } = await setup(jest.fn().mockRejectedValue(wrong));
    await fill('old-pass-1', 'new-pass-22', 'new-pass-22');
    await submit();
    expect(await screen.findByText('That password is not right')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('changes the password, confirms and closes', async () => {
    const changePassword = jest.fn().mockResolvedValue(undefined);
    const { fill, submit, navigation } = await setup(changePassword);
    await fill('old-pass-1', 'new-pass-22', 'new-pass-22');
    await submit();
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(changePassword).toHaveBeenCalledWith('old-pass-1', 'new-pass-22');
    expect(useToastStore.getState().message).toMatch(/Password changed/);
  });
});
