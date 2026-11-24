CREATE TABLE IF NOT EXISTS "ledgers" (
  "owner_id" text PRIMARY KEY NOT NULL,
  "revision" integer NOT NULL,
  "payload" text NOT NULL,
  "commits" text NOT NULL
);
