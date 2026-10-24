import http from 'http';
import { app } from './app';
import {
  connectToDatabase,
  disconnectFromDatabase,
  getDatabaseStatus,
  sanitizeLogMessage,
} from './config/database';

const PORT = Number(process.env.PORT) || 3001;

async function startServer(): Promise<http.Server> {
  try {
    await connectToDatabase();
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Database connection error';
    console.error(
      `[Startup] MongoDB connection could not be established: ${sanitizeLogMessage(rawMsg)}`
    );
    console.warn(
      '[Startup] Server is starting in degraded mode. Database-dependent routes (/api/items, /api/health/db) will return HTTP 503 until MongoDB is reachable.'
    );
  }

  const server = app.listen(PORT, () => {
    const dbStatus = getDatabaseStatus();
    console.log(`[Server] Express API listening on port ${PORT}`);
    console.log(
      `[Server] Health endpoint    : http://localhost:${PORT}/api/health`
    );
    console.log(
      `[Server] DB Readiness check : http://localhost:${PORT}/api/health/db (connected=${dbStatus.connected})`
    );
    console.log(
      `[Server] Items endpoint     : http://localhost:${PORT}/api/items`
    );
  });

  const shutdown = async (signal: string) => {
    console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectFromDatabase().catch(() => undefined);
      console.log('[Server] HTTP server and database connections closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  void startServer();
}

export { startServer };
