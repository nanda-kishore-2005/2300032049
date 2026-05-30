/**
 * Priority Inbox — Campus Notification Backend (Stage 6)
 *
 * Fetches notifications from the evaluation API and computes
 * the top-N most important unread notifications using a
 * min-heap (priority queue) approach.
 *
 * Priority = typeWeight * 1000 + recencyScore
 *   - Placement = 3, Result = 2, Event = 1
 *   - recencyScore based on how recent the timestamp is
 *
 * @author 2300032049
 */

const fetch = require('node-fetch');
const { Log, initLogger } = require('logging-middleware');

// ─── Configuration ───────────────────────────────────────────────────────────
const BASE_URL = 'http://4.224.186.213/evaluation-service';
const NOTIFICATIONS_URL = `${BASE_URL}/notifications`;
const TOP_N = 10;

const AUTH_CREDENTIALS = {
  email: '2300032049csemdie@gmail.com',
  name: 'm. nanda kishore',
  rollNo: '2300032049',
  accessCode: 'AvrAAK',
  clientID: '95aec4ab-a101-48bd-a26f-3f27534a4da2',
  clientSecret: 'mqcDqpKDuPqKRnUK'
};

let AUTH_TOKEN = '';

async function getToken() {
  const res = await fetch(`${BASE_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(AUTH_CREDENTIALS)
  });
  if (res.ok || res.status === 201) {
    const data = await res.json();
    AUTH_TOKEN = data.access_token;
  }
}

const TYPE_WEIGHTS = {
  Placement: 3,
  Result: 2,
  Event: 1
};

// ─── Min-Heap Implementation ─────────────────────────────────────────────────

class MinHeap {
  constructor(comparator) {
    this.data = [];
    this.comparator = comparator;
  }

  size() { return this.data.length; }

  peek() { return this.data[0]; }

  push(val) {
    this.data.push(val);
    this._bubbleUp(this.data.length - 1);
  }

  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.comparator(this.data[i], this.data[parent]) < 0) {
        [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
        i = parent;
      } else break;
    }
  }

  _sinkDown(i) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.comparator(this.data[left], this.data[smallest]) < 0) smallest = left;
      if (right < n && this.comparator(this.data[right], this.data[smallest]) < 0) smallest = right;
      if (smallest !== i) {
        [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
        i = smallest;
      } else break;
    }
  }

  toSortedArray() {
    return [...this.data].sort((a, b) => b.priorityScore - a.priorityScore);
  }
}

// ─── Priority Calculation ────────────────────────────────────────────────────

function computePriority(notification, now) {
  const weight = TYPE_WEIGHTS[notification.Type] || 1;
  const ts = new Date(notification.Timestamp).getTime();
  const ageMs = now - ts;
  const ageHours = ageMs / (1000 * 60 * 60);
  // Recency: newer = higher score. Max ~999 for very recent.
  const recencyScore = Math.max(0, 999 - Math.floor(ageHours));
  return weight * 1000 + recencyScore;
}

// ─── Fetch Notifications ─────────────────────────────────────────────────────

async function fetchNotifications() {
  await Log('backend', 'info', 'service', 'Fetching notifications from evaluation service API');

  const response = await fetch(NOTIFICATIONS_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`
    }
  });

  if (!response.ok) {
    const err = await response.text();
    await Log('backend', 'error', 'service', `Notifications API error: ${response.status} - ${err}`);
    throw new Error(`API returned ${response.status}`);
  }

  const data = await response.json();
  await Log('backend', 'info', 'service', `Fetched ${data.notifications.length} notifications`);
  return data.notifications;
}

// ─── Find Top N ──────────────────────────────────────────────────────────────

async function findTopN(notifications, n) {
  await Log('backend', 'info', 'handler', `Computing top ${n} priority notifications from ${notifications.length} total`);

  const now = Date.now();
  const heap = new MinHeap((a, b) => a.priorityScore - b.priorityScore);

  for (const notif of notifications) {
    const score = computePriority(notif, now);
    const entry = { ...notif, priorityScore: score };

    if (heap.size() < n) {
      heap.push(entry);
    } else if (score > heap.peek().priorityScore) {
      heap.pop();
      heap.push(entry);
    }
  }

  const sorted = heap.toSortedArray();
  await Log('backend', 'info', 'handler', `Top ${n} notifications computed successfully`);
  return sorted;
}

// ─── Simulate New Notification Arrival ───────────────────────────────────────

function addNewNotification(heap, notification, n) {
  const now = Date.now();
  const score = computePriority(notification, now);
  const entry = { ...notification, priorityScore: score };

  if (heap.size() < n) {
    heap.push(entry);
    return true;
  } else if (score > heap.peek().priorityScore) {
    heap.pop();
    heap.push(entry);
    return true;
  }
  return false;
}

// ─── Display ─────────────────────────────────────────────────────────────────

function displayResults(topNotifications) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║              PRIORITY INBOX — Top 10 Notifications                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  console.log(`  ${'#'.padEnd(4)} ${'Type'.padEnd(12)} ${'Score'.padEnd(8)} ${'Timestamp'.padEnd(22)} Message`);
  console.log(`  ${'─'.repeat(4)} ${'─'.repeat(12)} ${'─'.repeat(8)} ${'─'.repeat(22)} ${'─'.repeat(30)}`);

  topNotifications.forEach((n, i) => {
    const rank = String(i + 1).padEnd(4);
    const type = (n.Type || 'N/A').padEnd(12);
    const score = String(n.priorityScore).padEnd(8);
    const ts = (n.Timestamp || 'N/A').padEnd(22);
    const msg = n.Message || 'N/A';
    console.log(`  ${rank} ${type} ${score} ${ts} ${msg}`);
  });

  console.log(`\n  Total displayed: ${topNotifications.length}`);
  console.log('');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║         CAMPUS NOTIFICATION — PRIORITY INBOX (Stage 6)                 ║');
  console.log('║         Roll Number: 2300032049                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  await getToken();
  await initLogger(AUTH_CREDENTIALS);
  await Log('backend', 'info', 'service', '=== Priority Inbox service starting ===');

  try {
    // Fetch notifications
    const notifications = await fetchNotifications();
    console.log(`✓ Fetched ${notifications.length} notifications\n`);

    // Print all notifications
    console.log('── All Notifications ──');
    notifications.forEach((n, i) => {
      console.log(`  ${i + 1}. [${n.Type}] ${n.Message} (${n.Timestamp})`);
    });

    // Find top 10
    const top10 = await findTopN(notifications, TOP_N);
    displayResults(top10);

    // Demonstrate handling a new incoming notification
    console.log('── Simulating New Notification Arrival ──');
    const newNotif = {
      ID: 'sim-new-001',
      Type: 'Placement',
      Message: 'Urgent: Google hiring drive tomorrow!',
      Timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };
    console.log(`  New: [${newNotif.Type}] ${newNotif.Message}`);

    const now = Date.now();
    const heap = new MinHeap((a, b) => a.priorityScore - b.priorityScore);
    for (const n of top10) heap.push(n);

    const replaced = addNewNotification(heap, newNotif, TOP_N);
    console.log(`  Replaced lowest priority? ${replaced ? 'Yes' : 'No'}`);

    const updatedTop = heap.toSortedArray();
    displayResults(updatedTop);

    await Log('backend', 'info', 'service', '=== Priority Inbox completed successfully ===');

  } catch (error) {
    await Log('backend', 'fatal', 'service', `Priority Inbox failed: ${error.message}`);
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
