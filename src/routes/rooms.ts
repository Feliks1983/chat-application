import { Router } from 'express';
import mongoose from 'mongoose';
import Room from '../models/Room.js';
import Message from '../models/Message.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';

export const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const rooms = await Room.find({ $or: [{ isPublic: true }, { members: userId }] })
      .sort({ lastActivity: -1 })
      .populate('members', 'username isOnline lastSeen')
      .populate('admins', 'username')
      .lean();
    res.json({ rooms });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
    const isPublic = req.body.isPublic === undefined ? true : req.body.isPublic;
    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ error: 'Room name must contain 2–80 characters' });
      return;
    }
    if (typeof isPublic !== 'boolean') {
      res.status(400).json({ error: 'isPublic must be a boolean' });
      return;
    }
    if (description.length > 500) {
      res.status(400).json({ error: 'Description must be at most 500 characters' });
      return;
    }
    const id = new mongoose.Types.ObjectId(req.user!.userId);
    const room = await Room.create({
      name,
      description,
      isPublic,
      members: [id],
      admins: [id],
      createdBy: id,
      lastActivity: new Date(),
    });
    res.status(201).json({ room });
  } catch (error) {
    next(error);
  }
});

router.get('/:roomId/messages', async (req: AuthRequest, res, next) => {
  try {
    const { roomId } = req.params;
    if (!mongoose.isValidObjectId(roomId)) {
      res.status(400).json({ error: 'Invalid room id' });
      return;
    }
    const room = await Room.findById(roomId);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    const isMember = room.members.some(id => id.toString() === req.user!.userId);
    if (!room.isPublic && !isMember) {
      res.status(403).json({ error: 'You do not have access to this room' });
      return;
    }
    const limitRaw = Number.parseInt(String(req.query.limit ?? '50'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 50;
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    if (before && Number.isNaN(before.getTime())) {
      res.status(400).json({ error: 'Invalid before date' });
      return;
    }
    const filter: Record<string, unknown> = { room: room._id };
    if (before) filter.createdAt = { $lt: before };
    const newestFirst = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('sender', 'username')
      .lean();
    res.json({ messages: newestFirst.reverse(), limit });
  } catch (error) {
    next(error);
  }
});

