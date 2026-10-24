import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from backend/.env if present
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const EXPECTED_DB_NAME = 'khutwa_db';

const PLACEHOLDER_VALUES = new Set([
  '',
  '<username>',
  '<password>',
  'your_username',
  'your_password',
  'changeme',
  'placeholder',
]);

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConfigError';
  }
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_VALUES.has(normalized);
}

/**
 * Redacts credentials and full MongoDB connection strings from any log message.
 */
export function sanitizeLogMessage(input: string): string {
  if (!input) {
    return '';
  }
  return input
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, 'mongodb+srv://[REDACTED]')
    .replace(/(password|passwd|pwd|secret)=([^&\s]+)/gi, '$1=[REDACTED]');
}

/**
 * Validates environment variables and resolves the MongoDB connection URI and database name.
 * Never logs or exposes credentials in error messages.
 */
export function resolveMongoConfig(env: NodeJS.ProcessEnv = process.env): {
  uri: string;
  dbName: string;
} {
  const rawUri = env.MONGODB_URI?.trim();
  const username = env.MONGODB_USERNAME?.trim();
  const password = env.MONGODB_PASSWORD?.trim();
  const dbName = env.MONGODB_DB_NAME?.trim() || EXPECTED_DB_NAME;

  if (!rawUri && isPlaceholder(username) && isPlaceholder(password)) {
    throw new DatabaseConfigError(
      'Missing MongoDB configuration. Please set MONGODB_URI (and/or MONGODB_USERNAME and MONGODB_PASSWORD) in backend/.env.'
    );
  }

  let resolvedUri = rawUri || '';

  const needsInterpolation =
    !resolvedUri ||
    resolvedUri.includes('<USERNAME>') ||
    resolvedUri.includes('<PASSWORD>');

  if (needsInterpolation) {
    if (isPlaceholder(username) || isPlaceholder(password)) {
      throw new DatabaseConfigError(
        'MongoDB credentials contain placeholders or are missing. Set valid MONGODB_USERNAME and MONGODB_PASSWORD in backend/.env, or provide a complete MONGODB_URI.'
      );
    }

    const encodedUser = encodeURIComponent(username!);
    const encodedPass = encodeURIComponent(password!);

    if (resolvedUri) {
      resolvedUri = resolvedUri
        .replace('<USERNAME>', encodedUser)
        .replace('<PASSWORD>', encodedPass);
    } else {
      resolvedUri = `mongodb+srv://${encodedUser}:${encodedPass}@cluster0.cyyf018.mongodb.net/${dbName}?retryWrites=true&w=majority`;
    }
  }

  if (
    !resolvedUri.startsWith('mongodb://') &&
    !resolvedUri.startsWith('mongodb+srv://')
  ) {
    throw new DatabaseConfigError(
      'Invalid MONGODB_URI scheme. Expected URI starting with mongodb:// or mongodb+srv://.'
    );
  }

  if (
    resolvedUri.includes('<USERNAME>') ||
    resolvedUri.includes('<PASSWORD>')
  ) {
    throw new DatabaseConfigError(
      'MONGODB_URI still contains unreplaced <USERNAME> or <PASSWORD> placeholders.'
    );
  }

  return {
    uri: resolvedUri,
    dbName,
  };
}

/**
 * Connects to MongoDB using Mongoose with safe timeout and pool settings.
 */
export async function connectToDatabase(): Promise<typeof mongoose> {
  const { uri, dbName } = resolveMongoConfig();

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  try {
    const conn = await mongoose.connect(uri, {
      dbName,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });

    const connectedDb = conn.connection.name || dbName;
    console.log(`[Database] Connected successfully to MongoDB database "${connectedDb}".`);
    return conn;
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Unknown database error';
    const safeMsg = sanitizeLogMessage(rawMsg);
    throw new Error(`Failed to connect to MongoDB (${dbName}): ${safeMsg}`);
  }
}

/**
 * Returns a safe, non-sensitive summary of the current MongoDB connection state.
 */
export function getDatabaseStatus(): {
  connected: boolean;
  readyState: number;
  state: 'disconnected' | 'connected' | 'connecting' | 'disconnecting' | 'unknown';
  dbName: string;
} {
  const readyState = mongoose.connection.readyState;
  const stateMap: Record<
    number,
    'disconnected' | 'connected' | 'connecting' | 'disconnecting'
  > = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  return {
    connected: readyState === 1,
    readyState,
    state: stateMap[readyState] ?? 'unknown',
    dbName: mongoose.connection.name || process.env.MONGODB_DB_NAME || EXPECTED_DB_NAME,
  };
}

/**
 * Gracefully closes the active MongoDB connection.
 */
export async function disconnectFromDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
