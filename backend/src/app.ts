import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import config from './config';
import routes from './routes';
import { errorHandler, notFound } from './middleware/error';
import { logger } from './utils/logger';

const app = express();

// Security headers — hardened helmet config
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc:    ["'self'"],
      objectSrc:  ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false, // allows Lighthouse/puppeteer CDN resources
}));

// HTTP Parameter Pollution prevention — blocks duplicate query params
app.use(hpp());

// CORS
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = [
        config.frontendUrl,
        'http://localhost:3000',
        'http://localhost:3001',
      ];
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Rate limiting
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please try again later.' },
  }),
);

// Stricter limit for auth routes (100 per 15 min in dev, 20 in production)
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 20 : 100,
    message: { success: false, message: 'Too many auth requests. Please wait before retrying.' },
    skip: () => process.env.NODE_ENV === 'development',
  }),
);

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// HTTP logging
app.use(
  morgan('combined', {
    stream: { write: (message) => logger.http(message.trim()) },
    skip: (req) => req.url === '/api/health',
  }),
);

// Input sanitisation — strip null bytes and control characters from string fields
app.use((req, _res, next) => {
  const sanitize = (obj: unknown): unknown => {
    if (typeof obj === 'string') return obj.replace(/\0/g, '').replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
    if (Array.isArray(obj)) return obj.map(sanitize);
    if (obj && typeof obj === 'object') {
      return Object.fromEntries(Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, sanitize(v)]));
    }
    return obj;
  };
  if (req.body) req.body = sanitize(req.body);
  next();
});

// Routes
app.use('/api', routes);

// 404 & error handling
app.use(notFound);
app.use(errorHandler);

export default app;
