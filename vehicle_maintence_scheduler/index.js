const fetch = require('node-fetch');
const { Log } = require('logging-middleware');

// auth data
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

// 0/1 knapsack algorithm for scheduling
function knapsack(vehicles, maxHours) {
  let n = vehicles.length;
  let dp = [];
  
  // make 2d array
  for (let i = 0; i <= n; i++) {
    dp[i] = [];
    for (let j = 0; j <= maxHours; j++) {
      dp[i][j] = 0;
    }
  }

  // fill dp table
  for (let i = 1; i <= n; i++) {
    let duration = vehicles[i-1].Duration;
    let impact = vehicles[i-1].Impact;
    
    for (let j = 0; j <= maxHours; j++) {
      if (duration <= j) {
        dp[i][j] = Math.max(dp[i-1][j], dp[i-1][j - duration] + impact);
      } else {
        dp[i][j] = dp[i-1][j];
      }
    }
  }

  // find which tasks were selected
  let selected = [];
  let res = dp[n][maxHours];
  let w = maxHours;
  
  for (let i = n; i > 0 && res > 0; i--) {
    if (res !== dp[i-1][w]) {
      selected.push(vehicles[i-1]);
      res = res - vehicles[i-1].Impact;
      w = w - vehicles[i-1].Duration;
    }
  }
  
  return selected;
}

async function run() {
  await login();
  await Log('backend', 'info', 'service', 'started vehicle scheduler');

  // get depots
  const depotRes = await fetch('http://4.224.186.213/evaluation-service/depots', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const depotData = await depotRes.json();
  const depots = depotData.depots;
  await Log('backend', 'info', 'service', 'got depots data');

  // get vehicles
  const vehicleRes = await fetch('http://4.224.186.213/evaluation-service/vehicles', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const vehicleData = await vehicleRes.json();
  
  // filter bad data
  let validVehicles = [];
  for (let v of vehicleData.vehicles) {
    if (v.Duration > 0 && v.Impact > 0) {
      validVehicles.push(v);
    }
  }
  await Log('backend', 'info', 'service', 'got vehicles data');

  console.log("--- Vehicle Maintenance Scheduler ---");
  
  // run for each depot
  for (let depot of depots) {
    await Log('backend', 'info', 'service', 'processing depot ' + depot.ID);
    
    let selectedTasks = knapsack(validVehicles, depot.MechanicHours);
    
    let totalImpact = 0;
    let totalDuration = 0;
    for (let task of selectedTasks) {
      totalImpact += task.Impact;
      totalDuration += task.Duration;
    }
    
    console.log(`\nDepot ${depot.ID} (Max Hours: ${depot.MechanicHours})`);
    console.log(`Used Hours: ${totalDuration}, Total Impact: ${totalImpact}`);
    console.log("Selected Tasks:");
    for (let t of selectedTasks) {
      console.log(`- TaskID: ${t.TaskID}, Duration: ${t.Duration}, Impact: ${t.Impact}`);
    }
  }
  
  await Log('backend', 'info', 'service', 'finished vehicle scheduler');
}

run();
