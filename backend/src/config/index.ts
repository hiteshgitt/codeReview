import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const REQUIRED_IN_PRODUCTION = ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL'];

if (process.env.NODE_ENV === 'production') {
  const missing = REQUIRED_IN_PRODUCTION.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  apiUrl: process.env.API_URL || 'http://localhost:4000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  database: {
    url: process.env.DATABASE_URL || '',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    secret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-only-secret'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  audit: {
    timeoutMs: parseInt(process.env.AUDIT_TIMEOUT_MS || '120000', 10),
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_AUDITS || '3', 10),
    tmpDir: process.env.AUDIT_TMP_DIR || '/tmp/web-audit-pro',
  },

  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  },
} as const;

export default config;
