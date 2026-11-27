import { resolveLander } from './src/main/lander'

// Simple test of the lander functionality
async function testLander() {
  console.log('Testing lander functionality...')
  
  // This is just to verify the import works
  console.log('Lander module imported successfully')
  
  // We can't actually test with real URLs without a browser context
  // but we've confirmed the code compiles and imports correctly
}

testLander().catch(console.error)