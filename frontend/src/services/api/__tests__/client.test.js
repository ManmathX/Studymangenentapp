import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { API_BASE_URL } from '../../../config/env';
import { tokenStorage } from '../../storage/tokenStorage';
import { ApiError } from '../ApiError';
import { api, http, setSessionExpiredHandler } from '../client';

const apiMock = new MockAdapter(http);
const rootMock = new MockAdapter(axios);
const expired = [401, { success: false, error: { code: 'TOKEN_EXPIRED', message: 'Your session has expired', requestId: 'r1' } }];

beforeEach(async () => {
  apiMock.reset();
  rootMock.reset();
  await tokenStorage.clear();
});

describe('api client', () => {
  it('unwraps the success envelope and keeps paging metadata', async () => {
    apiMock.onGet('/homework').reply(200, { success: true, data: [{ id: 'h1' }], meta: { page: 1, hasNext: false } });
    await expect(api.get('/homework')).resolves.toEqual([{ id: 'h1' }]);
    await expect(api.getPage('/homework')).resolves.toEqual({ data: [{ id: 'h1' }], meta: { page: 1, hasNext: false } });
  });

  it('sends the access token and turns error envelopes into ApiError with field details', async () => {
    tokenStorage.setAccessToken('access-1');
    apiMock.onPost('/exams').reply((config) => {
      expect(config.headers.Authorization).toBe('Bearer access-1');
      return [400, { success: false, error: { code: 'VALIDATION_ERROR', message: 'The request is not valid', details: [{ path: 'body.name', message: 'Required' }], requestId: 'r2' } }];
    });
    const error = await api.post('/exams', {}).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', requestId: 'r2' });
    expect(error.fieldErrors()).toEqual({ name: 'Required' });
  });

  it('reports network failures as offline errors', async () => {
    apiMock.onGet('/dashboard/today').networkError();
    const error = await api.get('/dashboard/today').catch((caught) => caught);
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', isNetworkError: true });
  });

  it('refreshes an expired session once for many parallel requests, then retries them', async () => {
    await tokenStorage.saveTokens({ accessToken: 'old', refreshToken: 'refresh-1' });
    apiMock.onGet('/a').replyOnce(...expired).onGet('/a').reply(200, { success: true, data: 'A' });
    apiMock.onGet('/b').replyOnce(...expired).onGet('/b').reply(200, { success: true, data: 'B' });
    rootMock.onPost(`${API_BASE_URL}/auth/refresh`).reply(200, { success: true, data: { accessToken: 'new', refreshToken: 'refresh-2' } });

    await expect(Promise.all([api.get('/a'), api.get('/b')])).resolves.toEqual(['A', 'B']);
    expect(rootMock.history.post).toHaveLength(1);
    expect(tokenStorage.getAccessToken()).toBe('new');
    await expect(tokenStorage.getRefreshToken()).resolves.toBe('refresh-2');
    expect(apiMock.history.get.at(-1).headers.Authorization).toBe('Bearer new');
  });

  it('signs out when the session cannot be refreshed', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    await tokenStorage.saveTokens({ accessToken: 'old', refreshToken: 'refresh-1' });
    apiMock.onGet('/a').reply(...expired);
    rootMock.onPost(`${API_BASE_URL}/auth/refresh`).reply(401, { success: false, error: { code: 'REFRESH_REUSED', message: 'Your session is no longer valid' } });

    await expect(api.get('/a')).rejects.toMatchObject({ status: 401 });
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(tokenStorage.getAccessToken()).toBeNull();
    await expect(tokenStorage.getRefreshToken()).resolves.toBeNull();
  });

  it('does not treat a wrong re-entered password as a lost session', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    apiMock.onPost('/auth/password').reply(400, { success: false, error: { code: 'WRONG_PASSWORD', message: 'That password is not right' } });
    await expect(api.post('/auth/password', {})).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect(onExpired).not.toHaveBeenCalled();
    expect(rootMock.history.post).toHaveLength(0);
  });

  it('sends a body with DELETE when one is given', async () => {
    apiMock.onDelete('/auth/account').reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ password: 'secret-1' });
      return [204];
    });
    await expect(api.delete('/auth/account', { password: 'secret-1' })).resolves.toBeNull();
  });
});
