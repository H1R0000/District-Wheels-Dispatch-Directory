import { createApp } from './app.js';
const port = Number(process.env.PORT) || 3000;
const server = createApp().listen(port, '127.0.0.1', () => console.log(`District Wheels API listening on http://127.0.0.1:${port}`));
server.headersTimeout = 10000;
server.requestTimeout = 15000;
server.keepAliveTimeout = 5000;
