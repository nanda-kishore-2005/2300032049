/**
 * Test file for Logging Middleware
 * Demonstrates and validates the logging package functionality
 * 
 * Usage: node test.js
 */

const { Log, initLogger, LogBatch } = require('./index');

// Auth credentials for token auto-refresh
const AUTH_CREDENTIALS = {
  email: '2300032049csemdie@gmail.com',
  name: 'm. nanda kishore',
  rollNo: '2300032049',
  accessCode: 'AvrAAK',
  clientID: '95aec4ab-a101-48bd-a26f-3f27534a4da2',
  clientSecret: 'mqcDqpKDuPqKRnUK'
};

async function runTests() {
  console.log('=== Logging Middleware Test Suite ===\n');

  // Initialize logger with auto-refresh credentials
  await initLogger(AUTH_CREDENTIALS);

  // Test 1: Info level log
  console.log('\n--- Test 1: Info Level Log ---');
  const result1 = await Log('backend', 'info', 'handler', 'Test server started successfully on port 3000');
  console.log('Result:', JSON.stringify(result1, null, 2));

  // Test 2: Debug level log
  console.log('\n--- Test 2: Debug Level Log ---');
  const result2 = await Log('backend', 'debug', 'middleware', 'Request validation passed for /api/depots');
  console.log('Result:', JSON.stringify(result2, null, 2));

  // Test 3: Warning level log
  console.log('\n--- Test 3: Warning Level Log ---');
  const result3 = await Log('backend', 'warn', 'service', 'API response time exceeded 2000ms threshold');
  console.log('Result:', JSON.stringify(result3, null, 2));

  // Test 4: Error level log
  console.log('\n--- Test 4: Error Level Log ---');
  const result4 = await Log('backend', 'error', 'handler', 'Failed to fetch depot data: connection timeout');
  console.log('Result:', JSON.stringify(result4, null, 2));

  // Test 5: Fatal level log
  console.log('\n--- Test 5: Fatal Level Log ---');
  const result5 = await Log('backend', 'fatal', 'service', 'Critical: Database connection pool exhausted');
  console.log('Result:', JSON.stringify(result5, null, 2));

  // Test 6: Invalid parameters
  console.log('\n--- Test 6: Invalid Parameters ---');
  const result6 = await Log('invalid_stack', 'info', 'handler', 'This should fail validation');
  console.log('Result:', JSON.stringify(result6, null, 2));

  console.log('\n=== All Tests Completed ===');
}

runTests().catch(console.error);
