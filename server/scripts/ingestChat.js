import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';

const chatPath = process.argv[2] || 'C:\\Users\\Dled\\Downloads\\17 May\\chat.txt';
const session = process.argv[3] || '17 May Weekend Special';

const filler = new Set([
  'hi', 'hii', 'hello', 'helo', 'hlo', 'hey', 'yes', 'no', 'ok', 'okay', 'done',
  'good evening', 'good evening sir', 'good evening everyone', 'good evening all',
  'hi sir', 'hello sir', 'hlo sir', 'thank you', 'thanks'
]);

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeMessage(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function isValidMessage(message) {
  const normalized = normalizeMessage(message)
    .replace(/^replying to .*/i, '')
    .trim();
  if (!normalized) return false;
  if (normalized.startsWith('reacted to')) return false;
  if (filler.has(normalized)) return false;
  if (normalized.length < 8) return false;
  return true;
}

function parseChat(text) {
  const entries = [];
  const lines = text.split(/\r?\n/);
  const fromEntryRe = /^(\d{2}:\d{2}:\d{2})\s+From\s+(.+?)\s+:\s*(.*)$/;
  const tabEntryRe = /^(\d{2}:\d{2}:\d{2})\t(.+?):\t(.*)$/;
  let current = null;

  for (const line of lines) {
    const match = line.match(fromEntryRe) || line.match(tabEntryRe);
    if (match) {
      if (current) entries.push(current);
      current = { time: match[1], name: match[2].trim(), message: match[3].trim() };
    } else if (current && line.trim()) {
      current.message = `${current.message}\n${line.trim()}`.trim();
    }
  }
  if (current) entries.push(current);
  return entries;
}

function chatSp(validMessages) {
  if (validMessages >= 3) return 5;
  if (validMessages >= 1) return 2;
  return 0;
}

async function run() {
  const text = fs.readFileSync(chatPath, 'utf8');
  const entries = parseChat(text);
  const students = await Student.find();
  const nameMap = new Map();
  for (const student of students) {
    const key = normalizeName(student.name);
    if (!key) continue;
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key).push(student);
  }

  const grouped = new Map();
  const unmatched = new Map();
  for (const entry of entries) {
    const key = normalizeName(entry.name);
    const candidates = nameMap.get(key) || [];
    if (candidates.length !== 1) {
      unmatched.set(entry.name, (unmatched.get(entry.name) || 0) + 1);
      continue;
    }
    const student = candidates[0];
    const id = String(student._id);
    if (!grouped.has(id)) grouped.set(id, { student, messages: 0, validMessages: 0, ignoredMessages: 0, samples: [] });
    const record = grouped.get(id);
    record.messages += 1;
    if (isValidMessage(entry.message)) {
      record.validMessages += 1;
      if (record.samples.length < 3) record.samples.push(entry.message.slice(0, 160));
    } else {
      record.ignoredMessages += 1;
    }
  }

  for (const record of grouped.values()) {
    const sp = chatSp(record.validMessages);
    const chatRecord = {
      session,
      messages: record.messages,
      validMessages: record.validMessages,
      ignoredMessages: record.ignoredMessages,
      sp,
      reason: sp
        ? `${record.validMessages} valid chat message(s) in ${session}; chat SP capped at 5`
        : `No valid chat message found in ${session}`,
      samples: record.samples
    };
    await Student.updateOne(
      { _id: record.student._id },
      { $pull: { chats: { session } } }
    );
    await Student.updateOne(
      { _id: record.student._id },
      { $push: { chats: chatRecord } }
    );
  }

  const uploadDir = path.resolve('data/uploads', session.startsWith('15 May') ? '2026-05-15' : session.startsWith('16 May') ? '2026-05-16' : '2026-05-17');
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.copyFileSync(chatPath, path.join(uploadDir, `${session.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-chat.txt`));

  console.log(`Parsed ${entries.length} chat entries`);
  console.log(`Matched students: ${grouped.size}`);
  console.log(`Unmatched/ambiguous display names: ${unmatched.size}`);
  console.log(`Chat source copied to ${uploadDir}`);
}

await mongoose.connect(MONGO_URI);
run().finally(async () => {
  await mongoose.disconnect();
});
