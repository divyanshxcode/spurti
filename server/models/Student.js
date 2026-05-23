import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  alternateEmail: { type: String, lowercase: true, trim: true, default: '', index: true },
  internshipStartDate: { type: Date, required: true, index: true },
  internshipEndDate: { type: Date, default: null },
  totalSp: { type: Number, default: 100, index: true }
}, { timestamps: true });

studentSchema.index({ name: 'text', email: 'text', alternateEmail: 'text' });

export default mongoose.model('Student', studentSchema);
