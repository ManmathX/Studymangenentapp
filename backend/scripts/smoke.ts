/**
 * End-to-end smoke check against a running API: `npm run smoke` (API_URL defaults to localhost:4000).
 * Creates a throwaway account, exercises the main flows and token rotation, and exits non-zero on failure.
 */
const base = `${process.env.API_URL ?? 'http://localhost:4000'}/api/v1`;

interface Envelope {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

async function call(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; json: Envelope }> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: (text ? JSON.parse(text) : { success: true }) as Envelope };
}

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

async function main(): Promise<void> {
  const email = `smoke-${Date.now()}@example.test`;
  const reg = await call('POST', '/auth/register', { name: 'Smoke Test', email, password: 'smoke-pass-123' });
  check('register', reg.status === 201, String(reg.status));
  const session = reg.json.data as { tokens: { accessToken: string; refreshToken: string } };
  const token = session.tokens.accessToken;

  const me = await call('GET', '/auth/me', undefined, token);
  check('me before setup says not onboarded', (me.json.data as { onboarded: boolean }).onboarded === false);

  const notReady = await call('GET', '/dashboard/today', undefined, token);
  check('dashboard needs onboarding first', notReady.json.error?.code === 'ONBOARDING_REQUIRED', notReady.json.error?.code);

  const demo = await call('POST', '/onboarding/demo', { timezone: 'Asia/Kolkata' }, token);
  check('demo student loads', demo.status === 201, String(demo.status));

  for (const path of ['/dashboard/today', '/dashboard/progress', '/dashboard/habits', '/dashboard/sharing', '/plan/days', '/exams', '/homework?status=open', '/homework/summary', '/bag', '/chapters?subject=maths']) {
    const result = await call('GET', path, undefined, token);
    check(`GET ${path}`, result.status === 200, String(result.status));
  }

  const today = (await call('GET', '/dashboard/today', undefined, token)).json.data as {
    today: string;
    tasks: unknown[];
    streak: number;
    suggestions: { id: string; kind: string }[];
  };
  check('today has tasks, streak and a missed-task suggestion', today.tasks.length > 0 && today.streak > 0 && today.suggestions.some((item) => item.kind === 'move'), `tasks=${today.tasks.length} streak=${today.streak} suggestions=${today.suggestions.length}`);

  const day = await call('GET', `/plan/days/${today.today}`, undefined, token);
  check('plan day lays out a timeline', Array.isArray((day.json.data as { rows: unknown[] }).rows));

  const auto = await call('POST', '/plan/auto-schedule', undefined, token);
  check('auto-schedule suggests blocks', auto.status === 200, JSON.stringify(auto.json.data));

  const proposal = await call('GET', '/chapters/maths-9/schedule-proposal', undefined, token);
  const steps = (proposal.json.data as { steps: { index: number; proposedDate: string }[] }).steps;
  const scheduled = await call('POST', '/chapters/maths-9/schedule', { steps: steps.map(({ index, proposedDate }) => ({ index, date: proposedDate })) }, token);
  check('schedule chapter steps', scheduled.status === 201, `${steps.length} steps`);

  const injection = await call('POST', '/auth/login', { email: { $gt: '' }, password: 'x' });
  check('NoSQL operator in login is rejected', injection.status === 400, String(injection.status));

  const student403 = await call('GET', '/admin/users', undefined, token);
  check('student cannot use admin routes', student403.status === 403, String(student403.status));

  const rotated = await call('POST', '/auth/refresh', { refreshToken: session.tokens.refreshToken });
  check('refresh rotates the token', rotated.status === 200, String(rotated.status));
  const reused = await call('POST', '/auth/refresh', { refreshToken: session.tokens.refreshToken });
  check('reusing a rotated refresh token fails', reused.status === 401, reused.json.error?.code);

  const wipe = await call('DELETE', '/profile/data', undefined, token);
  check('start over wipes planner data', wipe.status === 204, String(wipe.status));

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll smoke checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
