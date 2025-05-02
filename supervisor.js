#!/usr/bin/env node
const dotenv = require('dotenv');
const cluster = require('cluster');
const os = require('os');

dotenv.config({ path: process.env.ENV_FILE });

if (cluster.isMaster) {
  const numProcesses = 1;
  console.log(`Main ${process.pid} is running`);

  // Fork processes
  for (let i = 0; i < numProcesses; i++) {
    const process = cluster.fork();
    process.process.stdout.pipe(process.stdout);
    process.process.stderr.pipe(process.stderr);
  }

  cluster.on('exit', (process, code, signal) => {
    console.log(`Process ${process.process.pid} died with code: ${code}, and signal: ${signal}`);
    console.log('Starting a new process');
    const newProcess = cluster.fork();
    newProcess.process.stdout.pipe(process.stdout);
    newProcess.process.stderr.pipe(process.stderr);
  });
} else {
  const serviceName = process.env.SERVICE_NAME;
  const processType = process.env.PROCESS_TYPE || 'api'; // Default to 'api' if not specified

  if (processType === 'worker') {
    require(`./services/${serviceName}/dist/worker.js`);
    console.log(`Worker process ${process.pid} started for service ${serviceName}`);
  } else {
    require(`./services/${serviceName}/dist/api.js`);
    console.log(`API process ${process.pid} started for service ${serviceName}`);
  }
} 