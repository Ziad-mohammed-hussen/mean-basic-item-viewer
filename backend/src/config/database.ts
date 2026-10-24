import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

export const EXPECTED_DB_NAME = 'khutwa_db';

const ENV_PATHS = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
];

/**
 * Loads or reloads environment variables from backend/.env (and project root .env if present).
 */
export function loadEnvFiles(override = false): void {
  for (const envPath of ENV_PATHS) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override });
    }
  }
}

// Initial load at module import
loadEnvFiles(false);

const PLACEHOLDER_VALUES = new Set([
  '',
  '<username>',
  '<password>',
  'your_username',
  'your_password',
  'your_actual_mongodb_username',
  'your_actual_mongodb_password',
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
 * Safely encodes a credential component without double-encoding already percent-encoded sequences.
 */
function safeEncodeCredential(raw: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(raw));
  } catch {
    return encodeURIComponent(raw);
  }
}

/**
 * If a raw MongoDB URI contains unencoded special characters in the user:password section
 * (e.g. an unescaped '@' or '#' in the password), normalizes and URL-encodes the credentials.
 */
function normalizeMongoUriCredentials(uri: string): string {
  const schemeMatch = uri.match(/^(mongodb(?:\+srv)?:\/\/)(.*)$/i);
  if (!schemeMatch) {
    return uri;
  }
  const scheme = schemeMatch[1];
  const remainder = schemeMatch[2];

  // Separate authority (userinfo@host) from path/query
  const slashIndex = remainder.indexOf('/');
  const authority = slashIndex === -1 ? remainder : remainder.slice(0, slashIndex);
  const pathAndQuery = slashIndex === -1 ? '' : remainder.slice(slashIndex);

  // Use lastIndexOf('@') in authority so passwords containing '@' are split correctly from host
  const atIndex = authority.lastIndexOf('@');
  if (atIndex === -1) {
    return uri;
  }

  const userInfo = authority.slice(0, atIndex);
  const hostPart = authority.slice(atIndex + 1);

  const colonIndex = userInfo.indexOf(':');
  if (colonIndex === -1) {
    return uri;
  }

  const rawUser = userInfo.slice(0, colonIndex);
  const rawPass = userInfo.slice(colonIndex + 1);

  if (rawUser === '<USERNAME>' || rawPass === '<PASSWORD>') {
    return uri;
  }

  const encodedUser = safeEncodeCredential(rawUser);
  const encodedPass = safeEncodeCredential(rawPass);

  return `${scheme}${encodedUser}:${encodedPass}@${hostPart}${pathAndQuery}`;
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

let lastConnectionError: string | null = null;

export function getLastConnectionError(): string | null {
  return lastConnectionError;
}

/**
 * Validates environment variables and resolves the MongoDB connection URI and database name.
 * Never logs or exposes credentials in error messages.
 */
export function resolveMongoConfig(env?: NodeJS.ProcessEnv): {
  uri: string;
  dbName: string;
} {
  if (!env) {
    loadEnvFiles(true);
  }
  const targetEnv = env ?? process.env;

  const rawUri = (targetEnv.MONGODB_URI || targetEnv.MONGO_URI)?.trim();
  const username = (
    targetEnv.MONGODB_USERNAME || targetEnv.MONGO_USERNAME
  )?.trim();
  const password = (
    targetEnv.MONGODB_PASSWORD || targetEnv.MONGO_PASSWORD
  )?.trim();
  const dbName = targetEnv.MONGODB_DB_NAME?.trim() || EXPECTED_DB_NAME;

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
        'MongoDB credentials in backend/.env still contain placeholders (<USERNAME>/<PASSWORD>) or are empty. Please set your real MongoDB Atlas username and password in backend/.env.'
      );
    }

    const encodedUser = safeEncodeCredential(username!);
    const encodedPass = safeEncodeCredential(password!);

    if (resolvedUri) {
      resolvedUri = resolvedUri
        .replace('<USERNAME>', encodedUser)
        .replace('<PASSWORD>', encodedPass);
    } else {
      resolvedUri = `mongodb+srv://${encodedUser}:${encodedPass}@cluster0.cyyf018.mongodb.net/${dbName}?retryWrites=true&w=majority`;
    }
  } else {
    resolvedUri = normalizeMongoUriCredentials(resolvedUri);
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
  if (mongoose.connection.readyState === 1) {
    lastConnectionError = null;
    return mongoose;
  }

  try {
    const { uri, dbName } = resolveMongoConfig();

    const conn = await mongoose.connect(uri, {
      dbName,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });

    const connectedDb = conn.connection.name || dbName;
    lastConnectionError = null;
    console.log(
      `[Database] Connected successfully to MongoDB database "${connectedDb}".`
    );
    return conn;
  } catch (err) {
    const rawMsg =
      err instanceof Error ? err.message : 'Unknown database error';
    const safeMsg = sanitizeLogMessage(rawMsg);
    lastConnectionError = safeMsg;
    throw new Error(`Failed to connect to MongoDB (${EXPECTED_DB_NAME}): ${safeMsg}`);
  }
}

/**
 * Attempts to establish a connection if currently disconnected and valid configuration is present.
 * Allows hot-reloading of backend/.env without requiring a manual server restart.
 */
export async function ensureDatabaseConnected(): Promise<boolean> {
  if (mongoose.connection.readyState === 1) {
    return true;
  }
  if (mongoose.connection.readyState === 2) {
    return false;
  }

  try {
    // Validate config first (fast, non-network check); throws DatabaseConfigError if .env is still placeholder
    resolveMongoConfig();
    await connectToDatabase();
    return Number(mongoose.connection.readyState) === 1;
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Database connection error';
    lastConnectionError = sanitizeLogMessage(rawMsg);
    return false;
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
  diagnosticMessage?: string;
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

  const connected = readyState === 1;

  return {
    connected,
    readyState,
    state: stateMap[readyState] ?? 'unknown',
    dbName:
      mongoose.connection.name ||
      process.env.MONGODB_DB_NAME ||
      EXPECTED_DB_NAME,
    ...(!connected && lastConnectionError
      ? { diagnosticMessage: lastConnectionError }
      : {}),
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
