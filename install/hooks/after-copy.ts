#!/usr/bin/env node
/**
 * Capacitor NodeJS Plugin After Copy Hook
 * Runs after capacitor copy/sync to download Node.js Mobile library
 */

import { runFetchLibNode } from './both/fetch-libnode.js';

async function main() {
  try {
    await runFetchLibNode();
  } catch (error) {
    console.error('Error running after-copy hook:', error);
    process.exit(1);
  }
}

main();

