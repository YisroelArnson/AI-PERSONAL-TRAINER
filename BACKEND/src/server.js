const { app } = require('./app');
const { env } = require('./config/env');

function startServer() {
  return app.listen(env.port, '0.0.0.0', () => {
    console.log(`Server running on port ${env.port}`);
    console.log(`Local: http://localhost:${env.port}`);
    console.log(`Network: http://0.0.0.0:${env.port}`);
  });
}

module.exports = {
  startServer
};
