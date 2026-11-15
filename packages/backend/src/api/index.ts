// Public surface of @erp/api. Nothing else imports the api layer; this exists for tests and tooling.
export { createApp, type AppDeps } from './app.js';
export { buildRoutes, PUBLIC_ROUTES, type ModuleRoutes } from './routes/index.js';
