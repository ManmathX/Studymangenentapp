import { Share } from 'react-native';
import { AppError } from '../data/errors';

/**
 * Opens the phone's share sheet (WhatsApp, SMS, email…) with a text message. It goes straight
 * from this phone to the app the student picks; the server never sees it. Resolves true if it
 * was shared, false if the student closed the sheet.
 */
export async function shareText(message) {
  let result;
  try {
    result = await Share.share({ message });
  } catch {
    throw new AppError({ code: 'SHARING_UNAVAILABLE', message: 'This device can’t share from the app.' });
  }
  return result?.action !== Share.dismissedAction;
}
