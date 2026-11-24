const HCM_TIMEZONE = 'Asia/Ho_Chi_Minh';

const hcmDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: HCM_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function nowUtcIso() {
  return new Date().toISOString();
}

/**
 * Returns YYYY-MM-DD in Asia/Ho_Chi_Minh timezone.
 * Attendance day boundaries follow Asia/Ho_Chi_Minh local midnight.
 */
function getAttendanceDateHCM(date = new Date()) {
  return hcmDateFormatter.format(date);
}

module.exports = {
  HCM_TIMEZONE,
  nowUtcIso,
  getAttendanceDateHCM,
};
