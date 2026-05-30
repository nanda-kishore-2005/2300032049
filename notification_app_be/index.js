const fetch = require('node-fetch');
const { Log } = require('logging-middleware');

const authData = {
  email: '2300032049csemdie@gmail.com',
  name: 'm. nanda kishore',
  rollNo: '2300032049',
  accessCode: 'AvrAAK',
  clientID: '95aec4ab-a101-48bd-a26f-3f27534a4da2',
  clientSecret: 'mqcDqpKDuPqKRnUK'
};

let token = '';

async function login() {
  const res = await fetch('http://4.224.186.213/evaluation-service/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(authData)
  });
  const data = await res.json();
  token = data.access_token;
}

// Calculate priority score
function getScore(notification) {
  let weight = 1;
  if (notification.Type === 'Placement') weight = 3;
  if (notification.Type === 'Result') weight = 2;
  if (notification.Type === 'Event') weight = 1;
  
  // calculate how old it is in hours
  let now = new Date().getTime();
  let notifTime = new Date(notification.Timestamp).getTime();
  let hoursOld = (now - notifTime) / (1000 * 60 * 60);
  
  // newer is better
  let recency = 1000 - Math.floor(hoursOld);
  if (recency < 0) recency = 0;
  
  return (weight * 1000) + recency;
}

async function start() {
  await login();
  await Log('backend', 'info', 'handler', 'started notification app');

  // get notifications
  const res = await fetch('http://4.224.186.213/evaluation-service/notifications', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const data = await res.json();
  let notifications = data.notifications;
  
  await Log('backend', 'info', 'handler', 'fetched notifications');

  console.log("All Notifications:");
  for (let i = 0; i < notifications.length; i++) {
    console.log(`${i+1}. [${notifications[i].Type}] ${notifications[i].Message}`);
    // add score to the object
    notifications[i].score = getScore(notifications[i]);
  }

  // simple sort to get priority
  notifications.sort((a, b) => b.score - a.score);
  
  let top10 = notifications.slice(0, 10);
  
  console.log("\n--- Priority Inbox (Top 10) ---");
  for (let i = 0; i < top10.length; i++) {
    console.log(`${i+1}. [${top10[i].Type}] ${top10[i].Message} (Score: ${top10[i].score})`);
  }

  await Log('backend', 'info', 'handler', 'showed top 10 notifications');
}

start();
