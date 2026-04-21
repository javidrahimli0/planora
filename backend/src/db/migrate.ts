import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'planora',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function migrate() {
  const schemaPath = path.join(__dirname, '../../db/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  console.log('Running migration...');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Migration complete — all tables created successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
