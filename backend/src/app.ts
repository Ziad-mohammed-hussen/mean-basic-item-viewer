import cors from 'cors';
import express, { Express, NextFunction, Request, Response } from 'express';
import { getDatabaseStatus, sanitizeLogMessage } from './config/database';
import { itemsRouter } from './routes/items.routes';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  // Configure CORS for the frontend origin(s)
  const rawOrigins =
    process.env.CORS_ORIGIN || 'http://localhost:4201,http://localhost:4200';
  const allowedOrigins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (such as server-to-server or curl health checks)
        if (!origin) {
          callback(null, true);
          return;
        }
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin not allowed by CORS policy'));
      },
      methods: ['GET', 'HEAD', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept'],
    })
  );

  app.use(express.json({ limit: '16kb' }));

  // Safe request logging middleware (never logs credentials or sensitive headers)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      console.log(
        `[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`
      );
    });
    next();
  });

  /**
   * GET /api/health
   * Reports whether the Express API process is running.
   */
  app.get('/api/health', (_req: Request, res: Response) => {
    const dbStatus = getDatabaseStatus();
    res.status(200).json({
      status: 'ok',
      service: 'mean-basic-item-viewer-api',
      timestamp: new Date().toISOString(),
      database: {
        connected: dbStatus.connected,
        state: dbStatus.state,
      },
    });
  });

  /**
   * GET /api/health/db
   * Separate database-readiness check that distinguishes a running server from a connected database.
   * Returns HTTP 200 when connected to MongoDB, or HTTP 503 when disconnected.
   */
  app.get('/api/health/db', (_req: Request, res: Response) => {
    const dbStatus = getDatabaseStatus();
    const statusCode = dbStatus.connected ? 200 : 503;

    res.status(statusCode).json({
      status: dbStatus.connected ? 'ready' : 'not_ready',
      database: {
        connected: dbStatus.connected,
        state: dbStatus.state,
        dbName: dbStatus.dbName,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Mount read-only items API
  app.use('/api/items', itemsRouter);

  // Structured 404 response for unknown routes
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `The requested route ${req.method} ${req.originalUrl} does not exist.`,
    });
  });

  // Global error handler — prevents stack traces or internal details from leaking
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err.message === 'Origin not allowed by CORS policy') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Cross-origin request blocked by CORS policy.',
      });
      return;
    }

    console.error(`[Error] ${sanitizeLogMessage(err.message || 'Unhandled server error')}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while processing the request.',
    });
  });

  return app;
}

export const app = createApp();
