import mongoose, { Schema, type Model } from 'mongoose';

export interface IRoom {
  name: string;
  description?: string;
  isPublic: boolean;
  members: mongoose.Types.ObjectId[];
  admins: mongoose.Types.ObjectId[];
  lastActivity: Date;
  createdBy: mongoose.Types.ObjectId;
}

const roomSchema = new Schema<IRoom>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    isPublic: { type: Boolean, default: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    admins: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    lastActivity: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

roomSchema.index({ isPublic: 1, lastActivity: -1 });
export default (mongoose.models.Room as Model<IRoom>) || mongoose.model<IRoom>('Room', roomSchema);
