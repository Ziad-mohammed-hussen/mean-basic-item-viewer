import {
  connectToDatabase,
  disconnectFromDatabase,
  EXPECTED_DB_NAME,
  getDatabaseStatus,
  sanitizeLogMessage,
} from '../config/database';
import { Item } from '../models/item.model';

async function verifyDatabase(): Promise<void> {
  try {
    console.log('[Verify] Checking MongoDB configuration and connectivity...');
    await connectToDatabase();

    const status = getDatabaseStatus();
    console.log(`[Verify] Connected State : ${status.state}`);
    console.log(`[Verify] Database Name   : ${status.dbName}`);

    if (status.dbName !== EXPECTED_DB_NAME) {
      console.warn(
        `[Verify] Warning: Connected database "${status.dbName}" differs from expected "${EXPECTED_DB_NAME}".`
      );
    }

    const itemCount = await Item.countDocuments();
    console.log(`[Verify] Collection "items" record count: ${itemCount}`);

    await disconnectFromDatabase();
    console.log('[Verify] Database verification succeeded.');
    process.exit(0);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Verify] Database verification failed: ${sanitizeLogMessage(rawMsg)}`);
    await disconnectFromDatabase().catch(() => undefined);
    process.exit(1);
  }
}

if (require.main === module) {
  void verifyDatabase();
}
