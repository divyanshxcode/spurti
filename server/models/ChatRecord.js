import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema({
  time: { type: String, default: '' },
  message: { type: String, default: '' },
  score: { type: Number, default: 0 },
  sentiment: { type: String, enum: ['positive', 'negative', 'neutral'], default: 'neutral' }
}, { _id: false });

const chatRecordSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  sessionLabel: { type: String, required: true, index: true },
  messages: { type: [chatMessageSchema], default: [] },
  positiveCount: { type: Number, default: 0 },
  negativeCount: { type: Number, default: 0 },
  neutralCount: { type: Number, default: 0 },
  overallSentiment: { type: String, enum: ['positive', 'negative', 'neutral'], default: 'neutral' },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SPTransaction' }
}, { timestamps: true });

chatRecordSchema.index({ email: 1, sessionLabel: 1 }, { unique: true });

export default mongoose.model('ChatRecord', chatRecordSchema);
