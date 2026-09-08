# Offline Sync Reconciliation Rules

CareFlow uses IndexedDB as the operational offline store and Supabase as the online synchronization target.

## Mutation rules

- Offline mutations are durable queue operations.
- Insert operations use idempotent upsert semantics so a retry does not create a second row.
- Update operations must update an existing server row. They must not recreate a missing row.
- A missing or facility-inaccessible row during an update is recorded as `SYNC_CONFLICT` and becomes blocked after classification.
- RPC operations remain authoritative for lifecycle transitions that must be atomic on the server.

## Payload rules

Offline records may contain IndexedDB-only metadata (`entity`, `storageKey`) and local timestamp names (`createdAt`, `updatedAt`). The sync layer removes local metadata and maps those timestamps to the Supabase `created_at` and `updated_at` column names before transmission.

## Pull rules

After synchronization, Supabase data may hydrate IndexedDB. A server row is not allowed to overwrite a local row while that same table/id still has a pending or failed local mutation. Blocked operations also remain protected from automatic hydration until an officer resolves the queue item.

The table/id pair is part of the protection key so an identical UUID appearing in two different tables cannot accidentally suppress hydration of an unrelated record.

## Authorization boundary

Connectivity is not authorization. Supabase RLS and the authenticated session remain authoritative for online writes. Authentication or privilege failures are blocked rather than retried indefinitely.

## Excel boundary

Excel remains a backup, migration, and controlled import/export mechanism. It is not used as the live synchronization database.
