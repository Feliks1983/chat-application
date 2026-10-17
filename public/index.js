const statusEl = document.getElementById('status');
const tokenInput = document.getElementById('tokenInput');
const roomIdInput = document.getElementById('roomIdInput');
const messageIdInput = document.getElementById('messageIdInput');
const messageInput = document.getElementById('messageInput');
const messagesEl = document.getElementById('messages');
const eventsEl = document.getElementById('events');
const typingEl = document.getElementById('typing');

const SERVER_URL = 'http://localhost:3000';
let socket = null;

function now() {
  return new Date().toLocaleTimeString();
}

function setStatus(text) {
  statusEl.textContent = text;
}

function logEvent(title, payload) {
  const item = document.createElement('div');
  item.className = 'item';
  item.innerHTML = `
        <strong>${title}</strong>
        <div class="meta">${now()}</div>
        <pre>${JSON.stringify(payload ?? {}, null, 2)}</pre>
    `;
  eventsEl.prepend(item);
}

function appendMessage(message) {
  const item = document.createElement('div');
  item.className = 'item';
  item.textContent = `
        <strong>${message.sender?.username ?? 'Unknown user'}</strong>
        <div>${message.content ?? message.text ?? ''}</div>
        <div class="meta">${message.createdAt ? new Date(message.createdAt).toLocaleString() : now()}</div>
    `;
  messagesEl.appendChild(item);
}

function getRoomId() {
  return roomIdInput.value.trim();
}


async function createRoom() {
  const token = tokenInput.value.trim();

  if (!token) {
    alert('Сначала введи JWT token.');
    return;
  }

  try {
    const response = await fetch(`${SERVER_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Test Room',
        description: 'Тестовая комната',
        isPublic: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Не удалось создать комнату');
    }

    roomIdInput.value = data.room._id;

    logEvent('Room created', data.room);
    alert(`Комната создана: ${data.room._id}`);
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}


function requireSocket() {
  if (!socket) {
    alert('Connect first.');
    return null;
  }

  return socket;
}

function connectSocket() {
  const token = tokenInput.value.trim();
  if (!token) {
    alert('JWT token is required.');
    return;
  }

  if (socket) {
    socket.disconnect();
  }

  socket = io(SERVER_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.onAny((event, ...args) => {
    console.log('<-', event, args);
  });

  socket.on('connect', () => {
    setStatus(`Connected: ${socket.id}`);
    logEvent('connect', { socketId: socket.id });
  });

  socket.on('disconnect', reason => {
    setStatus(`Disconnected: ${reason || 'socket closed'}`);
    typingEl.textContent = '';
    logEvent('disconnect', { reason });
  });

  socket.on('connect_error', error => {
    setStatus(`Connection error: ${error.message}`);
    logEvent('connect_error', { message: error.message });
  });

  socket.on('new-message', message => {
    appendMessage(message);
    logEvent('new-message', message);
    if (message._id) {
      messageIdInput.value = String(message._id);
    }
  });

  socket.on('user-typing', ({ username, isTyping, userId }) => {
    typingEl.textContent = isTyping ? `${username} (${userId}) is typing...` : '';
    logEvent('user-typing', { username, isTyping, userId });
  });

  socket.on('user-joined-room', payload => {
    logEvent('user-joined-room', payload);
  });

  socket.on('user-left-room', payload => {
    logEvent('user-left-room', payload);
  });

  socket.on('user-offline', payload => {
    logEvent('user-offline', payload);
  });

  socket.on('message-read', payload => {
    logEvent('message-read', payload);
  });

  socket.on('error', payload => {
    logEvent('error', payload);
  });
}

function joinRoom() {
  const activeSocket = requireSocket();
  const roomId = getRoomId();
  if (!activeSocket || !roomId) {
    return;
  }

  activeSocket.emit('join-room', { roomId });
  logEvent('emit join-room', { roomId });
}

function leaveRoom() {
  const activeSocket = requireSocket();
  const roomId = getRoomId();
  if (!activeSocket || !roomId) {
    return;
  }

  activeSocket.emit('leave-room', { roomId });
  logEvent('emit leave-room', { roomId });
}

function sendMessage() {
  const activeSocket = requireSocket();
  const roomId = getRoomId();
  const content = messageInput.value.trim();
  if (!activeSocket || !roomId || !content) {
    if (!roomId) alert('Сначала укажи Room ID.');
    if (!content) return;
    return;
  }

  if (!activeSocket.connected) {
    alert('Socket.IO не подключён.');
    return;
  }

  activeSocket.emit('send-message', { roomId, content });
  response => {
    if (response?.error) {
      logEvent('send-message error', response);
      alert(response.error);
      return;
    }
    logEvent(
      'send-message response',
      response ?? {
        message: 'Событие отправлено серверу',
      }
    );
  };
  logEvent('emit send-message', { roomId, content });
  messageInput.value = '';
  emitTyping(false);
}

function emitTyping(isTyping) {
  const activeSocket = requireSocket();
  const roomId = getRoomId();
  if (!activeSocket || !roomId) {
    return;
  }

  activeSocket.emit('typing', { roomId, isTyping });
  logEvent('emit typing', { roomId, isTyping });
}

function markRead() {
  const activeSocket = requireSocket();
  const messageId = messageIdInput.value.trim();
  if (!activeSocket || !messageId) {
    return;
  }

  activeSocket.emit('message-read', { messageId });
  logEvent('emit message-read', { messageId });
}

document.getElementById('connectButton').addEventListener('click', connectSocket);
document.getElementById('disconnectButton').addEventListener('click', () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  setStatus('Disconnected');
  typingEl.textContent = '';
});
document.getElementById('joinButton').addEventListener('click', joinRoom);
document.getElementById('leaveButton').addEventListener('click', leaveRoom);
document.getElementById('sendButton').addEventListener('click', sendMessage);
document.getElementById('typingStartButton').addEventListener('click', () => emitTyping(true));
document.getElementById('typingStopButton').addEventListener('click', () => emitTyping(false));
document.getElementById('readButton').addEventListener('click', markRead);
document
    .getElementById('createRoomButton')
    .addEventListener('click', createRoom);
messageInput.addEventListener('input', () => {
  if (socket && getRoomId()) {
    emitTyping(true);
  }
});

messageInput.addEventListener('blur', () => {
  if (socket && getRoomId()) {
    emitTyping(false);
  }
});
