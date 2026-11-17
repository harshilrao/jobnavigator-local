import { config as dotenvConfig } from 'dotenv';
import { join } from 'node:path';
dotenvConfig({ path: join(__dirname, '..', '..', '..', '.env') });
