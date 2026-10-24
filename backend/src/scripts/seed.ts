import {
  connectToDatabase,
  disconnectFromDatabase,
  sanitizeLogMessage,
} from '../config/database';
import { IItem, Item } from '../models/item.model';

export const SAMPLE_ITEMS: IItem[] = [
  {
    name: 'Mechanical Wireless Keyboard',
    description:
      'Compact 75% tactile mechanical keyboard with multi-device Bluetooth and USB-C connectivity.',
    category: 'Electronics',
  },
  {
    name: 'Ergonomic Mesh Office Chair',
    description:
      'Breathable lumbar-support desk chair with adjustable armrests and synchronized tilt mechanism.',
    category: 'Office Furniture',
  },
  {
    name: '27-Inch 4K IPS Monitor',
    description:
      'Color-accurate UHD display featuring USB-C power delivery, ultra-thin bezels, and height-adjustable stand.',
    category: 'Electronics',
  },
  {
    name: 'Hardcover Dotted Journal Notebook',
    description:
      'Archival 120gsm acid-free paper notebook with lay-flat binding, ribbon bookmark, and expandable pocket.',
    category: 'Office Supplies',
  },
  {
    name: 'Designing Data-Intensive Applications',
    description:
      'Comprehensive engineering reference covering distributed systems, database reliability, and scalable architectures.',
    category: 'Books',
  },
  {
    name: 'USB-C Multiport Docking Station',
    description:
      'Aluminum 8-in-1 hub providing 100W pass-through charging, Gigabit Ethernet, 4K HDMI, and SD card readers.',
    category: 'Accessories',
  },
  {
    name: 'LED Architect Desk Lamp',
    description:
      'Clamp-mounted workspace lamp with stepless dimming, adjustable color temperature, and glare-free diffusion.',
    category: 'Lighting',
  },
];

export interface SeedResult {
  existingCount: number;
  insertedCount: number;
  finalCount: number;
  reusedExisting: boolean;
}

/**
 * Safely inspects the target collection and seeds initial items only when needed.
 * Never drops the database or deletes existing records.
 */
export async function seedItemsCollection(): Promise<SeedResult> {
  const existingDocs = await Item.find({}, { name: 1 }).lean();
  const existingCount = existingDocs.length;

  console.log(
    `[Seed] Inspected collection "items": found ${existingCount} existing record(s).`
  );

  // If 6 or more suitable records already exist, reuse them without inserting duplicates
  if (existingCount >= 6) {
    console.log(
      `[Seed] Suitable existing records (${existingCount}) are already present. Reusing existing data without modifications.`
    );
    return {
      existingCount,
      insertedCount: 0,
      finalCount: existingCount,
      reusedExisting: true,
    };
  }

  const existingNames = new Set(
    existingDocs
      .map((doc) => (typeof doc.name === 'string' ? doc.name.trim().toLowerCase() : ''))
      .filter(Boolean)
  );

  const itemsToInsert = SAMPLE_ITEMS.filter(
    (item) => !existingNames.has(item.name.trim().toLowerCase())
  );

  if (itemsToInsert.length === 0) {
    console.log(
      '[Seed] All sample items already exist in the collection. Skipping duplicate insertion.'
    );
    return {
      existingCount,
      insertedCount: 0,
      finalCount: existingCount,
      reusedExisting: true,
    };
  }

  let insertedCount = 0;
  for (const sample of itemsToInsert) {
    const result = await Item.updateOne(
      { name: sample.name },
      { $setOnInsert: sample },
      { upsert: true }
    );
    if (result.upsertedCount && result.upsertedCount > 0) {
      insertedCount += result.upsertedCount;
    }
  }

  const finalCount = await Item.countDocuments();
  console.log(
    `[Seed] Inserted ${insertedCount} new item(s). Collection now contains ${finalCount} record(s).`
  );

  return {
    existingCount,
    insertedCount,
    finalCount,
    reusedExisting: false,
  };
}

async function runSeedCli(): Promise<void> {
  try {
    console.log('[Seed] Validating environment and connecting to MongoDB...');
    await connectToDatabase();
    await seedItemsCollection();
    await disconnectFromDatabase();
    console.log('[Seed] Seed operation completed safely.');
    process.exit(0);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Seed] Error: ${sanitizeLogMessage(rawMsg)}`);
    await disconnectFromDatabase().catch(() => undefined);
    process.exit(1);
  }
}

if (require.main === module) {
  void runSeedCli();
}
