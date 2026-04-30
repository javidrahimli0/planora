import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import authRoutes from './routes/auth.routes';
import eventRoutes from './routes/event.routes';
import taskRoutes from './routes/task.routes';
import noteRoutes from './routes/note.routes';
import workspaceRoutes from './routes/workspace.routes';
import notificationRoutes from './routes/notification.routes';
import { query } from './lib/db';
import { setSocketServer } from './lib/socket';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

setSocketServer(io);

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json({ limit: '5mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/notifications', notificationRoutes);

// Socket.io connection
io.use((socket, next) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return next(new Error('JWT secret is not configured.'));
  }

  const token = typeof socket.handshake.auth?.token === 'string'
    ? socket.handshake.auth.token
    : typeof socket.handshake.query?.token === 'string'
      ? socket.handshake.query.token
      : null;

  if (!token) {
    return next(new Error('Socket token is required.'));
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as { userId: string };
    socket.data.userId = decoded.userId;
    return next();
  } catch {
    return next(new Error('Invalid socket token.'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.data.userId as string | undefined;
  if (userId) {
    socket.join(`user:${userId}`);
    query<{ workspace_id: string }>(
      `SELECT workspace_id
       FROM workspace_members
       WHERE user_id = $1`,
      [userId]
    )
      .then((result) => {
        result.rows.forEach((row) => {
          socket.join(`workspace:${row.workspace_id}`);
        });
      })
      .catch((err) => {
        console.error('workspace socket join error:', err);
      });
  }

  console.log(`Socket connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 4000;

const startServer = () => {
  httpServer.listen(PORT, () => {
    console.log(`Planora backend running on http://localhost:${PORT}`);
  });
};

startServer();
