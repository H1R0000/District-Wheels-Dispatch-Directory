import { createApp } from './app.js';
import { JsonStore } from './store.js';
import { PostgresStore } from './postgres-store.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const port = Number(process.env.PORT) || 3000;
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const store = process.env.DATABASE_URL
  ? await new PostgresStore(process.env.DATABASE_URL, new URL('../db/migrations/001_initial.sql', import.meta.url)).initialize()
  : await new JsonStore(resolve(currentDirectory, '../data/dev-db.json')).initialize();
const app = createApp(store, { clientPath: resolve(currentDirectory, '../client/dist') });

app.listen(port, () => {
  console.log(`District Wheels API listening on http://localhost:${port}`);
});
