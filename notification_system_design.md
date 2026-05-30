# Campus Notifications Microservice — System Design

**Author:** 2300032049  
**Date:** 2026-05-30

---

# Stage 1 — REST API Design & Contract

## Core Actions

| # | Action | Description |
|---|--------|-------------|
| 1 | Fetch notifications | Paginated list for logged-in student |
| 2 | Get single notification | Fetch by ID |
| 3 | Mark as read | Single notification |
| 4 | Mark all as read | Bulk update |
| 5 | Create notification | Admin sends to students |
| 6 | Delete notification | Remove a notification |
| 7 | Get unread count | Badge counter |

## Real-Time Notification Mechanism

**Chosen: Server-Sent Events (SSE)**

| Factor | SSE | WebSocket | Polling |
|--------|-----|-----------|---------|
| Direction | Server → Client | Bidirectional | Client → Server |
| Complexity | Low | High | Low |
| Reconnect | Built-in | Manual | N/A |
| HTTP compatible | Yes | Upgrade required | Yes |

**Justification:** Notifications are unidirectional (server→client). SSE provides automatic reconnection, works over HTTP, and is simpler than WebSockets for this use case.

## Endpoints

### 1. `GET /api/notifications`

Fetch paginated notifications for the current student.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 20 | Items per page |
| type | string | — | Filter: `Placement`, `Result`, `Event` |
| isRead | bool | — | Filter by read status |

**Response (200):**
```json
{
  "notifications": [
    {
      "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
      "type": "Result",
      "message": "mid-sem results published",
      "timestamp": "2026-04-22T17:51:30Z",
      "isRead": false,
      "priority": 2
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalPages": 5,
    "totalCount": 98
  }
}
```

### 2. `GET /api/notifications/:id`

**Response (200):**
```json
{
  "id": "d146095a-...",
  "type": "Result",
  "message": "mid-sem results published",
  "timestamp": "2026-04-22T17:51:30Z",
  "isRead": true,
  "priority": 2
}
```

### 3. `PATCH /api/notifications/:id/read`

**Response (200):**
```json
{ "message": "Notification marked as read" }
```

### 4. `PATCH /api/notifications/read-all`

**Response (200):**
```json
{ "message": "All notifications marked as read", "updatedCount": 42 }
```

### 5. `POST /api/notifications`

**Request:**
```json
{
  "type": "Placement",
  "message": "Google is visiting campus on June 5",
  "studentIds": ["all"]
}
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <token>
```

**Response (201):**
```json
{ "message": "Notification created", "notificationId": "uuid-here" }
```

### 6. `DELETE /api/notifications/:id`

**Response (200):**
```json
{ "message": "Notification deleted" }
```

### 7. `GET /api/notifications/unread-count`

**Response (200):**
```json
{ "unreadCount": 14 }
```

### 8. `GET /api/notifications/stream` (SSE)

**Headers:**
```
Accept: text/event-stream
Authorization: Bearer <token>
```

**Event format:**
```
event: notification
data: {"id":"uuid","type":"Placement","message":"New drive announced","timestamp":"..."}
```

---

# Stage 2 — Database Design

## Chosen DB: PostgreSQL (Relational)

**Reasons:**
1. **ACID compliance** — read/unread state must be consistent.
2. **Structured data** — notifications have a fixed, well-defined schema.
3. **Complex queries** — filtering by type, student, date, read status benefits from SQL.
4. **Indexing support** — B-tree and partial indexes handle our query patterns well.
5. **Mature ecosystem** — excellent tooling, ORMs, and community support.

## Schema

```sql
-- Enum for notification types
CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');

-- Students table
CREATE TABLE students (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(150) UNIQUE NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Notifications table (one row per student-notification pair)
CREATE TABLE notifications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id        INT NOT NULL REFERENCES students(id),
    notification_type notification_type NOT NULL,
    message           TEXT NOT NULL,
    is_read           BOOLEAN DEFAULT FALSE,
    created_at        TIMESTAMP DEFAULT NOW(),
    read_at           TIMESTAMP
);
```

## Scaling Problems & Solutions

| Problem | Solution |
|---------|----------|
| Table grows into hundreds of millions of rows | **Table partitioning** by `created_at` (monthly range partitions) |
| Slow queries on large tables | **Indexing** (see below) + query optimization |
| Write bottleneck during "Notify All" | **Batch inserts** + async job queue |
| Read-heavy load from 50k students | **Read replicas** + caching layer |

## Indexes

```sql
-- Primary lookup: student's notifications ordered by time
CREATE INDEX idx_notifications_student_created
ON notifications (student_id, created_at DESC);

-- Unread filter (partial index — only indexes unread rows)
CREATE INDEX idx_notifications_unread
ON notifications (student_id, created_at DESC)
WHERE is_read = FALSE;

-- Type filter
CREATE INDEX idx_notifications_type
ON notifications (notification_type, created_at DESC);
```

## Queries for REST APIs

**GET /api/notifications (paginated):**
```sql
SELECT id, notification_type, message, is_read, created_at
FROM notifications
WHERE student_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

**PATCH /api/notifications/:id/read:**
```sql
UPDATE notifications
SET is_read = TRUE, read_at = NOW()
WHERE id = $1 AND student_id = $2;
```

**PATCH /api/notifications/read-all:**
```sql
UPDATE notifications
SET is_read = TRUE, read_at = NOW()
WHERE student_id = $1 AND is_read = FALSE;
```

**GET /api/notifications/unread-count:**
```sql
SELECT COUNT(*) AS unread_count
FROM notifications
WHERE student_id = $1 AND is_read = FALSE;
```

---

# Stage 3 — Query Analysis & Optimization

## Original Query

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

### Is this query accurate?

**Partially.** It fetches the correct data but has issues:
1. `SELECT *` fetches all columns, including potentially large `message` TEXT — wasteful.
2. No `LIMIT` clause — returns ALL unread notifications, which could be thousands.
3. Column naming uses camelCase (`studentID`, `isRead`, `createdAt`), which should match the actual schema.

### Why is it slow?

With 50,000 students and 5,000,000 notifications:
1. **No index on the filter columns** — the DB performs a full sequential scan of 5M rows.
2. **No LIMIT** — even after filtering, all matching rows must be sorted in memory.
3. **`SELECT *`** — forces the DB to read wide rows from disk, increasing I/O.

**Estimated cost without index:** O(n) = ~5,000,000 row scans.

### Recommended Changes

```sql
-- Optimized query
SELECT id, notification_type, message, is_read, created_at
FROM notifications
WHERE student_id = 1042 AND is_read = FALSE
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;
```

**Add a partial composite index:**
```sql
CREATE INDEX idx_unread_by_student
ON notifications (student_id, created_at DESC)
WHERE is_read = FALSE;
```

**Cost after optimization:** Index seek O(log n) + limited result scan O(k) where k = LIMIT.

### Should we index every column?

**No. This is bad advice.** Reasons:
1. **Write penalty** — every INSERT/UPDATE must update ALL indexes. With "Notify All" inserting 50,000 rows, this multiplies write time.
2. **Storage waste** — each index consumes disk space. Indexing every column on 5M rows wastes gigabytes.
3. **Planner confusion** — too many indexes can cause the query planner to choose suboptimal plans.
4. **Maintenance overhead** — indexes need VACUUM and REINDEX operations.

**Best practice:** Index only columns used in WHERE, JOIN, and ORDER BY clauses of frequent queries.

### Placement notifications in last 7 days

```sql
SELECT s.id, s.name, s.email, n.message, n.created_at
FROM notifications n
JOIN students s ON s.id = n.student_id
WHERE n.notification_type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days'
ORDER BY n.created_at DESC;
```

---

# Stage 4 — Caching & Performance

## Problem

Notifications are fetched on every page load for every student. With 50,000 students, this overwhelms the database.

## Solution 1: Application-Level Caching (Redis)

Cache the notification response per student with a short TTL.

```
Key:   notifications:student:{studentId}:page:{page}
Value: JSON serialized notification list
TTL:   60 seconds
```

**Invalidation:** When a new notification is created, delete/invalidate the cache keys for affected students.

| Tradeoff | Pro | Con |
|----------|-----|-----|
| Speed | Sub-millisecond reads | Cache misses still hit DB |
| Consistency | Near real-time with short TTL | Stale data for up to TTL duration |
| Complexity | Moderate | Need Redis infrastructure + invalidation logic |

## Solution 2: HTTP Caching (ETag / Last-Modified)

Return `ETag` header with notification list. Client sends `If-None-Match` on subsequent requests. Server returns `304 Not Modified` if data hasn't changed.

| Tradeoff | Pro | Con |
|----------|-----|-----|
| Bandwidth | Saves network transfer | DB still queried to compute ETag |
| Implementation | Simple headers | Limited to per-request optimization |

## Solution 3: SSE for Real-Time Push (Eliminate Polling)

Instead of fetching on page load, keep an SSE connection open. Push new notifications in real time.

| Tradeoff | Pro | Con |
|----------|-----|-----|
| DB Load | Eliminates repeated queries | Requires persistent connections |
| UX | Instant notification delivery | More server memory per connection |
| Scalability | Good with Redis Pub/Sub fan-out | Need sticky sessions or shared state |

## Recommended Architecture

```
Client ──► API Gateway ──► Redis Cache (L1)
                              │ miss
                              ▼
                          PostgreSQL (L2)
                              │
           SSE Push ◄── Redis Pub/Sub ◄── Notification Service
```

**Strategy: Cache + SSE hybrid.** Use Redis cache for initial page loads and SSE for real-time updates. This reduces DB load by ~95%.

---

# Stage 5 — Reliable Bulk Notifications

## Original Pseudocode Analysis

```
function notify_all(student_ids, message):
    for student_id in student_ids:
        send_email(student_id, message)
        save_to_db(student_id, message)
        push_to_app(student_id, message)
```

### Shortcomings

1. **Sequential processing** — 50,000 iterations serially; if each takes 100ms → 83 minutes total.
2. **No error handling** — if `send_email` fails for student #200, the loop may crash, and students #201–50000 get nothing.
3. **No retry mechanism** — failed emails are lost permanently.
4. **Tight coupling** — email, DB, and push are in the same synchronous loop. One slow service blocks everything.
5. **No idempotency** — if the process restarts midway, you don't know which students were already processed.
6. **Single point of failure** — one server handles everything.

### What about the 200 failed emails?

Since there's no retry or tracking:
- Those 200 students never received emails.
- There's no record of which 200 failed.
- You'd need to re-run for all 50,000 (causing duplicates for 49,800).

### Should DB save and email happen together?

**No.** They should be decoupled:
1. **Save to DB first** — this is fast and reliable. The notification record serves as the source of truth.
2. **Queue email as async job** — email is an external, unreliable dependency. If it fails, the queued job can retry without affecting the DB record.
3. **Push to app via Pub/Sub** — also async, independent of both DB and email.

**Reason:** Different failure modes require different retry strategies. Coupling them means one failure blocks all.

### Revised Pseudocode

```
function notify_all(student_ids: array, message: string):
    // Step 1: Batch insert all notifications to DB
    notification_ids = batch_insert_to_db(student_ids, message)
    // This gives us a reliable record of what needs to be sent

    // Step 2: Publish events to message queue (RabbitMQ/Redis)
    for batch in chunk(notification_ids, 500):
        publish_to_queue("email_queue", batch, message)
        publish_to_queue("push_queue", batch, message)

    return { status: "queued", total: len(student_ids) }

// --- Worker: Email Consumer ---
function email_worker():
    while true:
        batch = consume_from_queue("email_queue")
        for notification in batch:
            try:
                send_email(notification.student_id, notification.message)
                mark_email_sent(notification.id)
            catch error:
                increment_retry_count(notification.id)
                if retry_count < MAX_RETRIES:
                    requeue_with_delay(notification, exponential_backoff)
                else:
                    move_to_dead_letter_queue(notification)
                    alert_admin(notification)

// --- Worker: Push Notification Consumer ---
function push_worker():
    while true:
        batch = consume_from_queue("push_queue")
        for notification in batch:
            push_to_app_via_sse(notification.student_id, notification.message)
```

### Key Improvements

| Aspect | Before | After |
|--------|--------|-------|
| Speed | Sequential (83 min) | Parallel workers (seconds) |
| Failure handling | None | Retry + DLQ |
| Email tracking | None | Per-student status |
| Coupling | Tight | Loosely coupled via queues |
| Idempotency | No | Notification ID as dedup key |
| Scalability | Single server | Multiple workers |

---

# Stage 6 — Priority Inbox

## Approach

**Algorithm: Min-Heap (Priority Queue) of size N**

To efficiently maintain the top N most important unread notifications:

1. **Priority Score** = `typeWeight × 1000 + recencyScore`
   - Type weights: Placement = 3, Result = 2, Event = 1
   - Recency score: Higher for more recent notifications (timestamp-based)

2. **Data Structure:** Min-heap of size N.
   - For each incoming notification, if heap size < N, insert it.
   - If heap size = N and new notification's priority > heap minimum, replace the minimum.
   - This maintains O(log N) insertion and O(1) access to the minimum.

3. **Handling new notifications:** When a new notification arrives via SSE:
   - Compute its priority score.
   - If it beats the current minimum in the top-N heap, swap it in. O(log N).
   - This avoids re-sorting the entire list.

**Time Complexity:**
- Building initial top-N: O(M log N) where M = total notifications
- Inserting a new notification: O(log N)
- Getting all top-N sorted: O(N log N)

**See `notification_app_be/` folder for the working implementation and output screenshots.**
