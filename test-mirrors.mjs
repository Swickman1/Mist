import { execSync } from 'child_process';
import fs from 'fs';

// Read the mirror list
const mirrors = fs.readFileSync('mirror-list.txt', 'utf8')
  .split('\n')
  .filter(line => line.startsWith('http'))
  .map(line => line.trim());

console.log('Testing mirrors:');
mirrors.forEach((mirror, index) => {
  console.log(`${index + 1}. ${mirror}`);
});

// Test each mirror using the existing probe script
for (const mirror of mirrors) {
  try {
    console.log(`\n--- Testing ${mirror} ---`);
    const result = execSync(`node scripts/probe-mirror.mjs "${mirror}"`, { encoding: 'utf8' });
    console.log(result);
  } catch (error) {
    console.log(`Error testing ${mirror}:`, error.message);
  }
}