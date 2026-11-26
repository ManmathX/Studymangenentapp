/**
 * End-to-end smoke check against a running API: `npm run smoke` (API_URL defaults to localhost:4000).
 * Creates a throwaway account, checks sign-in, the syllabus catalogue, token rotation and account
 * deletion, confirms no planner endpoints exist, and exits non-zero on failure.
 */
const base = `${process.env.API_URL ?? 'http://localhost:4000'}/api/v1`;

interface Envelope {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; json: Envelope }> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    json: (text ? JSON.parse(text) : { success: true }) as Envelope,
  };
}

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

async function main(): Promise<void> {
  const email = `smoke-${Date.now()}@example.test`;
  const reg = await call('POST', '/auth/register', {
    name: 'Smoke Test',
    email,
    password: 'smoke-pass-123',
  });
  check('register', reg.status === 201, String(reg.status));
  const session = reg.json.data as { tokens: { accessToken: string; refreshToken: string } };
  const token = session.tokens.accessToken;

  const me = await call('GET', '/auth/me', undefined, token);
  check(
    'me returns only the login',
    JSON.stringify(Object.keys(me.json.data as object)) === '["user"]',
  );

  // The app downloads the exam's syllabus at setup; everything else stays on the phone.
  // `/syllabus/boards`, `/classes` and `/:cls` serve app builds from before exams.
  for (const path of [
    '/syllabus/categories',
    '/syllabus/exams',
    '/syllabus/exams/cbse',
    '/syllabus/exams/cbse/subjects?level=9',
    '/syllabus/boards',
    '/syllabus/classes?board=cbse',
    '/syllabus/9?board=cbse',
  ]) {
    const result = await call('GET', path, undefined, token);
    check(`GET ${path}`, result.status === 200, String(result.status));
  }
  for (const [method, path] of [
    ['POST', '/onboarding'],
    ['GET', '/profile'],
    ['GET', '/dashboard/today'],
    ['POST', '/homework'],
  ] as const) {
    const result = await call(method, path, method === 'POST' ? {} : undefined, token);
    check(
      `${method} ${path} is gone (plans live on the phone)`,
      result.status === 404,
      String(result.status),
    );
  }

  const forgot = await call('POST', '/auth/password/forgot', { email });
  check(
    'forgot password answers (204 with SMTP_URL set, 503 without)',
    forgot.status === 204 || forgot.status === 503,
    String(forgot.status),
  );

  const injection = await call('POST', '/auth/login', { email: { $gt: '' }, password: 'x' });
  check('NoSQL operator in login is rejected', injection.status === 400, String(injection.status));

  const student403 = await call('GET', '/admin/users', undefined, token);
  check('student cannot use admin routes', student403.status === 403, String(student403.status));

  const rotated = await call('POST', '/auth/refresh', {
    refreshToken: session.tokens.refreshToken,
  });
  check('refresh rotates the token', rotated.status === 200, String(rotated.status));
  const reused = await call('POST', '/auth/refresh', { refreshToken: session.tokens.refreshToken });
  check('reusing a rotated refresh token fails', reused.status === 401, reused.json.error?.code);

  const changed = await call(
    'POST',
    '/auth/password',
    { currentPassword: 'smoke-pass-123', newPassword: 'smoke-pass-456' },
    token,
  );
  check('change password returns a new session', changed.status === 200, String(changed.status));
  const relogin = await call('POST', '/auth/login', { email, password: 'smoke-pass-456' });
  check('sign in with the new password', relogin.status === 200, String(relogin.status));

  const deleted = await call('DELETE', '/auth/account', { password: 'smoke-pass-456' }, token);
  check('delete account', deleted.status === 204, String(deleted.status));
  const gone = await call('POST', '/auth/login', { email, password: 'smoke-pass-456' });
  check('deleted account can no longer sign in', gone.status === 401, String(gone.status));

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll smoke checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
