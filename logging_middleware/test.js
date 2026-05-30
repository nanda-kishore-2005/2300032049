const { Log } = require('./index');

async function testLogs() {
  console.log("testing logs...");
  await Log("backend", "info", "handler", "this is a test log message");
  await Log("backend", "error", "service", "testing error log");
  console.log("done");
}
testLogs();
