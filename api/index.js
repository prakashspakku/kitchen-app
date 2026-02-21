const mongoose = require('mongoose');
const app = require('./server');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kitchen API running on :${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => mongoose.connection.close(false, () => process.exit(0)));
});
