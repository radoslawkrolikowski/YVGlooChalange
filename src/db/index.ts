import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import {
  drizzle as drizzlePg,
  type NodePgDatabase,
} from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — see .env.example");
}

// On Vercel (production and preview) the database is Neon, reached over its
// serverless HTTP driver; locally it is the Docker Postgres over TCP. Both
// expose the same Drizzle query API, so the rest of the app is driver-blind.
export const db: NodePgDatabase<typeof schema> = process.env.VERCEL
  ? (drizzleNeon(neon(connectionString), {
      schema,
    }) as unknown as NodePgDatabase<typeof schema>)
  : drizzlePg(new Pool({ connectionString }), { schema });
