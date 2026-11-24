import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Durable text storage for the planner, by name.
 * - iOS/Android: a JSON file in the app's documents folder (included in the phone's own
 *   iCloud / Google backup). Writes go to a temporary file first and are then moved over
 *   the real one, so a crash mid-save can never leave a half-written file.
 * - Web: the browser's localStorage for this site.
 */
const WEB_PREFIX = 'studyplanner.';

const native = {
  async read(name) {
    const file = new File(Paths.document, `${name}.json`);
    return file.exists ? file.text() : null;
  },
  async write(name, text) {
    const target = new File(Paths.document, `${name}.json`);
    const temp = new File(Paths.document, `${name}.json.tmp`);
    if (temp.exists) temp.delete();
    temp.create();
    await temp.write(text);
    await temp.move(target, { overwrite: true });
  },
  async remove(name) {
    const file = new File(Paths.document, `${name}.json`);
    if (file.exists) file.delete();
  },
};

const web = {
  async read(name) {
    return globalThis.localStorage?.getItem(`${WEB_PREFIX}${name}`) ?? null;
  },
  async write(name, text) {
    globalThis.localStorage?.setItem(`${WEB_PREFIX}${name}`, text);
  },
  async remove(name) {
    globalThis.localStorage?.removeItem(`${WEB_PREFIX}${name}`);
  },
};

export const storage = Platform.OS === 'web' ? web : native;
