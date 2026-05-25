import mongoose from 'mongoose';

import { MONGO_URI } from '../config.js';
import { scanChatSPReviews } from '../services/chatSpReview.js';

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    out[key] = value;
  }
  return out;
}

function usage() {
  console.error(`Usage:
npm run scan-chat-sp -- --label "23 May Morning" --date 2026-05-23 --chat data/uploads/2026-05-23/chat_23_May.txt`);
}

async function run() {
  const options = args(process.argv.slice(2));
  if (!options.label || !options.date || !options.chat) {
    usage();
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  const stats = await scanChatSPReviews({
    sessionLabel: options.label,
    date: options.date,
    chatFile: options.chat,
    rootDir: process.cwd()
  });
  console.log(JSON.stringify(stats, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
