/**
 * Writes the OpenAPI document to a file without starting the server or touching a database:
 * `npm run openapi:export -- [output path]` (default: openapi.json).
 */
import { writeFileSync } from 'node:fs';
import { API_PREFIX } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { buildContainer } from '../src/container.js';
import { buildOpenApiDocument } from '../src/docs/openapi.js';

const output = process.argv[2] ?? 'openapi.json';

// Routes only need configuration shape, not real secrets or a live database.
const config = loadConfig({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://unused',
  JWT_ACCESS_SECRET: 'openapi-export-only-not-a-real-secret-0000',
  RATE_LIMIT_ENABLED: 'false',
});
const container = buildContainer({ config, logger: createLogger(config) });
writeFileSync(
  output,
  `${JSON.stringify(buildOpenApiDocument(container.routes, API_PREFIX), null, 2)}\n`,
);
console.log(`Wrote ${output}`);
