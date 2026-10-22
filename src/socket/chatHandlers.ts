import mongoose from 'mongoose';
import type { Server, Socket } from 'socket.io';
import Room from '../models/Room.js';
import Message from '../models/Message.js';

type ChatSocket = Socket & { data: { userId: string; username?: string } };

export function registerChatHandlers(io: Server, socket: ChatSocket): void {
  const userId = socket.data.userId;

  socket.on('send-message', async (payload: { roomId?: string; content?: string }) => {
    try {
      console.log('[send-message] payload:', payload);
      const roomId = payload?.roomId;
      const content = typeof payload?.content === 'string' ? payload.content.trim() : '';
      if (!roomId || !mongoose.isValidObjectId(roomId) || !content || content.length > 5000) {
        socket.emit('error', {
          message: 'Valid roomId and content (1–5000 characters) are required',
        });
        return;
      }
      const room = await Room.findById(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      const member = room.members.some(id => id.toString() === userId);
      if (!room.isPublic && !member) {
        socket.emit('error', { message: 'Room access denied' });
        return;
      }

      socket.join(roomId);
      const result = await Message.create({
        room: room._id,
        sender: userId,
        content,
      });

      const message = await Message.findById(result._id).populate('sender', 'username').lean();

      if (!message) {
        socket.emit('error', { message: 'Failed to load saved message' });
        return;
      }
      room.lastActivity = new Date();
      if (room.isPublic && !member) room.members.push(new mongoose.Types.ObjectId(userId));
      await room.save();

    } catch(error) {
      console.error('send-message failed:', error);
      socket.emit('error', { message: 'Could not send message' });
    }
  });

  socket.on('typing', async (payload: { roomId?: string; isTyping?: boolean }) => {
    try {
      const { roomId, isTyping } = payload ?? {};
      if (!roomId || !mongoose.isValidObjectId(roomId) || typeof isTyping !== 'boolean') return;
      const room = await Room.findById(roomId);
      if (!room) return;
      const member = room.members.some(id => id.toString() === userId);
      if (!room.isPublic && !member) return;
      socket.to(roomId).emit('user-typing', { userId, username: socket.data.username, isTyping });
    } catch(error) {
      console.error('send-message failed:', error);
    }
  });

  socket.on('join-room', async (payload: { roomId?: string }) => {
    try {
      console.log('[join-room] payload:', payload);
      const roomId = payload?.roomId;
      if (!roomId || !mongoose.isValidObjectId(roomId)) {
        socket.emit('error', { message: 'Invalid room id' });
        return;
      }
      const room = await Room.findById(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      const member = room.members.some(id => id.toString() === userId);
      if (!room.isPublic && !member) {
        socket.emit('error', { message: 'Room access denied' });
        return;
      }
      socket.join(roomId);
      if (room.isPublic && !member) {
        room.members.push(new mongoose.Types.ObjectId(userId));
        await room.save();
      }
      socket
        .to(roomId)
        .emit('user-joined-room', { roomId, userId, username: socket.data.username });
    } catch (error) {
      console.error('send-message failed:', error);
      socket.emit('error', { message: 'Could not join room' });
    }
  });

  socket.on('leave-room', (payload: { roomId?: string }) => {
    const roomId = payload?.roomId;
    if (!roomId || !mongoose.isValidObjectId(roomId)) {
      socket.emit('error', { message: 'Invalid room id' });
      return;
    }
    socket.leave(roomId);
    socket.to(roomId).emit('user-left-room', { roomId, userId, username: socket.data.username });
  });

  socket.on('message-read', async (payload: { messageId?: string }) => {
    try {
      const messageId = payload?.messageId;
      if (!messageId || !mongoose.isValidObjectId(messageId)) {
        socket.emit('error', { message: 'Invalid message id' });
        return;
      }
      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }
      const room = await Room.findById(message.room);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      const member = room.members.some(id => id.toString() === userId);
      if (!room.isPublic && !member) {
        socket.emit('error', { message: 'Room access denied' });
        return;
      }
      const alreadyRead = message.readBy.some(receipt => receipt.user.toString() === userId);
      if (!alreadyRead) {
        const readAt = new Date();
        message.readBy.push({ user: new mongoose.Types.ObjectId(userId), readAt });
        await message.save();
        io.to(String(room._id)).emit('message-read', {
          messageId,
          roomId: String(room._id),
          userId,
          readAt,
        });
      }
    } catch (error) {
      console.error('send-message failed:', error);
      socket.emit('error', { message: 'Could not mark message as read' });
    }
  });
}