import { createApp } from './app.js';
import { JsonStore } from './store.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const port = Number(process.env.PORT) || 3000;
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const store = await new JsonStore(resolve(currentDirectory, '../data/dev-db.json')).initialize();
const app = createApp(store, { clientPath: resolve(currentDirectory, '../client/dist') });

app.listen(port, () => {
  console.log(`District Wheels API listening on http://localhost:${port}`);
});
