import { useResourceStore } from '../resourceStore';

const store = () => useResourceStore.getState();

beforeEach(() => store().reset());

describe('resource cache', () => {
  it('shares one request between callers and reuses fresh data', async () => {
    const loader = jest.fn().mockResolvedValue({ value: 1 });
    const [first, second] = await Promise.all([store().fetch('today', loader), store().fetch('today', loader)]);
    expect(first).toEqual({ value: 1 });
    expect(second).toBe(first);
    await store().fetch('today', loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(store().entry('today').status).toBe('success');
  });

  it('keeps the last good data when a refresh fails', async () => {
    await store().fetch('progress', () => Promise.resolve('good'));
    const failing = () => Promise.reject(Object.assign(new Error('boom'), { response: { status: 500, data: { error: { code: 'INTERNAL_ERROR', message: 'boom' } } } }));
    await expect(store().fetch('progress', failing, { force: true })).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(store().entry('progress')).toMatchObject({ data: 'good', status: 'error' });
  });

  it('refetches only invalidated entries that a screen is showing', async () => {
    const visible = jest.fn().mockResolvedValue('v');
    const hidden = jest.fn().mockResolvedValue('h');
    const other = jest.fn().mockResolvedValue('o');
    await store().fetch('planDay:2026-11-18', visible);
    await store().fetch('planDay:2026-11-19', hidden);
    await store().fetch('habits', other);
    const unsubscribe = store().subscribe('planDay:2026-11-18');

    const epoch = store().epoch;
    store().invalidate(['planDay']);
    await Promise.resolve();

    expect(store().epoch).toBe(epoch + 1);
    expect(visible).toHaveBeenCalledTimes(2);
    expect(hidden).toHaveBeenCalledTimes(1);
    expect(store().entry('planDay:2026-11-19').fetchedAt).toBe(0);
    expect(other).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
