const axios = require('axios');

const API_URL = 'http://localhost:5005/api';
const TOKEN = 'YOUR_TEST_TOKEN'; // Replace with a valid JWT
const LEAD_ID = 'YOUR_LEAD_ID';   // Replace with an available lead ID

async function testRaceCondition() {
  console.log(`[Test] Attempting 10 simultaneous claims for Lead ${LEAD_ID}...`);
  
  const requests = Array(10).fill(0).map((_, i) => {
    return axios.post(`${API_URL}/leads/${LEAD_ID}/claim`, {}, {
      headers: { 'x-auth-token': TOKEN }
    }).catch(err => ({
      status: err.response?.status,
      msg: err.response?.data?.msg || err.message
    }));
  });

  const results = await Promise.all(requests);
  
  const successes = results.filter(r => r.status === 200 || !r.status).length;
  const conflicts = results.filter(r => r.status === 409).length;
  const others = results.filter(r => r.status !== 200 && r.status !== 409).length;

  console.log('\n--- Results ---');
  console.log(`Successes: ${successes}`);
  console.log(`409 Conflicts: ${conflicts}`);
  console.log(`Other Errors: ${others}`);
  
  if (successes === 1) {
    console.log('\n✅ PASS: Concurrency control worked. Only 1 mover succeeded.');
  } else {
    console.log(`\n❌ FAIL: Expected 1 success but got ${successes}.`);
  }
}

// testRaceCondition();
