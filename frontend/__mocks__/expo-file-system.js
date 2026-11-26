/**
 * In-memory stand-in for expo-file-system in Jest. Files live in `__files`, keyed by URI,
 * so tests can look at exactly what the app saved on "disk".
 */
const files = new Map();

const uriOf = (part) => (typeof part === 'string' ? part : part.uri);
const join = (parts) => parts.map(uriOf).join('/');

class Directory {
  constructor(...parts) {
    this.uri = join(parts);
  }
}

class File {
  constructor(...parts) {
    this.uri = join(parts);
  }

  get exists() {
    return files.has(this.uri);
  }

  create() {
    if (files.has(this.uri)) throw new Error(`File already exists: ${this.uri}`);
    files.set(this.uri, '');
  }

  async write(content) {
    files.set(this.uri, String(content));
  }

  async text() {
    if (!files.has(this.uri)) throw new Error(`No such file: ${this.uri}`);
    return files.get(this.uri);
  }

  delete() {
    if (!files.delete(this.uri)) throw new Error(`No such file: ${this.uri}`);
  }

  async move(target, { overwrite = false } = {}) {
    if (files.has(target.uri) && !overwrite) throw new Error(`Destination exists: ${target.uri}`);
    files.set(target.uri, files.get(this.uri));
    files.delete(this.uri);
    this.uri = target.uri;
  }
}

const Paths = {
  document: new Directory('file:///documents'),
  cache: new Directory('file:///cache'),
};

module.exports = { File, Directory, Paths, __files: files };
