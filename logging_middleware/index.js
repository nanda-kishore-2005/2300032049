/**
 * Logging Middleware - Reusable Logging Package
 * 
 * Provides a structured logging function that sends log entries to the
 * evaluation service API. Captures the entire lifecycle of application events
 * including debug, info, warn, error, and fatal levels.
 * 
 * Usage:
 *   const { Log, initLogger } = require('logging-middleware');
 *   initLogger('YOUR_AUTH_TOKEN');
 *   await Log('backend', 'info', 'handler', 'Server started successfully on port 3000');
 * 
 * @author 2300032049
 */

const fetch = require('node-fetch');

// ─── Configuration ───────────────────────────────────────────────────────────
const BASE_API_URL = 'http://4.224.186.213/evaluation-service';
const LOG_API_URL = `${BASE_API_URL}/logs`;
const AUTH_API_URL = `${BASE_API_URL}/auth`;

const VALID_STACKS = ['backend', 'frontend'];
const VALID_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'];

let AUTH_TOKEN = '';
let TOKEN_EXPIRY = 0;
let AUTH_CREDENTIALS = null;
let LOG_QUEUE = [];
let IS_FLUSHING = false;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

// ─── Logger Initialization ───────────────────────────────────────────────────

/**
 * Initialize the logger with credentials for auto-refresh.
 * 
 * @param {object} credentials - { email, name, rollNo, accessCode, clientID, clientSecret }
 * @param {string} [initialToken] - Optional initial Bearer token
 */
async function initLogger(credentials, initialToken) {
  if (typeof credentials === 'string') {
    // Backward compat: initLogger(token)
    AUTH_TOKEN = credentials;
    console.log('[LoggerInit] Logger initialized with static token');
    return;
  }
  AUTH_CREDENTIALS = credentials;
  if (initialToken) {
    AUTH_TOKEN = initialToken;
  }
  await refreshToken();
  console.log('[LoggerInit] Logger initialized with auto-refresh');
}

/**
 * Refresh the auth token using stored credentials.
 */
async function refreshToken() {
  if (!AUTH_CREDENTIALS) return;
  try {
    const res = await fetch(AUTH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(AUTH_CREDENTIALS)
    });
    if (res.ok || res.status === 201) {
      const data = await res.json();
      AUTH_TOKEN = data.access_token;
      TOKEN_EXPIRY = data.expires_in * 1000;
      console.log('[LoggerInit] Token refreshed successfully');
    }
  } catch (e) {
    console.error('[LoggerInit] Token refresh failed:', e.message);
  }
}

/**
 * Ensure the token is still valid; refresh if needed.
 */
async function ensureValidToken() {
  if (AUTH_CREDENTIALS && TOKEN_EXPIRY && Date.now() >= (TOKEN_EXPIRY - 60000)) {
    await refreshToken();
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates log parameters before sending to the API.
 * 
 * @param {string} stack - The application stack ('backend' or 'frontend')
 * @param {string} level - Log severity level
 * @param {string} pkg - The package/module generating the log
 * @param {string} message - Descriptive log message
 * @returns {{ valid: boolean, error?: string }}
 */
function validateLogParams(stack, level, pkg, message) {
  if (!AUTH_TOKEN) {
    return { valid: false, error: 'Logger not initialized. Call initLogger(token) first.' };
  }
  if (!VALID_STACKS.includes(stack)) {
    return { valid: false, error: `Invalid stack "${stack}". Must be one of: ${VALID_STACKS.join(', ')}` };
  }
  if (!VALID_LEVELS.includes(level)) {
    return { valid: false, error: `Invalid level "${level}". Must be one of: ${VALID_LEVELS.join(', ')}` };
  }
  if (!pkg || typeof pkg !== 'string') {
    return { valid: false, error: 'Package name must be a non-empty string' };
  }
  if (!message || typeof message !== 'string') {
    return { valid: false, error: 'Message must be a non-empty string' };
  }
  return { valid: true };
}

// ─── Core Logging Function ───────────────────────────────────────────────────

/**
 * Sends a structured log entry to the evaluation service API.
 * This is the primary function to be used throughout the application.
 * 
 * @param {string} stack - Application stack: 'backend' | 'frontend'
 * @param {string} level - Log level: 'debug' | 'info' | 'warn' | 'error' | 'fatal'
 * @param {string} pkg - Package/module name generating the log (e.g., 'handler', 'service')
 * @param {string} message - Descriptive message about what's happening
 * @returns {Promise<{success: boolean, logID?: string, error?: string}>}
 * 
 * @example
 *   await Log('backend', 'info', 'handler', 'GET /api/depots - Fetching all depot data');
 *   await Log('backend', 'error', 'service', 'Failed to connect to database: timeout after 30s');
 *   await Log('backend', 'debug', 'middleware', 'Request headers validated successfully');
 */
async function Log(stack, level, pkg, message) {
  // Validate parameters
  const validation = validateLogParams(stack, level, pkg, message);
  if (!validation.valid) {
    console.error(`[Logger] Validation failed: ${validation.error}`);
    return { success: false, error: validation.error };
  }

  // Truncate message to API limits (5-48 chars)
  let truncatedMessage = message;
  if (truncatedMessage.length > 48) {
    truncatedMessage = truncatedMessage.substring(0, 45) + '...';
  }
  if (truncatedMessage.length < 5) {
    truncatedMessage = truncatedMessage.padEnd(5, '.');
  }

  const logPayload = {
    stack: stack,
    level: level,
    package: pkg,
    message: truncatedMessage
  };

  // Attempt to send log with retries
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await ensureValidToken();
      const response = await fetch(LOG_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: JSON.stringify(logPayload)
      });

      if (response.ok) {
        const data = await response.json();
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${level.toUpperCase()}] [${pkg}] ${message} (logID: ${data.logID})`);
        return { success: true, logID: data.logID, message: data.message };
      } else {
        const errorText = await response.text();
        console.error(`[Logger] API returned status ${response.status}: ${errorText} (attempt ${attempt}/${MAX_RETRIES})`);
        
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
        }
      }
    } catch (error) {
      console.error(`[Logger] Network error on attempt ${attempt}/${MAX_RETRIES}: ${error.message}`);
      
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  // All retries failed - queue the log for later
  LOG_QUEUE.push(logPayload);
  console.error(`[Logger] All ${MAX_RETRIES} attempts failed. Log queued for retry. Queue size: ${LOG_QUEUE.length}`);
  return { success: false, error: `Failed after ${MAX_RETRIES} attempts` };
}

// ─── Batch Logging ───────────────────────────────────────────────────────────

/**
 * Send multiple log entries in sequence. Useful for logging
 * a series of related events atomically.
 * 
 * @param {Array<{stack: string, level: string, package: string, message: string}>} logs
 * @returns {Promise<Array<{success: boolean, logID?: string}>>}
 */
async function LogBatch(logs) {
  const results = [];
  for (const log of logs) {
    const result = await Log(log.stack, log.level, log.package, log.message);
    results.push(result);
  }
  return results;
}

// ─── Queue Flush ─────────────────────────────────────────────────────────────

/**
 * Attempts to flush any queued logs that failed to send previously.
 * 
 * @returns {Promise<{flushed: number, remaining: number}>}
 */
async function flushLogQueue() {
  if (IS_FLUSHING || LOG_QUEUE.length === 0) {
    return { flushed: 0, remaining: LOG_QUEUE.length };
  }
  
  IS_FLUSHING = true;
  let flushed = 0;
  const remaining = [];
  
  for (const logPayload of LOG_QUEUE) {
    try {
      const response = await fetch(LOG_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: JSON.stringify(logPayload)
      });
      
      if (response.ok) {
        flushed++;
      } else {
        remaining.push(logPayload);
      }
    } catch {
      remaining.push(logPayload);
    }
  }
  
  LOG_QUEUE = remaining;
  IS_FLUSHING = false;
  
  return { flushed, remaining: remaining.length };
}

// ─── Express Middleware ──────────────────────────────────────────────────────

/**
 * Express middleware that logs incoming HTTP requests and their responses.
 * Captures method, URL, status code, and response time.
 * 
 * @returns {Function} Express middleware function
 * 
 * @example
 *   const app = express();
 *   app.use(requestLogger());
 */
function requestLogger() {
  return async (req, res, next) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    
    // Log incoming request
    await Log(
      'backend',
      'info',
      'middleware',
      `[${requestId}] Incoming ${req.method} ${req.originalUrl} from ${req.ip}`
    );

    // Capture response finish event
    const originalEnd = res.end;
    res.end = function (...args) {
      const duration = Date.now() - startTime;
      const level = res.statusCode >= 500 ? 'error' : 
                    res.statusCode >= 400 ? 'warn' : 'info';
      
      Log(
        'backend',
        level,
        'middleware',
        `[${requestId}] ${req.method} ${req.originalUrl} completed with status ${res.statusCode} in ${duration}ms`
      );

      originalEnd.apply(res, args);
    };

    next();
  };
}

// ─── Error Logging Middleware ────────────────────────────────────────────────

/**
 * Express error-handling middleware that logs errors and sends appropriate responses.
 * 
 * @returns {Function} Express error middleware function
 * 
 * @example
 *   app.use(errorLogger());
 */
function errorLogger() {
  return async (err, req, res, next) => {
    await Log(
      'backend',
      'error',
      'middleware',
      `Unhandled error in ${req.method} ${req.originalUrl}: ${err.message} | Stack: ${err.stack}`
    );
    
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
      path: req.originalUrl
    });
  };
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Sleep utility for retry delays.
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a simple request ID for tracing.
 * @returns {string}
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ─── Module Exports ──────────────────────────────────────────────────────────

module.exports = {
  Log,
  LogBatch,
  initLogger,
  requestLogger,
  errorLogger,
  flushLogQueue,
  VALID_STACKS,
  VALID_LEVELS
};
