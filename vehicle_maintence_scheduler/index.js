/**
 * Vehicle Maintenance Scheduler Microservice
 * 
 * Solves the 0/1 Knapsack Problem to optimize daily vehicle maintenance scheduling.
 * Given a list of vehicles with operational impact scores and service durations,
 * and a daily mechanic-hour budget, determines the optimal subset of vehicles
 * to service to maximize total operational impact within the available budget.
 * 
 * Algorithm: Dynamic Programming (0/1 Knapsack)
 * Time Complexity: O(n * W) where n = number of tasks, W = mechanic hours
 * Space Complexity: O(n * W)
 * 
 * @author 2300032049
 */

const fetch = require('node-fetch');
const { Log, initLogger } = require('logging-middleware');

// ─── Configuration ───────────────────────────────────────────────────────────
const BASE_URL = 'http://4.224.186.213/evaluation-service';
const DEPOTS_URL = `${BASE_URL}/depots`;
const VEHICLES_URL = `${BASE_URL}/vehicles`;

// Auth credentials for auto-refresh
const AUTH_CREDENTIALS = {
  email: '2300032049csemdie@gmail.com',
  name: 'm. nanda kishore',
  rollNo: '2300032049',
  accessCode: 'AvrAAK',
  clientID: '95aec4ab-a101-48bd-a26f-3f27534a4da2',
  clientSecret: 'mqcDqpKDuPqKRnUK'
};

let AUTH_TOKEN = '';

/**
 * Fetch a fresh auth token for API calls.
 */
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

// ─── API Functions ───────────────────────────────────────────────────────────

/**
 * Fetches depot data from the evaluation service API.
 * Each depot has an ID and available MechanicHours.
 * 
 * @returns {Promise<Array<{ID: number, MechanicHours: number}>>}
 */
async function fetchDepots() {
  await Log('backend', 'info', 'service', 'Fetching depot data from evaluation service API');
  
  try {
    const response = await fetch(DEPOTS_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      await Log('backend', 'error', 'service', `Failed to fetch depots: HTTP ${response.status} - ${errorText}`);
      throw new Error(`Depots API returned status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    await Log('backend', 'info', 'service', `Successfully fetched ${data.depots.length} depots from API`);
    await Log('backend', 'debug', 'service', `Depot details: ${JSON.stringify(data.depots)}`);
    
    return data.depots;
  } catch (error) {
    await Log('backend', 'fatal', 'service', `Critical failure fetching depots: ${error.message}`);
    throw error;
  }
}

/**
 * Fetches vehicle/task data from the evaluation service API.
 * Each vehicle has a TaskID, Duration (hours), and Impact score.
 * 
 * @returns {Promise<Array<{TaskID: string, Duration: number, Impact: number}>>}
 */
async function fetchVehicles() {
  await Log('backend', 'info', 'service', 'Fetching vehicle task data from evaluation service API');
  
  try {
    const response = await fetch(VEHICLES_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      await Log('backend', 'error', 'service', `Failed to fetch vehicles: HTTP ${response.status} - ${errorText}`);
      throw new Error(`Vehicles API returned status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    await Log('backend', 'info', 'service', `Successfully fetched ${data.vehicles.length} vehicle tasks from API`);
    await Log('backend', 'debug', 'service', `Total vehicles to process: ${data.vehicles.length}`);
    
    return data.vehicles;
  } catch (error) {
    await Log('backend', 'fatal', 'service', `Critical failure fetching vehicles: ${error.message}`);
    throw error;
  }
}

// ─── Knapsack Algorithm ──────────────────────────────────────────────────────

/**
 * Solves the 0/1 Knapsack Problem using Dynamic Programming.
 * 
 * Given a set of tasks (vehicles) each with a duration (weight) and impact (value),
 * and a capacity (mechanic hours), this function finds the subset of tasks that
 * maximizes total impact without exceeding the capacity.
 * 
 * @param {Array<{TaskID: string, Duration: number, Impact: number}>} vehicles - List of maintenance tasks
 * @param {number} capacity - Available mechanic-hours (knapsack capacity)
 * @returns {{selectedTasks: Array, totalImpact: number, totalDuration: number}}
 */
async function solveKnapsack(vehicles, capacity) {
  const n = vehicles.length;
  
  await Log('backend', 'info', 'service', `Starting knapsack optimization: ${n} tasks, capacity=${capacity} hours`);

  // Filter out vehicles with invalid data
  const validVehicles = vehicles.filter(v => 
    v.Duration && v.Impact && v.Duration > 0 && v.Impact > 0 && Number.isFinite(v.Duration) && Number.isFinite(v.Impact)
  );
  
  await Log('backend', 'info', 'service', `Valid vehicles after filtering: ${validVehicles.length} of ${n}`);

  if (validVehicles.length === 0) {
    await Log('backend', 'warn', 'service', 'No valid vehicles to schedule');
    return { selectedTasks: [], totalImpact: 0, totalDuration: 0 };
  }

  const numItems = validVehicles.length;
  const W = Math.floor(capacity);

  // DP table: dp[i][w] = max impact using first i items with capacity w
  // Using 2D array for backtracking
  const dp = Array.from({ length: numItems + 1 }, () => new Array(W + 1).fill(0));

  await Log('backend', 'debug', 'service', `DP table dimensions: ${numItems + 1} x ${W + 1}`);

  // Fill the DP table
  for (let i = 1; i <= numItems; i++) {
    const duration = Math.floor(validVehicles[i - 1].Duration);
    const impact = validVehicles[i - 1].Impact;

    for (let w = 0; w <= W; w++) {
      // Don't take item i
      dp[i][w] = dp[i - 1][w];

      // Take item i (if it fits)
      if (duration <= w) {
        dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - duration] + impact);
      }
    }
  }

  const maxImpact = dp[numItems][W];
  await Log('backend', 'info', 'service', `Knapsack optimization complete. Maximum impact score: ${maxImpact}`);

  // Backtrack to find selected items
  const selectedTasks = [];
  let remainingCapacity = W;

  for (let i = numItems; i > 0; i--) {
    if (dp[i][remainingCapacity] !== dp[i - 1][remainingCapacity]) {
      // Item i was included
      selectedTasks.push(validVehicles[i - 1]);
      remainingCapacity -= Math.floor(validVehicles[i - 1].Duration);
    }
  }

  // Reverse to maintain original order
  selectedTasks.reverse();

  const totalDuration = selectedTasks.reduce((sum, t) => sum + t.Duration, 0);
  
  await Log('backend', 'info', 'service', 
    `Selected ${selectedTasks.length} tasks | Total Impact: ${maxImpact} | Total Duration: ${totalDuration}/${capacity} hours`
  );

  return {
    selectedTasks,
    totalImpact: maxImpact,
    totalDuration
  };
}

// ─── Output Formatting ──────────────────────────────────────────────────────

/**
 * Formats and displays the scheduling results for a single depot.
 * 
 * @param {object} depot - Depot information
 * @param {object} result - Knapsack solution result
 */
function displayDepotResult(depot, result) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  DEPOT ${depot.ID} — Available Mechanic Hours: ${depot.MechanicHours}`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`  Optimal Solution:`);
  console.log(`    • Total Impact Score: ${result.totalImpact}`);
  console.log(`    • Total Hours Used:   ${result.totalDuration} / ${depot.MechanicHours}`);
  console.log(`    • Tasks Selected:     ${result.selectedTasks.length}`);
  console.log(`${'─'.repeat(70)}`);
  console.log(`  ${'TaskID'.padEnd(40)} ${'Duration'.padEnd(10)} ${'Impact'.padEnd(10)}`);
  console.log(`  ${'─'.repeat(40)} ${'─'.repeat(10)} ${'─'.repeat(10)}`);
  
  result.selectedTasks.forEach(task => {
    console.log(`  ${task.TaskID.padEnd(40)} ${String(task.Duration).padEnd(10)} ${String(task.Impact).padEnd(10)}`);
  });
  
  console.log(`${'═'.repeat(70)}\n`);
}

// ─── Main Execution ──────────────────────────────────────────────────────────

/**
 * Main entry point for the Vehicle Maintenance Scheduler.
 * 
 * Workflow:
 * 1. Initialize logging
 * 2. Fetch depot data (capacity constraints)
 * 3. Fetch vehicle data (tasks with duration & impact)
 * 4. For each depot, solve the knapsack problem
 * 5. Display optimized schedules
 */
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║         VEHICLE MAINTENANCE SCHEDULER MICROSERVICE                 ║');
  console.log('║         Roll Number: 2300032049                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  // Step 1: Initialize Logger
  await getToken();
  await initLogger(AUTH_CREDENTIALS);
  await Log('backend', 'info', 'service', '=== Vehicle Maintenance Scheduler starting ===');
  await Log('backend', 'info', 'config', `API Base URL: ${BASE_URL}`);

  try {
    // Step 2: Fetch depot data
    await Log('backend', 'info', 'service', 'Step 1/3: Fetching depot information...');
    const depots = await fetchDepots();
    console.log(`\n✓ Fetched ${depots.length} depots successfully`);

    // Step 3: Fetch vehicle data
    await Log('backend', 'info', 'service', 'Step 2/3: Fetching vehicle task information...');
    const vehicles = await fetchVehicles();
    console.log(`✓ Fetched ${vehicles.length} vehicle tasks successfully`);

    // Display raw data summary
    console.log(`\n${'─'.repeat(70)}`);
    console.log('  RAW DATA SUMMARY');
    console.log(`${'─'.repeat(70)}`);
    console.log(`  Depots: ${depots.length}`);
    depots.forEach(d => console.log(`    • Depot ${d.ID}: ${d.MechanicHours} mechanic-hours available`));
    console.log(`  Vehicle Tasks: ${vehicles.length}`);
    console.log(`  Total Impact Available: ${vehicles.reduce((sum, v) => sum + (v.Impact || 0), 0)}`);
    console.log(`  Total Duration Required: ${vehicles.reduce((sum, v) => sum + (v.Duration || 0), 0)} hours`);
    console.log(`${'─'.repeat(70)}`);

    // Step 4: Solve knapsack for each depot
    await Log('backend', 'info', 'service', 'Step 3/3: Running knapsack optimization for each depot...');

    const allResults = [];

    for (const depot of depots) {
      await Log('backend', 'info', 'service', `Processing Depot ${depot.ID} with ${depot.MechanicHours} mechanic-hours`);
      
      const startTime = Date.now();
      const result = await solveKnapsack(vehicles, depot.MechanicHours);
      const executionTime = Date.now() - startTime;

      await Log('backend', 'info', 'service', 
        `Depot ${depot.ID} optimization completed in ${executionTime}ms | Impact: ${result.totalImpact} | Tasks: ${result.selectedTasks.length}`
      );

      displayDepotResult(depot, result);
      
      allResults.push({
        depotId: depot.ID,
        mechanicHours: depot.MechanicHours,
        ...result,
        executionTimeMs: executionTime
      });
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║                       OPTIMIZATION SUMMARY                         ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    console.log(`\n  ${'Depot'.padEnd(8)} ${'Capacity'.padEnd(12)} ${'Used'.padEnd(8)} ${'Impact'.padEnd(10)} ${'Tasks'.padEnd(8)} ${'Time(ms)'.padEnd(10)}`);
    console.log(`  ${'─'.repeat(8)} ${'─'.repeat(12)} ${'─'.repeat(8)} ${'─'.repeat(10)} ${'─'.repeat(8)} ${'─'.repeat(10)}`);
    
    allResults.forEach(r => {
      console.log(`  ${String(r.depotId).padEnd(8)} ${String(r.mechanicHours).padEnd(12)} ${String(r.totalDuration).padEnd(8)} ${String(r.totalImpact).padEnd(10)} ${String(r.selectedTasks.length).padEnd(8)} ${String(r.executionTimeMs).padEnd(10)}`);
    });

    await Log('backend', 'info', 'service', '=== Vehicle Maintenance Scheduler completed successfully ===');
    console.log('\n✓ All depots processed successfully!\n');

  } catch (error) {
    await Log('backend', 'fatal', 'service', `Scheduler failed with critical error: ${error.message}`);
    console.error('\n✗ Scheduler failed:', error.message);
    process.exit(1);
  }
}

// Run the scheduler
main().catch(async (error) => {
  console.error('Unhandled error:', error);
  await Log('backend', 'fatal', 'service', `Unhandled error in main: ${error.message}`);
  process.exit(1);
});
