import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();

const port = Number.parseInt(process.env.RDA_API_PORT || '4000', 10);
const app = createApp();

app.listen(port, () => {
  console.log(`RRDA API listening on http://localhost:${port}`);
});
