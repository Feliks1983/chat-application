import mongoose, { Schema, type Model } from 'mongoose';

const readReceiptSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

export interface IMessage {
  room: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  content: string;
  readBy: { user: mongoose.Types.ObjectId; readAt: Date }[];
  edited: boolean;
  editedAt?: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    room: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true, maxlength: 5000 },
    readBy: { type: [readReceiptSchema], default: [] },
    edited: { type: Boolean, default: false },
    editedAt: { type: Date },
  },
  { timestamps: true }
);

messageSchema.index({ room: 1, createdAt: -1 });
export default (mongoose.models.Message as Model<IMessage>) ||
  mongoose.model<IMessage>('Message', messageSchema);
