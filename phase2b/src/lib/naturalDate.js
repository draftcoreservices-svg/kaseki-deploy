// Natural language date parser for Kaseki.
// Self-contained; no external dependencies.
// Recognises patterns like "tomorrow", "next monday", "in 3 days", "3pm", "tomorrow 3pm", "friday 9am".
// Returns { cleanTitle, dueDate, dueTime } or null if nothing matched.

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_SHORT = ['sun', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat'];
const WEEKDAY_TO_INDEX = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function pad(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseTime(str) {
  // Matches 3pm, 3:30pm, 15:30, 3 pm, 9am
  const m = str.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) || str.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = (m[3] || '').toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { time: `${pad(h)}:${pad(min)}`, raw: m[0] };
}

function nextWeekday(from, targetIdx) {
  const d = new Date(from);
  const cur = d.getDay();
  let diff = targetIdx - cur;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

export function parseNaturalDate(input, reference = new Date()) {
  if (!input) return null;
  const originalText = input;
  let text = ' ' + input.toLowerCase() + ' ';
  let dueDate = null;
  let dueTime = null;
  let matched = [];

  // Time first (captures "3pm", "9:30am", etc.)
  const timeMatch = parseTime(text);
  if (timeMatch) {
    dueTime = timeMatch.time;
    matched.push(timeMatch.raw);
  }

  // Relative day keywords
  const ref = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());

  const patterns = [
    { re: /\btoday\b/i, date: () => ref },
    { re: /\btonight\b/i, date: () => ref, time: '19:00' },
    { re: /\btomorrow\b/i, date: () => { const d = new Date(ref); d.setDate(d.getDate() + 1); return d; } },
    { re: /\byesterday\b/i, date: () => { const d = new Date(ref); d.setDate(d.getDate() - 1); return d; } },
    { re: /\bin\s+(\d+)\s+days?\b/i, date: (m) => { const d = new Date(ref); d.setDate(d.getDate() + parseInt(m[1], 10)); return d; } },
    { re: /\bin\s+(\d+)\s+weeks?\b/i, date: (m) => { const d = new Date(ref); d.setDate(d.getDate() + parseInt(m[1], 10) * 7); return d; } },
    { re: /\bin\s+a\s+week\b/i, date: () => { const d = new Date(ref); d.setDate(d.getDate() + 7); return d; } },
    { re: /\bnext\s+week\b/i, date: () => { const d = new Date(ref); d.setDate(d.getDate() + 7); return d; } },
    { re: /\bnext\s+month\b/i, date: () => { const d = new Date(ref); d.setMonth(d.getMonth() + 1); return d; } },
  ];

  for (const p of patterns) {
    const m = text.match(p.re);
    if (m) {
      dueDate = toDateStr(p.date(m));
      if (p.time && !dueTime) dueTime = p.time;
      matched.push(m[0]);
      break;
    }
  }

  // Weekday names: "monday", "next friday"
  if (!dueDate) {
    const wordList = Object.keys(WEEKDAY_TO_INDEX).join('|');
    const reNext = new RegExp('\\bnext\\s+(' + wordList + ')\\b', 'i');
    const reBare = new RegExp('\\b(' + wordList + ')\\b', 'i');
    let m = text.match(reNext);
    if (m) {
      const idx = WEEKDAY_TO_INDEX[m[1].toLowerCase()];
      const d = nextWeekday(ref, idx);
      d.setDate(d.getDate() + 7); // "next" monday = a week further
      dueDate = toDateStr(d);
      matched.push(m[0]);
    } else if ((m = text.match(reBare))) {
      const idx = WEEKDAY_TO_INDEX[m[1].toLowerCase()];
      dueDate = toDateStr(nextWeekday(ref, idx));
      matched.push(m[0]);
    }
  }

  // Specific date: "on 15 may", "15/05", "15 May 2026"
  if (!dueDate) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const shortMonths = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const monthRe = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(' + months.concat(shortMonths).join('|') + ')(?:\\s+(\\d{4}))?\\b', 'i');
    const m = text.match(monthRe);
    if (m) {
      const day = parseInt(m[1], 10);
      const monthStr = m[2].toLowerCase();
      let monthIdx = months.indexOf(monthStr);
      if (monthIdx === -1) monthIdx = shortMonths.indexOf(monthStr);
      const year = m[3] ? parseInt(m[3], 10) : ref.getFullYear();
      if (monthIdx >= 0 && day >= 1 && day <= 31) {
        const d = new Date(year, monthIdx, day);
        // If already past and no explicit year, bump to next year
        if (!m[3] && d < ref) d.setFullYear(d.getFullYear() + 1);
        dueDate = toDateStr(d);
        matched.push(m[0]);
      }
    }
  }

  // Clean up the title: remove matched substrings + leading prepositions
  let cleanTitle = originalText;
  for (const token of matched) {
    const re = new RegExp('\\s*\\b' + token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b\\s*', 'gi');
    cleanTitle = cleanTitle.replace(re, ' ');
  }
  // Strip dangling prepositions/conjunctions left behind
  cleanTitle = cleanTitle.replace(/\s+(at|on|by|before|after|until|for)\s*$/i, '');
  cleanTitle = cleanTitle.replace(/\s+(at|on|by|before|after|until|for)\s+(?=\s|$)/gi, ' ');
  cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();

  if (!dueDate && !dueTime) return null;
  return { cleanTitle: cleanTitle || originalText, dueDate, dueTime, matched };
}

export default parseNaturalDate;
