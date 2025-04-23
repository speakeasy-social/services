#!/usr/bin/env node
const cluster = require('cluster');
const os = require('os');

if (cluster.isMaster) {
  const numProcesses = 1;
  console.log(`Main ${process.pid} is running`);

  // Fork processes
  for (let i = 0; i < numProcesses; i++) {
    cluster.fork();
  }

  cluster.on('exit', (process, code, signal) => {
    console.log(`Process ${process.process.pid} died with code: ${code}, and signal: ${signal}`);
    console.log('Starting a new process');
    cluster.fork();
  });
} else {
  const serviceName = process.env.SERVICE_NAME;
  require(`./services/${serviceName}/dist/api.js`);
  console.log(`Process ${process.pid} started for service ${serviceName}`);
} 