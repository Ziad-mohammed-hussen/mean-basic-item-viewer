import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { createApp } from '../app';
import {
  DatabaseConfigError,
  EXPECTED_DB_NAME,
  resolveMongoConfig,
  sanitizeLogMessage,
} from '../config/database';
import { Item } from '../models/item.model';
import { SAMPLE_ITEMS, seedItemsCollection } from '../scripts/seed';

interface JsonResponse {
  status: number;
  headers: Record<string, string | string[] | number | undefined>;
  body: any;
}

/**
 * Dispatches an HTTP request against the Express app.
 * Attempts a real loopback HTTP request first; if the execution environment
 * restricts loopback sockets (EPERM), falls back to dispatching directly through the Express app.
 */
function dispatchExpressRequest(
  appInstance: ReturnType<typeof createApp>,
  method: string,
  urlPath: string,
  headers: Record<string, string> = {}
): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const req = Object.assign(new EventEmitter(), {
      method: method.toUpperCase(),
      url: urlPath,
      originalUrl: urlPath,
      headers: {
        accept: 'application/json',
        ...Object.fromEntries(
          Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
        ),
      },
      socket: { remoteAddress: '127.0.0.1' },
      connection: { remoteAddress: '127.0.0.1' },
    }) as unknown as http.IncomingMessage;

    const responseHeaders: Record<string, string | string[] | number | undefined> = {};
    const chunks: Buffer[] = [];

    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headersSent: false,
      setHeader(name: string, value: string | string[] | number) {
        responseHeaders[name.toLowerCase()] = value;
        return this;
      },
      getHeader(name: string) {
        return responseHeaders[name.toLowerCase()];
      },
      removeHeader(name: string) {
        delete responseHeaders[name.toLowerCase()];
      },
      writeHead(
        statusCode: number,
        hdrs?: Record<string, string | string[] | number>
      ) {
        this.statusCode = statusCode;
        if (hdrs) {
          for (const [k, v] of Object.entries(hdrs)) {
            responseHeaders[k.toLowerCase()] = v;
          }
        }
        return this;
      },
      write(chunk: string | Buffer) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        return true;
      },
      end(chunk?: string | Buffer) {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        }
        this.headersSent = true;
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed: any = raw;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          // leave raw string
        }
        this.emit('finish');
        resolve({
          status: this.statusCode,
          headers: responseHeaders,
          body: parsed,
        });
        return this;
      },
    }) as unknown as http.ServerResponse;

    try {
      appInstance(req, res);
      // Emit end on next tick for body-parser middleware if needed
      process.nextTick(() => req.emit('end'));
    } catch (err) {
      reject(err);
    }
  });
}

describe('MEAN Stack Basic Item Viewer — Backend Verification Suite', () => {
  const app = createApp();
  let server: http.Server | null = null;
  let baseUrl = '';

  before(async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        const srv = app.listen(0, '127.0.0.1', () => {
          server = srv;
          const address = srv.address();
          if (address && typeof address === 'object') {
            baseUrl = `http://127.0.0.1:${address.port}`;
          }
          resolve();
        });
        srv.on('error', reject);
      });
    } catch {
      server = null;
    }
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
    }
  });

  async function requestJson(
    method: string,
    path: string,
    headers: Record<string, string> = {}
  ): Promise<JsonResponse> {
    if (baseUrl) {
      try {
        return await new Promise<JsonResponse>((resolve, reject) => {
          const url = new URL(path, baseUrl);
          const req = http.request(
            url,
            {
              method,
              headers: {
                Accept: 'application/json',
                ...headers,
              },
            },
            (res) => {
              let raw = '';
              res.on('data', (chunk) => {
                raw += chunk;
              });
              res.on('end', () => {
                let parsed: any = raw;
                try {
                  parsed = raw ? JSON.parse(raw) : null;
                } catch {
                  // keep raw string
                }
                resolve({
                  status: res.statusCode || 0,
                  headers: res.headers,
                  body: parsed,
                });
              });
            }
          );
          req.on('error', reject);
          req.end();
        });
      } catch (err: any) {
        if (err && (err.code === 'EPERM' || err.code === 'EACCES')) {
          return dispatchExpressRequest(app, method, path, headers);
        }
        throw err;
      }
    }
    return dispatchExpressRequest(app, method, path, headers);
  }

  describe('1. MongoDB Environment & Security Configuration', () => {
    it('validates that expected database name is khutwa_db', () => {
      assert.equal(EXPECTED_DB_NAME, 'khutwa_db');
    });

    it('throws DatabaseConfigError when environment variables are missing', () => {
      assert.throws(
        () => resolveMongoConfig({}),
        (err: unknown) => err instanceof DatabaseConfigError
      );
    });

    it('throws DatabaseConfigError when placeholders (<USERNAME>/<PASSWORD>) are unreplaced', () => {
      assert.throws(
        () =>
          resolveMongoConfig({
            MONGODB_URI:
              'mongodb+srv://<USERNAME>:<PASSWORD>@cluster0.cyyf018.mongodb.net/khutwa_db?retryWrites=true&w=majority',
            MONGODB_USERNAME: '<USERNAME>',
            MONGODB_PASSWORD: '<PASSWORD>',
          }),
        (err: unknown) => err instanceof DatabaseConfigError
      );
    });

    it('interpolates and URL-encodes special characters in username and password', () => {
      const config = resolveMongoConfig({
        MONGODB_URI:
          'mongodb+srv://<USERNAME>:<PASSWORD>@cluster0.cyyf018.mongodb.net/khutwa_db?retryWrites=true&w=majority',
        MONGODB_USERNAME: 'khutwa_user',
        MONGODB_PASSWORD: 'p@ss:w/rd#1',
      });

      assert.equal(config.dbName, 'khutwa_db');
      assert.equal(
        config.uri,
        'mongodb+srv://khutwa_user:p%40ss%3Aw%2Frd%231@cluster0.cyyf018.mongodb.net/khutwa_db?retryWrites=true&w=majority'
      );
    });

    it('redacts connection strings and credentials from log messages', () => {
      const unsafe =
        'Connection failed for mongodb+srv://admin:superSecret123@cluster0.cyyf018.mongodb.net/khutwa_db';
      const sanitized = sanitizeLogMessage(unsafe);
      assert.ok(!sanitized.includes('superSecret123'));
      assert.ok(sanitized.includes('mongodb+srv://[REDACTED]'));
    });
  });

  describe('2. Mongoose Item Model Validation', () => {
    it('requires the item name field', () => {
      const invalidItem = new Item({
        description: 'Missing name field',
        category: 'General',
      });
      const validationError = invalidItem.validateSync();
      assert.ok(validationError);
      assert.ok(validationError.errors.name);
    });

    it('accepts valid item with name, optional description, and category', () => {
      const validItem = new Item({
        name: '  Mechanical Wireless Keyboard  ',
        description: '  Compact tactile keyboard  ',
        category: '  Electronics  ',
      });
      const validationError = validItem.validateSync();
      assert.equal(validationError, undefined);
      assert.equal(validItem.name, 'Mechanical Wireless Keyboard');
      assert.equal(validItem.description, 'Compact tactile keyboard');
      assert.equal(validItem.category, 'Electronics');
      assert.ok(validItem._id);
    });
  });

  describe('3. Health, Readiness, and Error Handling (Disconnected DB State)', () => {
    it('GET /api/health returns HTTP 200 and reports server status', async () => {
      const res = await requestJson('GET', '/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
      assert.equal(res.body.service, 'mean-basic-item-viewer-api');
      assert.equal(typeof res.body.database.connected, 'boolean');
    });

    it('GET /api/health/db returns HTTP 503 when MongoDB is disconnected', async () => {
      const res = await requestJson('GET', '/api/health/db');
      assert.equal(res.status, 503);
      assert.equal(res.body.status, 'not_ready');
      assert.equal(res.body.database.connected, false);
    });

    it('GET /api/items returns HTTP 503 and NEVER returns hardcoded fallback data when DB is unavailable', async () => {
      const res = await requestJson('GET', '/api/items');
      assert.equal(res.status, 503);
      assert.ok(!Array.isArray(res.body));
      assert.equal(res.body.error, 'Service Unavailable');
    });

    it('POST /api/items returns HTTP 405 Method Not Allowed (Read-Only API)', async () => {
      const res = await requestJson('POST', '/api/items');
      assert.equal(res.status, 405);
      assert.equal(res.body.error, 'Method Not Allowed');
    });

    it('GET /api/unknown returns structured HTTP 404 Not Found', async () => {
      const res = await requestJson('GET', '/api/unknown');
      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'Not Found');
    });
  });

  describe('4. Connected Database Query Behavior & Safe Seed Safeguards', () => {
    const originalReadyStateDescriptor = Object.getOwnPropertyDescriptor(
      mongoose.connection,
      'readyState'
    );
    const originalFind = Item.find;
    const originalUpdateOne = Item.updateOne;
    const originalCountDocuments = Item.countDocuments;

    after(() => {
      if (originalReadyStateDescriptor) {
        Object.defineProperty(
          mongoose.connection,
          'readyState',
          originalReadyStateDescriptor
        );
      } else {
        delete (mongoose.connection as any).readyState;
      }
      Item.find = originalFind;
      Item.updateOne = originalUpdateOne;
      Item.countDocuments = originalCountDocuments;
    });

    it('GET /api/items returns HTTP 200 with empty array [] when collection is empty', async () => {
      Object.defineProperty(mongoose.connection, 'readyState', {
        get: () => 1,
        configurable: true,
      });

      Item.find = (() => ({
        select: () => ({
          sort: () => ({
            lean: () => ({
              exec: async () => [],
            }),
          }),
        }),
      })) as any;

      const res = await requestJson('GET', '/api/items');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    });

    it('GET /api/items returns HTTP 200 with actual MongoDB documents when records exist', async () => {
      Object.defineProperty(mongoose.connection, 'readyState', {
        get: () => 1,
        configurable: true,
      });

      const simulatedDbRecords = [
        {
          _id: '671a00000000000000000001',
          name: 'Mechanical Wireless Keyboard',
          description: 'Compact 75% tactile mechanical keyboard.',
          category: 'Electronics',
        },
        {
          _id: '671a00000000000000000002',
          name: 'Designing Data-Intensive Applications',
          description: 'Engineering reference book.',
          category: 'Books',
        },
      ];

      Item.find = (() => ({
        select: () => ({
          sort: () => ({
            lean: () => ({
              exec: async () => simulatedDbRecords,
            }),
          }),
        }),
      })) as any;

      const res = await requestJson('GET', '/api/items');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.equal(res.body.length, 2);
      assert.equal(res.body[0]._id, '671a00000000000000000001');
      assert.equal(res.body[0].name, 'Mechanical Wireless Keyboard');
    });

    it('GET /api/items handles query failures gracefully with HTTP 500 and no leaked stack trace', async () => {
      Object.defineProperty(mongoose.connection, 'readyState', {
        get: () => 1,
        configurable: true,
      });

      Item.find = (() => ({
        select: () => ({
          sort: () => ({
            lean: () => ({
              exec: async () => {
                throw new Error(
                  'MongoNetworkError: failed on mongodb+srv://user:secret@cluster0.cyyf018.mongodb.net/khutwa_db'
                );
              },
            }),
          }),
        }),
      })) as any;

      const res = await requestJson('GET', '/api/items');
      assert.equal(res.status, 500);
      assert.equal(res.body.error, 'Internal Server Error');
      assert.ok(!JSON.stringify(res.body).includes('secret'));
      assert.ok(!JSON.stringify(res.body).includes('MongoNetworkError'));
    });

    it('seedItemsCollection reuses existing records when >= 6 records exist and never deletes data', async () => {
      Item.find = (() => ({
        lean: async () =>
          SAMPLE_ITEMS.map((item, idx) => ({
            _id: `671a0000000000000000000${idx + 1}`,
            name: item.name,
          })),
      })) as any;

      let updateCalled = false;
      Item.updateOne = (async () => {
        updateCalled = true;
        return { upsertedCount: 1 };
      }) as any;

      const result = await seedItemsCollection();
      assert.equal(result.reusedExisting, true);
      assert.equal(result.insertedCount, 0);
      assert.equal(updateCalled, false);
    });

    it('seedItemsCollection inserts missing sample items when collection is empty', async () => {
      Item.find = (() => ({
        lean: async () => [],
      })) as any;

      let upserts = 0;
      Item.updateOne = (async () => {
        upserts += 1;
        return { upsertedCount: 1 };
      }) as any;
      Item.countDocuments = (async () => SAMPLE_ITEMS.length) as any;

      const result = await seedItemsCollection();
      assert.equal(result.reusedExisting, false);
      assert.equal(result.insertedCount, SAMPLE_ITEMS.length);
      assert.equal(upserts, SAMPLE_ITEMS.length);
    });
  });
});
