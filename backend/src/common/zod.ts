import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Every module imports `z` from here so `.openapi()` metadata is always available.
extendZodWithOpenApi(z);

export { z };
