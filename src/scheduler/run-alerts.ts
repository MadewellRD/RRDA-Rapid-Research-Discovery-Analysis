import dotenv from 'dotenv';
dotenv.config();
import { AlertScheduler } from './AlertScheduler.js';

const scheduler = new AlertScheduler();
scheduler.start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down alert scheduler...');
  await scheduler.close();
  process.exit(0);
});
process.on('SIGINT', async () => {
  console.log('Shutting down alert scheduler...');
  await scheduler.close();
  process.exit(0);
});
