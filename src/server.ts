import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';
import cors from 'cors';
import helmet from 'helmet';
import { Server } from 'socket.io';
import path from 'node:path';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import User from './models/User.js';
import {router as authRoutes} from './routes/auth';
import {router as roomRoutes} from './routes/rooms';
import { socketAuthMiddleware } from './middleware/socketAuth.js';
import { registerChatHandlers } from './socket/chatHandlers.js';
import Room from './models/Room.js';

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ["http://127.0.0.1:5500",
      "http://localhost:5500"], methods: ['GET', 'POST'] },
});
const port = Number(process.env.PORT || 3000);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/rooms') {
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Request body:', req.body);
  }
  next();
});
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  const err = error as { status?: number; code?: number; message?: string };
  if (err.code === 11000) {
    res.status(400).json({ error: 'A record with these details already exists' });
    return;
  }
  const status = err.status && [400, 401, 404].includes(err.status) ? err.status : 500;
  res
    .status(status)
    .json({ error: status === 500 ? 'Internal server error' : err.message || 'Request failed' });
});

io.use(socketAuthMiddleware);
io.on('connection', async (socket) => {
  const userId = socket.data.userId;

  try {
    registerChatHandlers(io, socket);
    const user = await User.findByIdAndUpdate(
      userId,
      { isOnline: true, lastSeen: new Date() },
      { returnDocument: 'after' }
    );
    if (!user) {
      socket.disconnect(true);
      return;
    }
    socket.data.username = user.username;
    const rooms = await Room.find({ members: user._id }).select('_id');
    for (const room of rooms) socket.join(String(room._id));
    io.emit('user-online', { userId, username: user.username, lastSeen: user.lastSeen });
    
    socket.on('disconnect', async () => {
      const updated = await User.findByIdAndUpdate(
        userId,
        { isOnline: false, lastSeen: new Date() },
        { returnDocument: 'after' }
      );
      if (updated)
        io.emit('user-offline', { userId, username: updated.username, lastSeen: updated.lastSeen });
    });
  } catch (error) {
    console.error('Socket connection setup failed:', error);
    socket.disconnect(true);
  }
});

async function start() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
    throw new Error('JWT_SECRET must be configured and contain at least 24 characters');
  }
  await connectDatabase(process.env.MONGODB_URI);
  httpServer.listen(port, () => console.log(`Chat server listening on http://localhost:${port}`));
}
async function shutdown() {
  io.close();
  httpServer.close();
  await disconnectDatabase();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

start().catch(error => {
  console.error('Server startup failed:', error);
  process.exit(1);
});
