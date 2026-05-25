import mongoose from 'mongoose';

const chatSPReviewSchema = new mongoose.Schema({
  sessionLabel: { type: String, required: true, index: true },
  dateTime: { type: Date, required: true, index: true },
  studentName: { type: String, default: '', index: true },
  studentEmail: { type: String, lowercase: true, trim: true, default: '', index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null, index: true },
  issuedByName: { type: String, required: true, index: true },
  issuedByEmail: { type: String, lowercase: true, trim: true, default: '' },
  delta: { type: Number, required: true },
  reason: { type: String, required: true },
  evidenceText: { type: String, required: true },
  sourceMessage: { type: String, required: true },
  sourceMessageKey: { type: String, required: true, unique: true, index: true },
  confidence: { type: String, enum: ['high', 'medium', 'low'], default: 'low', index: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', index: true },
  reviewedBy: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SPTransaction', default: null }
}, { timestamps: true });

chatSPReviewSchema.index({ status: 1, dateTime: 1 });
chatSPReviewSchema.index({ sessionLabel: 1, studentEmail: 1, delta: 1 });

export default mongoose.model('ChatSPReview', chatSPReviewSchema);
