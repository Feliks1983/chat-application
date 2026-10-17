import { verifyToken } from './auth';
import { Socket } from 'socket.io';

export async function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth.token;

  if (typeof token !== 'string' || !token) {
    next(new Error('Authentication token required'));
    return;
  }
  try {
    const payload = verifyToken(token, 'access');
    if (payload.type !== 'access') {
      return next(new Error('Invalid token type'));
    }
    socket.data.userId = payload.sub;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
}
