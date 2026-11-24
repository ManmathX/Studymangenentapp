import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { AppError } from '../data/errors';

export const backupFileName = (date) => `study-planner-backup-${date}.json`;

/**
 * Hands a backup to the student to keep. Phones open the share sheet (Files, Drive,
 * WhatsApp to self, email…); the web build downloads the file.
 */
export async function saveBackupFile(text, fileName) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new AppError({ code: 'SHARING_UNAVAILABLE', message: 'This device can’t share files, so the backup couldn’t be saved.' });
  }
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  await file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save your Study Planner backup' });
}

/** Lets the student pick a backup file. Resolves to its text, or null if they cancel. */
export async function pickBackupFile() {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  const [asset] = result.assets;
  if (asset.file) return asset.file.text();
  return new File(asset.uri).text();
}
