import mongoose from 'mongoose';

export async function connectDatabase(uri: string): Promise<void> {
  mongoose.connection.on('error', err => console.error('MongoDB error:', err));
  await mongoose.connect(uri);
  console.log('MongoDB connected');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  console.log('MongoDB disconnected');
}
