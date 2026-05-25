import fs from 'fs';
import path from 'path';

import ChatSPReview from '../models/ChatSPReview.js';
import Student from '../models/Student.js';

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function parseChatEntries(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r\n|\n|\r/);
  const entries = [];
  let current = null;
  const patterns = [
    /^(\d{2}:\d{2}:\d{2})\s+From\s+(.+?)\s+to\s+.*?:\s*(.*)$/i,
    /^(\d{2}:\d{2}:\d{2})\t\s*From\s+(.+?)\s+:\s*(.*)$/i,
    /^(\d{2}:\d{2}:\d{2})\t(.+?)\s*:\s*(.*)$/i
  ];
  for (const line of lines) {
    const match = patterns.map(pattern => line.match(pattern)).find(Boolean);
    if (match) {
      if (current) entries.push(current);
      current = { time: match[1], sender: match[2].trim(), text: match[3].trim() };
    } else if (current && line.trim()) {
      current.text += `\n${line.trim()}`;
    }
  }
  if (current) entries.push(current);
  return entries;
}

function timeOnDate(dateValue, timeValue) {
  const [hours, minutes, seconds] = String(timeValue || '00:00:00').split(':').map(Number);
  const date = new Date(`${dateValue}T00:00:00`);
  date.setHours(hours || 0, minutes || 0, seconds || 0, 0);
  return date;
}

function extractDelta(text) {
  const awarded = String(text || '').match(/awarded\s*([+-]?\s*\d+)\s*(?:bonus\s*)?(?:sp|points?)/i);
  if (awarded) return Number(awarded[1].replace(/\s+/g, ''));
  const direct = String(text || '').match(/(^|[^\w])([+-])\s*(\d+)\s*(?:sp|points?)\b/i);
  if (direct) return Number(`${direct[2]}${direct[3]}`);
  return null;
}

function extractReplyQuote(text) {
  const match = String(text || '').match(/Replying to "([^"]+)"/i);
  if (!match) return '';
  return match[1].replace(/\.\.\.$/, '').trim();
}

function compact(text) {
  return String(text || '').replace(/\r/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildStudentIndexes(students) {
  const byName = new Map();
  for (const student of students) {
    const key = normalizeName(student.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(student);
  }
  return { byName };
}

function findStudentByName(name, indexes) {
  const key = normalizeName(name);
  if (!key) return { student: null, confidence: 'low' };
  const exact = indexes.byName.get(key) || [];
  if (exact.length === 1) return { student: exact[0], confidence: 'high' };
  if (exact.length > 1) return { student: null, confidence: 'low' };

  const candidates = [];
  for (const [studentKey, rows] of indexes.byName.entries()) {
    if (studentKey === key || studentKey.includes(key) || key.includes(studentKey)) candidates.push(...rows);
  }
  if (candidates.length === 1) return { student: candidates[0], confidence: 'medium' };
  return { student: null, confidence: 'low' };
}

function listedNames(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const start = lines.findIndex(line => /awarded\s*[+-]?\s*\d+/i.test(line));
  if (start < 0) return [];
  return lines.slice(start + 1)
    .filter(line => !/we will|soon|top picks|awarded|bonus|points/i.test(line))
    .map(line => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(line => line && line.split(/\s+/).length <= 5);
}

function sourceKey(sessionLabel, entry, delta, studentKey = '') {
  return `${sessionLabel}|${entry.time}|${entry.sender}|${delta}|${studentKey}|${compact(entry.text).slice(0, 140)}`;
}

async function upsertReview(review) {
  const exists = await ChatSPReview.exists({ sourceMessageKey: review.sourceMessageKey });
  if (exists) return false;
  await ChatSPReview.create(review);
  return true;
}

export async function scanChatSPReviews({ sessionLabel, date, chatFile, rootDir = process.cwd(), students = null }) {
  const filePath = path.resolve(rootDir, chatFile || '');
  const entries = parseChatEntries(filePath);
  if (!entries.length) return { scannedMessages: 0, createdReviews: 0 };

  const studentRows = students || await Student.find({ status: { $ne: 'excused' } }).lean();
  const indexes = buildStudentIndexes(studentRows);
  let createdReviews = 0;

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const delta = extractDelta(entry.text);
    if (!delta) continue;

    const names = listedNames(entry.text);
    if (names.length) {
      for (const name of names) {
        const match = findStudentByName(name, indexes);
        const student = match.student;
        const confidence = student ? match.confidence : 'low';
        const review = {
          sessionLabel,
          dateTime: timeOnDate(date, entry.time),
          studentName: student?.name || name,
          studentEmail: student?.email || '',
          studentId: student?._id || null,
          issuedByName: entry.sender,
          delta,
          reason: `${sessionLabel}: manual chat SP from ${entry.sender}. Listed in chat award message.`,
          evidenceText: compact(entry.text),
          sourceMessage: entry.text,
          sourceMessageKey: sourceKey(sessionLabel, entry, delta, student?.email || name),
          confidence
        };
        if (await upsertReview(review)) createdReviews++;
      }
      continue;
    }

    const quote = extractReplyQuote(entry.text);
    if (!quote) continue;

    const matches = [];
    for (let previousIndex = 0; previousIndex < index; previousIndex++) {
      const previous = entries[previousIndex];
      if (compact(previous.text).toLowerCase().includes(quote.toLowerCase())) matches.push(previous);
    }
    const target = matches[matches.length - 1];
    if (!target) continue;

    const match = findStudentByName(target.sender, indexes);
    const student = match.student;
    const confidence = matches.length === 1 && student ? match.confidence : student ? 'medium' : 'low';
    const review = {
      sessionLabel,
      dateTime: timeOnDate(date, entry.time),
      studentName: student?.name || target.sender,
      studentEmail: student?.email || '',
      studentId: student?._id || null,
      issuedByName: entry.sender,
      delta,
      reason: `${sessionLabel}: manual chat SP from ${entry.sender}. Reply matched "${quote}".`,
      evidenceText: `Reply: ${compact(entry.text)} | Matched student message: ${compact(target.text)}`,
      sourceMessage: entry.text,
      sourceMessageKey: sourceKey(sessionLabel, entry, delta),
      confidence
    };
    if (await upsertReview(review)) createdReviews++;
  }

  return { scannedMessages: entries.length, createdReviews };
}
