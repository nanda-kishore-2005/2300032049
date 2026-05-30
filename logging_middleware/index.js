const fetch = require('node-fetch');

// My auth details
const credentials = {
  email: '2300032049csemdie@gmail.com',
  name: 'm. nanda kishore',
  rollNo: '2300032049',
  accessCode: 'AvrAAK',
  clientID: '95aec4ab-a101-48bd-a26f-3f27534a4da2',
  clientSecret: 'mqcDqpKDuPqKRnUK'
};

let myToken = '';

// function to get token
async function getToken() {
  try {
    const res = await fetch('http://4.224.186.213/evaluation-service/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    const data = await res.json();
    myToken = data.access_token;
  } catch (e) {
    console.log("error getting token", e);
  }
}

// Log function
async function Log(stack, level, pkg, message) {
  if (myToken === '') {
    await getToken();
  }

  // checking message length because api gives error
  let msg = message;
  if (msg.length > 48) {
    msg = msg.substring(0, 48);
  } else if (msg.length < 5) {
    msg = msg + "     "; 
  }

  try {
    const response = await fetch('http://4.224.186.213/evaluation-service/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + myToken
      },
      body: JSON.stringify({
        stack: stack,
        level: level,
        package: pkg,
        message: msg
      })
    });
    
    const data = await response.json();
    // console.log("Logged:", data.message);
  } catch (err) {
    console.log("log error:", err);
  }
}

module.exports = { Log, getToken };
