const net = require('net');

const client = net.createConnection({ host: 'tokaido.proxy.rlwy.net', port: 16898 }, () => {
  console.log('Connected to tokaido.proxy.rlwy.net:16898');
  client.end();
});

client.on('error', (err) => {
  console.error('Connection error:', err);
});
