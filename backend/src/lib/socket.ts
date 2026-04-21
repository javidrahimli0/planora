import type { Server } from 'socket.io';

let ioServer: Server | null = null;

export function setSocketServer(server: Server) {
  ioServer = server;
}

export function getSocketServer() {
  return ioServer;
}
