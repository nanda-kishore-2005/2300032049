# Notification System Design
By: 2300032049

## Stage 1
I will use REST APIs for the basic operations.

**Endpoints:**
1. GET /notifications - to get all notifications for a student
2. POST /notifications/read - to mark a notification as read
3. GET /notifications/unread-count - to show the unread badge

**Real-time notifications:**
I will use Server-Sent Events (SSE). It is easier to implement than WebSockets because it works over standard HTTP and automatically reconnects if the connection drops. We only need to send data from server to client, so we don't need two-way communication.

## Stage 2
I choose PostgreSQL for the database because the data structure is fixed and relational databases are good for consistency.

**Schema:**
```sql
CREATE TABLE Students (
  id INT PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(100)
);

CREATE TABLE Notifications (
  id INT PRIMARY KEY,
  student_id INT,
  type VARCHAR(50),
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Queries:**
To get notifications:
```sql
SELECT * FROM Notifications WHERE student_id = 1;
```

**Scaling problems:**
If the database grows too big, queries will become slow. I would fix this by adding indexes on `student_id` and `is_read`. I would also use Redis to cache the notifications so we don't hit the database every time.

## Stage 3
The original query is:
```sql
SELECT * FROM notifications WHERE studentID = 1042 AND isRead = false ORDER BY createdAt DESC;
```
This is slow because there are 5 million rows and the database has to scan all of them to find the unread ones for student 1042.

I would change it to add a LIMIT so it doesn't load everything at once:
```sql
SELECT * FROM notifications WHERE studentID = 1042 AND isRead = false ORDER BY createdAt DESC LIMIT 20;
```

Adding indexes on every column is a bad idea because it will make inserting data very slow and it will take up a lot of storage space. We only need indexes on columns we search by, like `studentID`.

**Query for placements in last 7 days:**
```sql
SELECT * FROM notifications 
WHERE type = 'Placement' AND created_at >= NOW() - INTERVAL '7 days';
```

## Stage 4
Fetching notifications on every page load is bad. To fix this, I would:
1. Cache the notifications in Redis. When the user loads a page, it reads from Redis which is very fast.
2. Use SSE (Server-Sent Events) to push new notifications directly to the frontend. This way, the frontend doesn't need to ask the database at all after the first load.

Tradeoff: Setting up Redis and SSE adds more complexity to the code compared to just a simple database query.

## Stage 5
The original pseudocode is bad because it does everything in a loop. If `send_email` fails, the loop stops, and the rest of the students won't get anything. Also, doing this for 50,000 students will take a very long time.

DB and email should not happen together. Saving to DB is fast, but sending emails is slow and can fail. We should separate them.

**Revised pseudocode:**
```text
function notify_all(student_ids, message):
  // 1. Save all to database first
  save_all_to_db(student_ids, message)
  
  // 2. Put them in a queue to send emails in background
  add_to_email_queue(student_ids, message)
  
  // 3. Send real-time push notifications
  add_to_push_queue(student_ids, message)

// Worker that reads from queue
function process_email_queue():
  for job in queue:
    try:
      send_email(job.student_id, job.message)
    catch error:
      retry_later(job)
```

## Stage 6
For the Priority Inbox, instead of running a complex database query, I wrote code in NodeJS. 
I calculate a score for each notification. Placements get weight 3, Results 2, and Events 1. I multiply this by 1000 and add a recency score so newer ones appear higher. Then I just sort the array by the score and slice the top 10.

*Note: The actual code for this is in the `notification_app_be` folder.*
