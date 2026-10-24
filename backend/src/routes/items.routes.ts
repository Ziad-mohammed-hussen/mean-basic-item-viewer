import { Request, Response, Router } from 'express';
import {
  ensureDatabaseConnected,
  getDatabaseStatus,
  getLastConnectionError,
  sanitizeLogMessage,
} from '../config/database';
import { Item } from '../models/item.model';

export const itemsRouter = Router();

/**
 * GET /api/items
 * Retrieves all items stored in the MongoDB "items" collection.
 * Read-only endpoint: never returns hardcoded fallback arrays.
 */
itemsRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  let dbStatus = getDatabaseStatus();

  if (!dbStatus.connected) {
    await ensureDatabaseConnected();
    dbStatus = getDatabaseStatus();
  }

  if (!dbStatus.connected) {
    const diagnostic = getLastConnectionError();
    const isConfigIssue =
      diagnostic &&
      (diagnostic.includes('placeholder') ||
        diagnostic.includes('Missing MongoDB configuration') ||
        diagnostic.includes('backend/.env'));

    res.status(503).json({
      error: 'Service Unavailable',
      message: isConfigIssue
        ? 'The backend server is running, but MongoDB credentials are not configured yet. Please set your real MONGODB_USERNAME and MONGODB_PASSWORD in backend/.env.'
        : 'The backend server is running, but the MongoDB database connection is currently unavailable.',
    });
    return;
  }

  try {
    const items = await Item.find()
      .select('_id name description category createdAt updatedAt')
      .sort({ createdAt: 1, _id: 1 })
      .lean()
      .exec();

    res.status(200).json(items);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Database query failed';
    console.error(`[API] Failed to fetch items: ${sanitizeLogMessage(rawMsg)}`);

    res.status(500).json({
      error: 'Internal Server Error',
      message:
        'An unexpected error occurred while retrieving items from the database.',
    });
  }
});

/**
 * Enforce read-only API contract on /api/items
 */
itemsRouter.all('/', (req: Request, res: Response): void => {
  res.setHeader('Allow', 'GET');
  res.status(405).json({
    error: 'Method Not Allowed',
    message: `Method ${req.method} is not supported on /api/items. This endpoint is read-only.`,
  });
});
