import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { type AddressInfo } from "node:net";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { Server, type Socket as ServerSocket } from "socket.io";

function waitFor(socket: ServerSocket | ClientSocket, event: string) {
  return new Promise((resolve) => {
    socket.once(event, resolve);
  });
}

describe("Socket.IO Chat", () => {
  let io: Server;
  let serverSocket: ServerSocket;
  let clientSocket: ClientSocket;
  let httpServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    httpServer = createServer();
    io = new Server(httpServer);

    io.use((socket, next) => {
      socket.data.userId = "test-user-id";
      socket.data.username = "testuser";
      next();
    });

    io.on("connection", (socket) => {
      serverSocket = socket;
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(() => resolve());
    });

    const port = (httpServer.address() as AddressInfo).port;

    clientSocket = ioc(`http://localhost:${port}`, {
      auth: { token: "test-token" }
    });

    await waitFor(clientSocket, "connect");
  });

  afterAll(() => {
    io.close();
    clientSocket.close();
    httpServer.close();
  });

  it("receives new-message event", async () => {
    const messagePromise = waitFor(clientSocket, "new-message");

    serverSocket.emit("new-message", {
      content: "Hello World",
      sender: { username: "testuser" }
    });

    const message = await messagePromise as any;
    expect(message.content).toBe("Hello World");
  });

  it("receives user-typing event", async () => {
    const typingPromise = waitFor(clientSocket, "user-typing");

    serverSocket.emit("user-typing", {
      username: "testuser",
      isTyping: true
    });

    const data = await typingPromise as any;
    expect(data.isTyping).toBe(true);
  });
});