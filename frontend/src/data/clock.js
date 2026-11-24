/** The device's time zone, so "today" is the student's own calendar day. */
function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

let fixedNow = null;
let fixedZone = null;

/** Source of "now". Tests pin it with setClockForTests so dates are predictable. */
export const clock = {
  now: () => (fixedNow ? new Date(fixedNow) : new Date()),
  timeZone: () => fixedZone ?? deviceTimeZone(),
};

export function setClockForTests(now, timeZone = 'Asia/Kolkata') {
  fixedNow = now ? new Date(now) : null;
  fixedZone = now ? timeZone : null;
}
