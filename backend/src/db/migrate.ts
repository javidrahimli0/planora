import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL?.trim();

const standalonePool = new Pool(
  connectionString
    ? { connectionString }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'planora',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
      }
);

const schemaPath = path.join(__dirname, '../../db/schema.sql');

/**
 * Runs the schema.sql migration using the provided pool (or the shared app
 * pool). Exported so that index.ts can call it during bootstrap without
 * spinning up a second connection pool.
 */
export async function runMigration(pool: Pool = standalonePool): Promise<void> {
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  console.log('Running migration...');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Migration complete — all tables created successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Allow running directly: `ts-node src/db/migrate.ts`
if (require.main === module) {
  runMigration(standalonePool)
    .then(() => standalonePool.end())
    .catch(() => {
      standalonePool.end();
      process.exit(1);
    });
}
