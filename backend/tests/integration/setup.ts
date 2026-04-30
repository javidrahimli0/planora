import dotenv from 'dotenv';
import path from 'path';

// Load .env to pick up the base connection settings (host, user, password, port)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Redirect DATABASE_URL to the test database BEFORE db.ts is imported by any test file.
// dotenv.config() above does not override vars that are already set, so setting them
// here after the load guarantees the pool connects to planora_test, not planora.
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL.trim());
  url.pathname = '/planora_test';
  process.env.DATABASE_URL = url.toString();
} else {
  process.env.DB_NAME = 'planora_test';
}

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || process.env.APP_URL || '';
