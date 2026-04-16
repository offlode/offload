# Messaging & Tracking Architecture for a Multi-Sided Logistics Platform
## Research Report: Real-Time Systems for a Laundry-on-Demand App

---

## Table of Contents

1. [In-App Messaging Architecture](#1-in-app-messaging-architecture)
2. [Real-Time GPS Tracking Architecture](#2-real-time-gps-tracking-architecture)
3. [Order Status State Machine (Laundry Cycle)](#3-order-status-state-machine-laundry-cycle)
4. [Scalability Patterns](#4-scalability-patterns)
5. [Database Choices for Real-Time Data](#5-database-choices-for-real-time-data)
6. [Performance Optimization](#6-performance-optimization)
7. [Recommended Architecture: Startup Playbook](#7-recommended-architecture-startup-playbook)
8. [Technology Decision Matrix](#8-technology-decision-matrix)

---

## 1. In-App Messaging Architecture

### How Uber, DoorDash & Instacart Handle Messaging

**Uber's approach** operates at massive scale — handling 3 million support tickets per week across riders, drivers, eaters, and couriers. Key architectural decisions from their [engineering blog](https://www.uber.com/blog/building-scalable-real-time-chat/):

- **Control path** (agent/driver assignment notifications): WebSockets + GraphQL subscriptions via the `graphql-ws` library
- **Data path** (actual message content): HTTP Server-Sent Events (SSE) via an internal service called "Ramen"
- **Backbone**: Apache Kafka for all backend message routing and PubSub broadcasting
- **Legacy**: WAMP (WebSocket Application Messaging Protocol) — replaced because stateful services caused latency spikes and 46% error rates
- **Result after rebuild**: Error rate dropped from 46% to 0.45%; chat now handles 36% of all Uber contact volume

**DoorDash's approach** per [System Design Handbook analysis](https://www.systemdesignhandbook.com/guides/doordash-system-design-interview/):
- WebSockets for bidirectional communication between drivers and customers
- Kafka for event streaming; Flink for stream processing
- Separate notification pipeline for SMS/push/email to avoid coupling with order processing

**The universal pattern** across major logistics platforms:

```
Customer App <──WebSocket──> WS Gateway <──Kafka──> Message Service <──> DB
Driver App   <──WebSocket──> WS Gateway <──Kafka──> Message Service <──> DB
Support Agent <─WebSocket──> WS Gateway
                                │
                           Push Notifications (FCM/APNs)
                           when user is offline
```

### Technology Comparison

| Technology | Best For | Startup Cost | Scalability | Self-Hosted |
|---|---|---|---|---|
| **WebSocket (raw)** | Full control, low latency | Engineering effort | Requires Redis pub/sub to scale | Yes |
| **Socket.io** | Rapid prototyping, rooms/namespaces | Low | Requires Redis adapter at scale | Yes |
| **Firebase Realtime DB** | MVP, offline sync, no backend | Free tier (generous) | Auto-scales; costs spike at scale | No (Google) |
| **Pusher** | Simple notifications (<200 concurrent free) | Free up to 200 connections | Limited outside US/EU (90–200ms latency) | No |
| **Ably** | Production-grade, global edge | 6M msg/month free | 30+ data centers, sub-50ms global | No |
| **SendBird** | Out-of-box chat SDK with UI | Paid (opaque pricing at scale) | Good | No |

**Source**: [Ably comparison: Firebase vs Pusher](https://ably.com/compare/firebase-vs-pusher), [PkgPulse: Best Realtime Libraries 2026](https://www.pkgpulse.com/blog/best-realtime-libraries-2026), [ConnectyCube: WebSockets vs Firebase](https://connectycube.com/2025/07/17/websockets-vs-firebase-which-is-best-for-real-time-chat/)

### Recommendation by Stage

**MVP (0–500 concurrent users)**
- Use **Firebase Firestore** for message storage with real-time listeners
- Use **Firebase Cloud Messaging (FCM)** for push notifications
- Zero backend infrastructure for messaging; focus on product
- Cost: ~$0–$25/month at this scale

**Growth Stage (500–50K concurrent users)**
- Migrate to **Socket.io + Redis adapter** on your own Node.js backend
- Message persistence in **PostgreSQL** (conversations, messages tables)
- Push notifications via FCM/APNs directly, or through a service like OneSignal
- Horizontal scaling via Redis pub/sub (see Section 4)

**Scale Stage (50K+ concurrent)**
- Full **WebSocket infrastructure** with Kafka backbone
- Consider **Ably** as managed WebSocket infrastructure if you don't want to own this
- Dedicated notification pipeline separate from real-time messaging

### Message Persistence & Read Receipts

**Data model for messages:**

```sql
-- PostgreSQL schema
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  sender_id UUID NOT NULL,
  sender_role TEXT NOT NULL,  -- 'customer' | 'driver' | 'support'
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);

CREATE INDEX ON messages(conversation_id, created_at DESC);
```

**Read receipts flow:**
1. Message sent → stored in DB with `delivered_at = NULL`
2. WebSocket delivers to recipient → backend marks `delivered_at = NOW()`
3. Recipient opens conversation → client fires `READ` event → backend marks `read_at = NOW()`
4. `READ` event broadcast back to sender via WebSocket

**Push notification architecture** per [Clix Blog](https://blog.clix.so/how-push-notification-delivery-works-internally/):
- When user is online (WebSocket connected): deliver via WebSocket only
- When user is offline: send push via FCM (Android) or APNs (iOS)
- **Key rule**: Push payload should contain only `conversation_id`, `sender_id`, and event type — NOT message content. App fetches actual content on open. This avoids payload size limits, encryption concerns, and ensures consistency.
- FCM stores undelivered messages for up to 4 weeks

---

## 2. Real-Time GPS Tracking Architecture

### The Industry-Standard Architecture

Based on analysis of [DoorDash's real-time tracking system](https://www.systemdesignhandbook.com/guides/doordash-system-design-interview/) and [Uber's location tracking](https://dev.to/meeth_gangwar_f56b17f5aff/the-architecture-behind-uber-live-tracking-5bbm):

```
Driver Phone
    │
    │ GPS update every 2–5 seconds (lat/lng/timestamp)
    ▼
Location Ingestion Service (stateless, validates + tags order_id)
    │
    ├──────────────────────────────────┐
    ▼                                  ▼
Redis Pub/Sub                    Kafka Topic
(< 20ms latency)            (partitioned by order_id)
    │                                  │
    ▼                                  ▼
WebSocket Fanout Service      Location Processing Workers
    │                         - ETA recalculation
    ▼                         - Geofence crossing detection
Customer App                  - Analytics / billing
(live map update)             - Audit trail
```

**Critical insight** from a [real-world implementation post](https://www.linkedin.com/posts/rohith-addula_kafka-redis-systemdesign-activity-7439099582011207680-LIKr): **Don't route GPS through Kafka for the live map.** Kafka adds 50–500ms per update due to disk writes and replication. The correct production pattern is **dual-path**:
- **Redis pub/sub → WebSocket** for the live customer map (< 20ms)
- **Kafka** for analytics, billing, audit logs, and replay (async, latency doesn't matter)

### GPS Update Frequency

| Scenario | Update Interval | Rationale |
|---|---|---|
| Driver on route to pickup | Every 5 seconds | Moderate accuracy needed |
| Driver within 0.5km of customer | Every 2 seconds | High accuracy, arrival soon |
| Driver stationary / waiting | Every 30 seconds | Battery conservation |
| Background app | Every 15 seconds | OS background restrictions |

**Battery optimization**: Use `navigator.geolocation.watchPosition()` with `maximumAge` and `timeout` tuned per scenario. Only send if position changed by more than X meters to avoid noise.

### Driver Location Broadcasting

```javascript
// Driver app: throttled location sender
let lastSentTime = 0;
let lastLat = null, lastLng = null;
const MIN_DISTANCE_METERS = 10;
const MIN_INTERVAL_MS = 2000;

navigator.geolocation.watchPosition((position) => {
  const now = Date.now();
  const { latitude, longitude } = position.coords;
  
  // Only send if moved enough AND enough time elapsed
  if (now - lastSentTime < MIN_INTERVAL_MS) return;
  if (lastLat && distanceBetween(lastLat, lastLng, latitude, longitude) < MIN_DISTANCE_METERS) return;
  
  socket.send(JSON.stringify({
    type: 'location_update',
    orderId: currentOrderId,
    latitude,
    longitude,
    timestamp: now
  }));
  
  lastSentTime = now;
  lastLat = latitude;
  lastLng = longitude;
});
```

### ETA Calculation

Three approaches in order of accuracy vs. cost:

| Approach | Accuracy | Cost | Latency |
|---|---|---|---|
| **Google Maps Distance Matrix API** | Highest (real traffic) | $5/1000 requests after free tier | 100–150ms per call |
| **Mapbox Directions API** | High | $2/1000 requests after 100K/month free | ~50ms |
| **OSRM (self-hosted)** | Good (no live traffic) | Free, hosting cost only | < 10ms |
| **Haversine formula (straight line)** | Low, but fine for rough ETA | Free | < 1ms |

**Recommended for startup**: Use **Mapbox Directions API** for ETA. More generous free tier than Google Maps, competitive pricing at scale. [Mapbox vs Google Maps analysis](https://allfront.io/blog/mapbox-vs-google-maps/) shows Mapbox offers 100K free Direction API requests/month vs. Google's smaller allotment.

**ETA calculation strategy**:
- Recalculate ETA when driver location updates by > 200 meters or every 60 seconds
- Cache latest ETA in Redis with 90-second TTL
- Broadcast updated ETA to customer via WebSocket

### Geofencing

Set virtual boundaries around:
1. **Customer pickup address** (100m radius) — trigger "Driver is here!" notification
2. **Laundry facility** (200m radius) — trigger status transitions
3. **Customer delivery address** (100m radius) — trigger "Out for delivery" or "Arriving" push

Use [Redis Geo commands](https://redis.io/docs/data-types/geospatial/) (`GEOADD`, `GEODIST`, `GEORADIUS`) for O(N+log M) spatial queries without a full PostGIS setup.

### Maps API Comparison (for Laundry App)

| Feature | Google Maps | Mapbox |
|---|---|---|
| Map loads (free/mo) | 28,000 dynamic | 50,000 web / 25,000 mobile |
| Directions API (free/mo) | ~$0 credit covers ~40K | 100,000 |
| Price per 1K after free | $7 map loads | $5 map loads |
| Directions price per 1K | $5 | $2 |
| Customization | Limited | Extensive (Mapbox Studio) |
| Offline maps | No | Yes (native SDK) |
| **Recommendation** | | **Mapbox for startup** |

Source: [Yalantis Mapbox vs Google Maps](https://yalantis.com/blog/mapbox-maps-ready-mobile-apps/), [Startup House comparison](https://startup-house.com/blog/mapbox-vs-google-maps)

---

## 3. Order Status State Machine (Laundry Cycle)

### Complete State Flow

A laundry platform has a more complex cycle than food delivery — it includes a wash/dry/fold facility step that food delivery doesn't have:

```
PENDING ──────────────────────────────────────── CANCELLED
   │
   │ [Payment confirmed]
   ▼
SCHEDULED
   │
   │ [Driver accepts + departs for pickup]
   ▼
DRIVER_EN_ROUTE_PICKUP
   │
   │ [Driver arrives at customer address (geofence)]
   ▼
ARRIVED_PICKUP
   │
   │ [Customer hands over laundry / driver confirms pickup]
   ▼
PICKED_UP
   │
   │ [Driver departs for facility (geofence exit)]
   ▼
DRIVER_EN_ROUTE_FACILITY
   │
   │ [Driver arrives at facility (geofence)]
   ▼
AT_FACILITY
   │
   │ [Laundry checked in / weighed / tagged]
   ▼
PROCESSING_STARTED
   │
   │ [Wash cycle begins]
   ▼
WASHING
   │
   │ [Wash complete]
   ▼
DRYING
   │
   │ [Dry complete]
   ▼
FOLDING
   │
   │ [Ready for delivery]
   ▼
READY_FOR_DELIVERY
   │
   │ [Driver picks up from facility]
   ▼
DRIVER_EN_ROUTE_DELIVERY
   │
   │ [Driver arrives at customer address]
   ▼
ARRIVED_DELIVERY
   │
   │ [Customer receives items, confirms delivery]
   ▼
DELIVERED ──── [Payment settled] ──── COMPLETED
```

### State Machine Implementation

```javascript
// Allowed transitions (FSM enforcement in backend)
const TRANSITIONS = {
  PENDING:                    ['SCHEDULED', 'CANCELLED'],
  SCHEDULED:                  ['DRIVER_EN_ROUTE_PICKUP', 'CANCELLED'],
  DRIVER_EN_ROUTE_PICKUP:     ['ARRIVED_PICKUP', 'CANCELLED'],
  ARRIVED_PICKUP:             ['PICKED_UP', 'CANCELLED'],
  PICKED_UP:                  ['DRIVER_EN_ROUTE_FACILITY'],
  DRIVER_EN_ROUTE_FACILITY:   ['AT_FACILITY'],
  AT_FACILITY:                ['PROCESSING_STARTED'],
  PROCESSING_STARTED:         ['WASHING'],
  WASHING:                    ['DRYING'],
  DRYING:                     ['FOLDING'],
  FOLDING:                    ['READY_FOR_DELIVERY'],
  READY_FOR_DELIVERY:         ['DRIVER_EN_ROUTE_DELIVERY'],
  DRIVER_EN_ROUTE_DELIVERY:   ['ARRIVED_DELIVERY'],
  ARRIVED_DELIVERY:           ['DELIVERED'],
  DELIVERED:                  ['COMPLETED'],
  CANCELLED:                  [],
  COMPLETED:                  []
};

// PostgreSQL with optimistic concurrency control
async function transitionOrder(orderId, newStatus, actorId, actorRole) {
  const result = await db.query(`
    UPDATE orders 
    SET status = $1, updated_at = NOW(), updated_by = $2
    WHERE id = $3 
      AND status = ANY($4::text[])  -- Guard: only transition from valid states
    RETURNING *
  `, [newStatus, actorId, orderId, TRANSITIONS_FROM[newStatus]]);
  
  if (result.rowCount === 0) {
    throw new Error(`Invalid transition to ${newStatus} or order not found`);
  }
  
  // Record history for audit trail
  await db.query(`
    INSERT INTO order_status_history (order_id, status, changed_by, changed_at)
    VALUES ($1, $2, $3, NOW())
  `, [orderId, newStatus, actorId]);
  
  // Emit Kafka event for downstream processing
  await kafka.publish('order.status.changed', {
    orderId, newStatus, actorId, actorRole, timestamp: Date.now()
  });
  
  return result.rows[0];
}
```

### Notifications Per Status Transition

| Status | Customer Notification | Driver Notification |
|---|---|---|
| SCHEDULED | "Your order is confirmed. Pickup window: 2pm–4pm" | "New job accepted" |
| DRIVER_EN_ROUTE_PICKUP | "Your driver is on the way! ETA: 12 min" | Turn-by-turn navigation |
| ARRIVED_PICKUP | "Your driver has arrived" | Prompt to confirm pickup |
| PICKED_UP | "Your laundry is picked up. We'll start washing soon." | Navigate to facility |
| PROCESSING_STARTED | "Your laundry has arrived at our facility" | — |
| READY_FOR_DELIVERY | "Your laundry is clean and ready for delivery!" | New delivery assignment |
| DRIVER_EN_ROUTE_DELIVERY | "Your laundry is on its way back! ETA: 18 min" | Turn-by-turn navigation |
| DELIVERED | "Delivery complete! Rate your experience." | Job complete, payment processed |

---

## 4. Scalability Patterns

### WebSocket Scaling: Single Server to Distributed

**The fundamental problem**: WebSocket connections are stateful. When you have multiple server instances, a client on Server A cannot receive a message meant for them if it arrives at Server B.

**Single server limits** per [Ably's scaling guide](https://ably.com/topic/the-challenge-of-scaling-websockets):
- A single Node.js process: 50,000–100,000 concurrent connections
- Well-tuned with kernel settings: up to 240,000 connections at sub-50ms latency
- Memory per connection: 20–50 KB overhead → 50K connections = 1–2.5 GB RAM

**The Redis pub/sub bridge** (handles up to ~100K concurrent across a cluster):

```
                    Load Balancer (sticky sessions)
                   /          |          \
          Server A       Server B       Server C
          (20K conns)   (20K conns)    (20K conns)
              \              |              /
               ──────── Redis Pub/Sub ──────
                    (shared message bus)
```

When a driver's location update arrives at Server B, it publishes to Redis. Servers A and C receive from Redis and forward to their connected customers.

**Sticky sessions required**: Configure your load balancer (Nginx, AWS ALB) with `affinity-mode: persistent` to route the same client to the same server during the WebSocket handshake and beyond. Per [DEV Community article on horizontal scaling](https://dev.to/young_gao/scaling-websocket-connections-from-single-server-to-distributed-architecture-1men), use `ip_hash` in Nginx or cookie-based affinity in cloud load balancers.

**Scaling tiers:**

| Tier | Concurrent Users | Architecture |
|---|---|---|
| **0–5K** | Single Node.js server | Single WebSocket server, PostgreSQL LISTEN/NOTIFY |
| **5K–100K** | 3–10 node cluster | WebSocket servers + Redis pub/sub adapter |
| **100K–1M** | Dedicated WS tier | Kafka-backed fanout service, horizontal pod autoscaling |
| **1M+** | Managed (Ably/Pusher) or full custom | Geo-distributed WS clusters, Kafka sharding |

### Event-Driven Architecture Pattern

The recommended architecture for a logistics platform:

```
┌─────────────────────────────────────────────────────────┐
│                     API Gateway                          │
│            (Auth, Rate Limiting, Routing)                │
└──────────┬──────────────────────────┬───────────────────┘
           │                          │
     REST APIs                  WebSocket Gateway
   (order CRUD,               (real-time updates,
    user mgmt)                 chat, location)
           │                          │
           └──────────────┬───────────┘
                          │
                     Apache Kafka
               (event streaming backbone)
              ┌─────┬─────┬──────┬──────┐
              │     │     │      │      │
         Orders  Location Chat  Notif  Analytics
         Service Service  Svc   Svc    Pipeline
              │     │     │      │
         PostgreSQL Redis  PG   FCM/
         (source   (hot   (msg  APNs
          of truth) data) store)
```

**Key Kafka topics for a laundry platform:**

| Topic | Producers | Consumers |
|---|---|---|
| `order.status.changed` | Order Service | Notification Svc, Analytics, WS Fanout |
| `location.driver.update` | Location Ingestion Svc | Redis (hot path), Analytics Kafka consumer |
| `chat.message.sent` | Chat Service | Push Notification Svc, Analytics |
| `payment.completed` | Payment Service | Order Service, Analytics |

### Handling High Load / Preventing Crashes

**Backpressure management:**
- Rate limit GPS updates per driver (max 1 per second per device at ingestion layer)
- Queue messages in Kafka rather than writing directly to WebSocket (Kafka buffers surges)
- Set WebSocket message queue size limits; drop oldest if buffer fills

**Connection health:**
- Server-side heartbeat ping every 30 seconds; terminate connections that miss 2 pings
- Client-side exponential backoff reconnect: 1s → 2s → 4s → 8s → max 30s with jitter
- Track `lastPing` timestamp per connection in Redis with TTL

**Thundering herd prevention:**
- Add jitter (±30%) to all reconnect timers to prevent all clients reconnecting simultaneously after an outage
- Use circuit breakers on Kafka consumers to prevent downstream overload during spikes

---

## 5. Database Choices for Real-Time Data

### The Recommended Hybrid: PostgreSQL + Redis

Based on [Tim Derzhavets' architecture analysis](https://timderzhavets.com/blog/postgresql-and-redis-a-systems-design-approach-to/) and validated by production patterns at DoorDash:

| Data Type | Storage | Rationale |
|---|---|---|
| Orders, users, conversations | PostgreSQL | Source of truth, ACID, complex queries |
| Messages (chat history) | PostgreSQL | Persistent, queryable, join with users |
| Latest driver location | Redis (TTL: 60s) | Sub-millisecond reads; ~500x faster than disk |
| Active WebSocket session info | Redis (TTL: 90s) | Presence tracking across servers |
| ETA calculations | Redis (TTL: 90s) | Cache; recalculate on significant movement |
| Driver availability index | Redis Geo | O(log N) radius queries |
| Rate limiting counters | Redis | Atomic increments |
| Historical location trail | PostgreSQL / optional | For disputes, analytics, cold storage |

**Redis performance**: 50–200 microseconds for simple GET/SET operations — approximately 500x faster than a disk-based database for hot data.

### PostgreSQL LISTEN/NOTIFY vs. Redis for Startup Use

For a startup not yet at high GPS update throughput, **PostgreSQL LISTEN/NOTIFY** can replace Redis pub/sub entirely:

```sql
-- Trigger on order status change
CREATE OR REPLACE FUNCTION notify_order_update()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('order_updates', row_to_json(NEW)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_status_trigger
AFTER UPDATE OF status ON orders
FOR EACH ROW EXECUTE FUNCTION notify_order_update();
```

```javascript
// Backend listens and broadcasts to WebSockets
const { Client } = require('pg');
const pgClient = new Client(connectionString);
pgClient.connect();
pgClient.query('LISTEN order_updates');
pgClient.on('notification', (msg) => {
  const order = JSON.parse(msg.payload);
  wss.broadcast(order.customer_id, msg.payload); // send to subscribed clients
});
```

**Use PostgreSQL LISTEN/NOTIFY when:**
- < 1,000 status changes/second (more than sufficient for most startups)
- No separate infrastructure budget for Redis
- Simple notification patterns

**Switch to Redis when:**
- GPS location updates exceed 1,000/sec
- Cross-service pub/sub is needed (multiple backends)
- Message persistence in the queue is required

Source: [LinkedIn post on PostgreSQL LISTEN/NOTIFY replacing Redis](https://www.linkedin.com/posts/mahdi-bani_postgresql-systemdesign-backenddevelopment-activity-7445511827620536320-onyd)

### Schema Summary

```sql
-- Core tables
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id),
  driver_id UUID REFERENCES users(id),
  facility_id UUID REFERENCES facilities(id),
  status TEXT NOT NULL DEFAULT 'PENDING',
  pickup_address JSONB NOT NULL,
  delivery_address JSONB NOT NULL,
  pickup_window_start TIMESTAMPTZ,
  pickup_window_end TIMESTAMPTZ,
  weight_kg DECIMAL(6,2),  -- populated at facility
  price_cents INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_status CHECK (status IN (
    'PENDING','SCHEDULED','DRIVER_EN_ROUTE_PICKUP','ARRIVED_PICKUP',
    'PICKED_UP','DRIVER_EN_ROUTE_FACILITY','AT_FACILITY',
    'PROCESSING_STARTED','WASHING','DRYING','FOLDING',
    'READY_FOR_DELIVERY','DRIVER_EN_ROUTE_DELIVERY',
    'ARRIVED_DELIVERY','DELIVERED','COMPLETED','CANCELLED'
  ))
);

CREATE TABLE order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE driver_locations (
  driver_id UUID NOT NULL REFERENCES users(id),
  order_id UUID REFERENCES orders(id),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
  -- Insert-only append log; latest location served from Redis
);

-- Redis keys
-- location:driver:{driver_id}      HASH  {lat, lng, order_id, timestamp}  TTL:60s
-- order:eta:{order_id}             STRING eta_seconds                     TTL:90s
-- ws:session:{user_id}             HASH  {server_id, connected_at}        TTL:90s
-- rate:location:{driver_id}        STRING count                           TTL:1s
```

---

## 6. Performance Optimization

### API Response Time Targets

Per industry standards for logistics applications (sources: [Dotcom-Monitor](https://www.dotcom-monitor.com/blog/api-response-time-monitoring/), [Aerospike P99 analysis](https://aerospike.com/blog/what-is-p99-latency/)):

| Endpoint Type | P50 Target | P95 Target | P99 Target |
|---|---|---|---|
| Order placement | < 200ms | < 500ms | < 1s |
| Status update (write) | < 100ms | < 300ms | < 500ms |
| Location update (write) | < 50ms | < 150ms | < 300ms |
| ETA fetch (cached) | < 20ms | < 50ms | < 100ms |
| Chat message send | < 100ms | < 300ms | < 500ms |
| WebSocket event delivery | < 50ms | < 100ms | < 200ms |
| Map tile load | < 500ms | < 1s | < 2s |

**Why P99 matters more than average**: In a multi-step operation with 5 parallel API calls, if each has 99% success under 100ms, there's a ~5% chance the overall response exceeds 100ms. Always optimize tail latency in distributed systems.

### Lazy Loading & Code Splitting for the Mobile Web App

**Route-based code splitting** (highest impact):

```javascript
// React Router with lazy loading — each route becomes a separate chunk
import { lazy, Suspense } from 'react';
const CustomerDashboard = lazy(() => import('./pages/CustomerDashboard'));
const OrderTracking = lazy(() => import('./pages/OrderTracking'));
const DriverApp = lazy(() => import('./pages/DriverApp'));
const ChatWindow = lazy(() => import('./components/ChatWindow'));

// These chunks only load when the user navigates to that route
```

**Component-level lazy loading** targets:
- Map component (heavy — Mapbox GL JS is ~400KB gzipped): load only on tracking/driver pages
- Chat window: load only when user opens it
- Payment form: load only at checkout
- Photo upload (proof of delivery): load only when driver needs it

**Bundle size budget per chunk:**
- App shell (critical path): < 50KB gzipped
- Per-route chunks: < 100KB gzipped each
- Total initial load: < 200KB gzipped

### Image Optimization

For a laundry app, key images include: profile photos, facility photos, delivery confirmation photos, item condition photos.

| Strategy | Implementation |
|---|---|
| **Format** | WebP with JPEG fallback (`<picture>` tag) |
| **Responsive sizes** | `srcset` with 1x/2x variants; serve mobile-sized images on mobile |
| **Lazy loading** | `loading="lazy"` on all below-fold images |
| **CDN delivery** | Cloudflare Images or Imgix for auto-resize and format negotiation |
| **Driver photos** | Max 800x800px, compress to < 200KB on upload |
| **Proof-of-delivery** | Max 1200px wide, compress to < 500KB |
| **Cache headers** | Profile photos: `Cache-Control: max-age=86400` (1 day); Static assets: `max-age=31536000, immutable` |

### Caching Strategies (PWA/Service Worker)

Per [AppInstitute PWA Caching Guide](https://appinstitute.com/checklist-for-optimizing-pwa-caching-strategies/):

| Resource Type | Strategy | Cache Duration |
|---|---|---|
| App shell (HTML, CSS, JS bundles) | Cache-first | 1 year (with content hash) |
| Map tiles | Cache-first | 7 days |
| Facility images, logos | Cache-first | 7 days |
| User profile data | Stale-while-revalidate | 1 hour |
| Active order status | Network-first | No cache (real-time critical) |
| Order history | Stale-while-revalidate | 15 minutes |
| Driver location | No cache | Always live |

**Service Worker implementation:**
```javascript
// sw.js
const STATIC_CACHE = 'offload-static-v1';
const DYNAMIC_CACHE = 'offload-dynamic-v1';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Real-time endpoints: always network
  if (url.pathname.startsWith('/api/v1/tracking') || 
      url.pathname.startsWith('/ws')) {
    return;
  }
  
  // Static assets: cache-first
  if (url.pathname.match(/\.(js|css|png|webp|woff2)$/)) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }
  
  // API data: stale-while-revalidate
  if (url.pathname.startsWith('/api/v1/')) {
    event.respondWith(staleWhileRevalidate(event.request, DYNAMIC_CACHE));
  }
});
```

---

## 7. Recommended Architecture: Startup Playbook

### Phase 1: MVP (0–1K orders/day)

**Stack:**
- **Backend**: Node.js (Express or Fastify) + Socket.io
- **Database**: PostgreSQL (single instance, managed — e.g., Supabase or Railway)
- **Messaging**: Socket.io for WebSocket, Firebase Cloud Messaging for push
- **Maps**: Mapbox JS (50K free map loads/month, 100K free Direction API requests)
- **Cache**: None yet — PostgreSQL LISTEN/NOTIFY for real-time events
- **Hosting**: Single server (Railway, Render, or Fly.io — ~$20–$50/month)

**Avoid at this stage**: Kafka, Flink, Redis Cluster, multiple WebSocket servers. These solve problems you don't have yet.

**Key risks to design for now:**
- Idempotent state transitions (so duplicate requests don't corrupt orders)
- Push notification fallback when WebSocket disconnects
- Basic rate limiting on location updates

### Phase 2: Growth (1K–10K orders/day)

**Additions:**
- **Redis**: Add Upstash Redis (serverless, pay-per-use) for driver location hot cache, WebSocket session registry, rate limiting
- **Socket.io Redis adapter**: Enable horizontal scaling across 2–3 WebSocket servers
- **Sticky sessions**: Configure load balancer (Nginx or cloud provider)
- **Background jobs**: Bull or BullMQ (Redis-backed) for notifications, email, SMS
- **CDN**: Cloudflare for static assets and map tiles

**Cost estimate at 10K orders/day**: ~$200–$500/month infrastructure

### Phase 3: Scale (10K+ orders/day)

**Additions:**
- **Kafka** (Confluent Cloud or MSK): Replace direct service calls with event streaming
- **Dedicated WebSocket tier**: Separate pods/instances from REST API tier
- **Redis Cluster**: Shard location data across nodes
- **ETA caching**: Pre-compute ETAs for active orders, cache in Redis
- **Kubernetes**: Horizontal pod autoscaling on WebSocket tier based on connection count
- **Prometheus + Grafana**: Monitor connection counts, message latency, reconnect rate

### Infrastructure Cost Comparison

| Vendor | Free Tier | Startup Tier |
|---|---|---|
| **Mapbox** | 50K map loads/mo, 100K Direction API/mo | ~$50–200/month |
| **Google Maps** | $200 credit (~28K dynamic maps) | Gets expensive fast above free tier |
| **Ably** | 6M messages/month, 200 concurrent connections | Custom pricing at scale |
| **Pusher** | 200 concurrent connections | From $49/month |
| **Upstash Redis** | 10K daily commands free | Pay-per-use, ~$0.20/100K commands |
| **Firebase FCM** | Unlimited push notifications | Free |

---

## 8. Technology Decision Matrix

### Final Recommendations for a Laundry-on-Demand Startup

| Decision | MVP Choice | Scale Choice | Rationale |
|---|---|---|---|
| **Real-time protocol** | Socket.io | Raw WebSocket + Redis | Socket.io simplifies rooms and reconnection |
| **Push notifications** | Firebase Cloud Messaging | FCM + APNs direct | FCM handles both Android and iOS |
| **Message storage** | PostgreSQL | PostgreSQL + archival | Relational model fits conversation threading |
| **Live location store** | Redis (Upstash) | Redis Cluster | Sub-ms reads, TTL auto-cleanup |
| **GPS fanout** | Socket.io pub/sub | Redis pub/sub → WS | Dual-path: Redis for live map, Kafka for analytics |
| **Event backbone** | PostgreSQL triggers | Apache Kafka | Start simple; migrate when event volume justifies |
| **Map rendering** | Mapbox GL JS | Mapbox GL JS | Better free tier, lower cost at scale than Google |
| **ETA calculation** | Mapbox Directions API | Mapbox + OSRM fallback | Cost-effective, generous free tier |
| **Order state** | PostgreSQL + FSM logic | PostgreSQL + optimistic concurrency | ACID guarantees for financial state |
| **Scaling strategy** | Single server | Redis pub/sub → Kafka fanout | Incremental complexity as needed |

### Architecture Diagram: Recommended Production System

```
Mobile Apps (Customer, Driver, Facility Staff)
              │
        ┌─────┴──────┐
        │ CDN/Proxy   │  (Cloudflare)
        └─────┬──────┘
              │
   ┌──────────┴──────────┐
   │      API Gateway     │ (rate limiting, auth, routing)
   └────┬─────────┬───────┘
        │         │
   REST API    WebSocket
   Servers     Servers
   (stateless) (Socket.io)
        │         │
        │    Redis Pub/Sub ◄── sticky sessions via LB
        │         │
   ┌────┴─────────┴────────────────────────┐
   │              PostgreSQL               │
   │  (orders, users, messages, history)   │
   └───────────────────────────────────────┘
              │
         Kafka (async)
    ┌────────┴──────────┐
    │                   │
Notification         Analytics
 Service            Pipeline
(FCM/APNs)        (data warehouse)
```

---

## Sources

- [Uber Engineering: Building Scalable Real-Time Chat](https://www.uber.com/blog/building-scalable-real-time-chat/)
- [ByteByteGo: How Uber Built Real-Time Chat for 3M Tickets/Week](https://blog.bytebytego.com/p/how-uber-built-real-time-chat-to)
- [System Design Handbook: DoorDash Complete Guide](https://www.systemdesignhandbook.com/guides/doordash-system-design-interview/)
- [DEV Community: Uber Live Tracking Architecture](https://dev.to/meeth_gangwar_f56b17f5aff/the-architecture-behind-uber-live-tracking-5bbm)
- [DEV Community: Scaling WebSocket Connections — Distributed Architecture](https://dev.to/young_gao/scaling-websocket-connections-from-single-server-to-distributed-architecture-1men)
- [Ably: How to Scale WebSockets for High-Concurrency Systems](https://ably.com/topic/the-challenge-of-scaling-websockets)
- [PkgPulse: Best Realtime Libraries 2026](https://www.pkgpulse.com/blog/best-realtime-libraries-2026)
- [ConnectyCube: WebSockets vs Firebase for Real-Time Chat](https://connectycube.com/2025/07/17/websockets-vs-firebase-which-is-best-for-real-time-chat/)
- [Ably: Best Chat APIs for Realtime Messaging](https://ably.com/blog/best-chat-api)
- [Tim Derzhavets: PostgreSQL and Redis Systems Design](https://timderzhavets.com/blog/postgresql-and-redis-a-systems-design-approach-to/)
- [LinkedIn: PostgreSQL LISTEN/NOTIFY vs Redis](https://www.linkedin.com/posts/mahdi-bani_postgresql-systemdesign-backenddevelopment-activity-7445511827620536320-onyd)
- [LinkedIn: Kafka + Redis for Real-Time Delivery Tracking](https://www.linkedin.com/posts/rohith-addula_kafka-redis-systemdesign-activity-7439099582011207680-LIKr)
- [Clix Blog: How Push Notification Delivery Works Internally (APNs + FCM)](https://blog.clix.so/how-push-notification-delivery-works-internally/)
- [ConnectyCube: Push Notifications in Chat Apps — Best Practices](https://connectycube.com/2025/12/18/push-notifications-in-chat-apps-best-practices-for-android-ios/)
- [Yalantis: Mapbox vs Google Maps for Logistics Apps](https://yalantis.com/blog/mapbox-maps-ready-mobile-apps/)
- [AllFront: Mapbox vs Google Maps API](https://allfront.io/blog/mapbox-vs-google-maps/)
- [Google Developers: Distance Matrix API](https://developers.google.com/maps/documentation/distance-matrix/overview)
- [Shadowfax: ETA Prediction with OSRM](https://newsroom.shadowfax.in/the-middle-path-for-eta-prediction-osrm-33f1759af3e4)
- [Aerospike: What is P99 Latency?](https://aerospike.com/blog/what-is-p99-latency/)
- [GreatFrontEnd: Code Splitting and Lazy Loading in React](https://www.greatfrontend.com/blog/code-splitting-and-lazy-loading-in-react)
- [AppInstitute: Checklist for Optimizing PWA Caching Strategies](https://appinstitute.com/checklist-for-optimizing-pwa-caching-strategies/)
- [OneUptime: WebSocket Scaling with Redis Pub/Sub](https://oneuptime.com/blog/post/2026-01-24-websocket-scaling-redis-pubsub/view)
- [Nagarro: Geofencing Technology in Logistics](https://www.nagarro.com/en/blog/geofencing-technology-logistics)
