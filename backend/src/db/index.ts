import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

const url = process.env['POSTGRES_URL'];
if (!url) throw new Error('POSTGRES_URL is required');

const client = postgres(url, { max: 10 });
export const db = drizzle(client, { schema });

export type Database = typeof db;
