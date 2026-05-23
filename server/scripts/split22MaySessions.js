import fs from 'fs';
import path from 'path';

import { parseCsv, parseZoomDate, normalizeEmail } from './lib/ingestion.js';

const rootDir = process.cwd();
const attendancePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : '/Users/sakshivk/Downloads/22_May_Attendance( Joining Time).csv';
const pollPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve(rootDir, 'data/uploads/2026-05-22/Poll_22_May.csv');
const outputDir = path.resolve(rootDir, 'data/uploads/2026-05-22');

const sessions = [
  {
    key: 'morning',
    label: '22 May Morning',
    start: new Date(2026, 4, 22, 9, 0, 0),
    end: new Date(2026, 4, 22, 13, 0, 0),
    attendanceFile: '22_may_attendance_morning.csv',
    pollFile: 'Poll_22_May_Morning.csv'
  },
  {
    key: 'afternoon',
    label: '22 May Afternoon',
    start: new Date(2026, 4, 22, 14, 0, 0),
    end: new Date(2026, 4, 22, 16, 20, 0),
    attendanceFile: '22_may_attendance_afternoon.csv',
    pollFile: 'Poll_22_May_Afternoon.csv'
  },
  {
    key: 'evening',
    label: '22 May Evening',
    start: new Date(2026, 4, 22, 16, 30, 0),
    end: new Date(2026, 4, 22, 18, 36, 50),
    attendanceFile: '22_may_attendance_evening.csv',
    pollFile: 'Poll_22_May_Evening.csv'
  }
];

function csvValue(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvLine(values) {
  return values.map(csvValue).join(',');
}

function zoomFormat(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  let hours = date.getHours();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours %= 12;
  if (hours === 0) hours = 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${month}/${day}/${year} ${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${suffix}`;
}

function minutesBetween(start, end) {
  return Math.ceil((end.getTime() - start.getTime()) / 60000);
}

function readAttendanceRows(filePath) {
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  const headerIndex = rows.findIndex(row => row.includes('Join time') && row.includes('Leave time'));
  if (headerIndex < 0) throw new Error('Could not find Join time / Leave time attendance header.');
  const header = rows[headerIndex];
  const indexes = {
    name: header.indexOf('Name (original name)'),
    email: header.indexOf('Email'),
    join: header.indexOf('Join time'),
    leave: header.indexOf('Leave time'),
    guest: header.indexOf('Guest')
  };
  return rows.slice(headerIndex + 1).map(row => ({
    name: row[indexes.name] || '',
    email: normalizeEmail(row[indexes.email]),
    join: parseZoomDate(row[indexes.join], null),
    leave: parseZoomDate(row[indexes.leave], null),
    guest: row[indexes.guest] || ''
  })).filter(row => row.email && row.join && row.leave && row.leave > row.join);
}

function writeAttendanceFiles(rows) {
  for (const session of sessions) {
    const byEmail = new Map();
    for (const row of rows) {
      const start = new Date(Math.max(row.join.getTime(), session.start.getTime()));
      const end = new Date(Math.min(row.leave.getTime(), session.end.getTime()));
      if (end <= start) continue;
      const current = byEmail.get(row.email) || {
        name: row.name,
        email: row.email,
        seconds: 0,
        guest: row.guest
      };
      current.seconds += (end.getTime() - start.getTime()) / 1000;
      if (!current.name && row.name) current.name = row.name;
      if (row.guest === 'Yes') current.guest = 'Yes';
      byEmail.set(row.email, current);
    }

    const duration = minutesBetween(session.start, session.end);
    const outputRows = [
      ['Topic', 'ID', 'Host', 'Duration (minutes)', 'Start time', 'End time', 'Participants'],
      [session.label, '97582241103', 'VLED Labs (dled@iitrpr.ac.in)', duration, zoomFormat(session.start), zoomFormat(session.end), byEmail.size],
      [],
      ['Name (original name)', 'Email', 'Total duration (minutes)', 'Guest']
    ];
    const participants = [...byEmail.values()]
      .map(row => ({ ...row, minutes: Math.min(duration, Math.ceil(row.seconds / 60)) }))
      .filter(row => row.minutes > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const row of participants) {
      outputRows.push([row.name, row.email, row.minutes, row.guest || 'Yes']);
    }
    fs.writeFileSync(path.join(outputDir, session.attendanceFile), outputRows.map(csvLine).join('\n'));
    console.log(`${session.attendanceFile}: ${participants.length} students, ${duration} minutes`);
  }
}

function pollTime(row) {
  return parseZoomDate(row[3], null);
}

function readPollSections(filePath) {
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  const overview = rows.slice(0, 4);
  const launchedHeaderIndex = rows.findIndex(row => row[0] === 'Launched Polls');
  const launchedHeader = rows[launchedHeaderIndex + 1];
  const launchedRows = [];
  for (let i = launchedHeaderIndex + 2; i < rows.length; i++) {
    if (!/^\d+$/.test(rows[i][0] || '')) break;
    launchedRows.push(rows[i]);
  }

  const sections = [];
  for (let i = 0; i < rows.length; i++) {
    if (!(rows[i][0] && rows[i + 1]?.[0] === '#' && rows[i + 1]?.[1] === 'User Name')) continue;
    const title = rows[i][0];
    const header = rows[i + 1];
    const responses = [];
    for (let j = i + 2; j < rows.length; j++) {
      if (!/^\d+$/.test(rows[j][0] || '')) break;
      responses.push(rows[j]);
    }
    const times = responses.map(pollTime).filter(Boolean);
    if (times.length) sections.push({ title, header, responses, first: new Date(Math.min(...times.map(t => t.getTime()))) });
  }
  return { overview, launchedHeader, launchedRows, sections };
}

function writePollFiles(pollData) {
  for (const session of sessions) {
    const sections = pollData.sections.filter(section => section.first >= session.start && section.first <= session.end);
    const launchedRows = pollData.launchedRows.filter(row => sections.some(section => section.title === row[1]));
    const outputRows = [
      ...pollData.overview,
      [],
      ['Launched Polls'],
      pollData.launchedHeader,
      ...launchedRows.map((row, index) => [index + 1, row[1], row[2], row[3]]),
      []
    ];
    for (const section of sections) {
      outputRows.push([section.title]);
      outputRows.push(section.header);
      section.responses.forEach((row, index) => outputRows.push([index + 1, ...row.slice(1)]));
      outputRows.push([]);
    }
    fs.writeFileSync(path.join(outputDir, session.pollFile), outputRows.map(csvLine).join('\n'));
    const questions = launchedRows.reduce((sum, row) => sum + Number(row[2] || 0), 0);
    const responses = launchedRows.reduce((sum, row) => sum + Number(row[3] || 0), 0);
    console.log(`${session.pollFile}: ${sections.length} polls, ${questions} questions, ${responses} responses`);
  }
}

fs.mkdirSync(outputDir, { recursive: true });
const attendanceRows = readAttendanceRows(attendancePath);
writeAttendanceFiles(attendanceRows);
writePollFiles(readPollSections(pollPath));
