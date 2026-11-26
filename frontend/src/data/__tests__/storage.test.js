import { __files } from 'expo-file-system';
import { backupApi, dashboardApi, homeworkApi, profileApi } from '../api';
import { deleteData, isLoaded, loadData, read, resetForTests, unloadData } from '../db';
import { freshPlanner, ONBOARDING, OWNER, plannerFile, savedDocument } from './helpers';

beforeEach(freshPlanner);

const OTHER = '665f1c2b9a1e4b0087654321';

describe('saving on the device', () => {
  it('starts empty and saves every change to a file that survives a restart', async () => {
    expect(read().profile).toBeNull();
    await profileApi.onboard(ONBOARDING);
    await homeworkApi.create({ subject: 'maths', title: 'Exercise 8.2', note: '', due: '2026-11-21', mins: 40, difficulty: 2 });

    const saved = await savedDocument();
    expect(saved).toMatchObject({ schemaVersion: 1, profile: { name: 'Asha', cls: 9 } });
    expect(saved.homework).toHaveLength(1);
    expect(__files.has(`${plannerFile()}.tmp`)).toBe(false);

    resetForTests();
    await loadData(OWNER);
    expect(read().profile.name).toBe('Asha');
    expect((await homeworkApi.page('open', 1)).data[0].title).toBe('Exercise 8.2');
  });

  it('keeps an unreadable file aside and starts fresh instead of crashing', async () => {
    __files.set(plannerFile(), '{ not json');
    resetForTests();
    await expect(loadData(OWNER)).resolves.toEqual({ recovered: true });
    expect(read().profile).toBeNull();
    const kept = [...__files.keys()].find((key) => key.includes(`planner-${OWNER}-unreadable-`));
    expect(__files.get(kept)).toBe('{ not json');
  });

  it('leaves the data untouched when an action fails half way', async () => {
    await profileApi.onboard(ONBOARDING);
    const before = JSON.stringify(read());
    await expect(profileApi.onboard(ONBOARDING)).rejects.toMatchObject({ code: 'ALREADY_ONBOARDED' });
    expect(JSON.stringify(read())).toBe(before);
  });
});

describe('one plan per account on a shared phone', () => {
  it('keeps each account’s plan in its own file', async () => {
    await profileApi.onboard(ONBOARDING);

    await loadData(OTHER);
    expect(read().profile).toBeNull();
    await profileApi.loadDemo('Ravi');

    await loadData(OWNER);
    expect(read().profile.name).toBe('Asha');
    expect((await savedDocument(OTHER)).profile.name).toBe('Ravi');
    expect((await savedDocument(OWNER)).profile.name).toBe('Asha');
  });

  it('saves a change made just before signing out, then closes the plan', async () => {
    await profileApi.onboard(ONBOARDING);
    await profileApi.update({ examSeason: true });
    await unloadData();

    expect(isLoaded()).toBe(false);
    expect(() => read()).toThrow();
    expect(JSON.parse(__files.get(plannerFile())).profile.examSeason).toBe(true);
  });

  it('deletes only that account’s plan when the account is deleted', async () => {
    await profileApi.onboard(ONBOARDING);
    await loadData(OTHER);
    await profileApi.loadDemo('Ravi');
    await loadData(OWNER);

    await deleteData(OWNER);
    expect(isLoaded()).toBe(false);
    expect(__files.has(plannerFile(OWNER))).toBe(false);
    expect(__files.has(plannerFile(OTHER))).toBe(true);
  });

  it('refuses to open a plan without an account', async () => {
    await expect(loadData('')).rejects.toThrow('signed-in account');
    await expect(loadData(undefined)).rejects.toThrow('signed-in account');
  });
});

describe('backups', () => {
  it('exports everything and restores it on another device', async () => {
    await profileApi.loadDemo('Ravi');
    const backup = await backupApi.export();
    const summary = await backupApi.parse(backup);
    expect(summary).toMatchObject({ name: 'Ravi', exportedAt: expect.any(String) });
    expect(summary.tasks).toBeGreaterThan(0);

    await freshPlanner();
    expect(read().profile).toBeNull();
    await expect(backupApi.restore(backup)).resolves.toEqual({ onboarded: true, name: 'Ravi' });
    const today = await dashboardApi.today();
    expect(today.tasks.length).toBeGreaterThan(0);
    expect((await savedDocument()).profile.name).toBe('Ravi');
  });

  it('refuses files that are not backups and changes nothing', async () => {
    await profileApi.onboard(ONBOARDING);
    for (const text of ['hello', '{}', JSON.stringify({ app: 'other', data: {} }), JSON.stringify({ app: 'study-planner', data: { schemaVersion: 99 } })]) {
      await expect(backupApi.restore(text)).rejects.toMatchObject({ code: 'BACKUP_INVALID' });
    }
    expect(read().profile.name).toBe('Asha');
  });

  it('starts over by deleting everything', async () => {
    await profileApi.onboard(ONBOARDING);
    await profileApi.wipe();
    expect(read().profile).toBeNull();
    expect((await savedDocument()).tasks).toEqual([]);
    await expect(dashboardApi.today()).rejects.toMatchObject({ code: 'ONBOARDING_REQUIRED' });
  });
});
