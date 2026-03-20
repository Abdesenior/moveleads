/**
 * Test script for MoveLeads WebSocket Connection
 * Usage: node server/scripts/testSocket.js <JWT_TOKEN>
 */

const { io } = require('socket.io-client');

const token = process.argv[2];

if (!token) {
  console.error('Usage: node server/scripts/testSocket.js <JWT_TOKEN>');
  process.exit(1);
}

const socket = io('http://localhost:5005', {
  auth: {
    token: token
  }
});

socket.on('connect', () => {
  console.log('Connected to server! ID:', socket.id);
});

socket.on('connection_established', (data) => {
  console.log('Auth Success:', data);
});

socket.on('NEW_LEAD_AVAILABLE', (lead) => {
  console.log('\n--- NEW LEAD RECEIVED ---');
  console.log('Route:', lead.route);
  console.log('Price:', lead.price);
  console.log('Zips:', lead.originZip, '->', lead.destinationZip);
  console.log('-------------------------\n');
});

socket.on('connect_error', (err) => {
  console.error('Connection Error:', err.message);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

console.log('Connecting to http://localhost:5005...');
