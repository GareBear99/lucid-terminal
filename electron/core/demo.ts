/**
 * Lucid Terminal Demo
 * 
 * Shows how to use the complete workflow system
 */

import LucidCore from './lucidCore';

async function demo() {
  console.log('Initializing Lucid Terminal...\n');
  
  // Initialize the system
  const core = await LucidCore.initialize({
    workingDirectory: process.cwd()
  });
  
  // Show welcome
  console.log(core.getWelcome());
  console.log('\n');
  
  // Example 1: Direct command (no LLM)
  console.log('=== Example 1: Direct Command (No LLM) ===');
  let result = await core.processCommand('ls');
  console.log(result.terminalOutput);
  console.log('\n');
  
  // Example 2: Help command
  console.log('=== Example 2: Help ===');
  result = await core.processCommand('help');
  console.log(result.terminalOutput);
  console.log('\n');
  
  // Example 3: Query (uses LLM with bypass routing)
  console.log('=== Example 3: Conversational Query ===');
  result = await core.processCommand('What is the difference between let and const in JavaScript?');
  console.log(result.terminalOutput);
  console.log('\n');
  
  // Example 4: Script building (LLM + FixNet storage)
  console.log('=== Example 4: Script Building ===');
  result = await core.processCommand('build a Python script to sort a list of numbers');
  console.log(result.terminalOutput);
  console.log('\n');
  
  // Example 5: Fix request (FixNet search first)
  console.log('=== Example 5: Fix Request ===');
  result = await core.processCommand('fix TypeError: undefined is not a function');
  console.log(result.terminalOutput);
  console.log('\n');
  
  // Show conversation history
  console.log('=== Conversation History ===');
  const history = core.getConversationHistory();
  console.log(`Total exchanges: ${history.length / 2}`);
  console.log('\n');
  
  // Show FixNet stats
  console.log('=== FixNet Statistics ===');
  const stats = await core.getFixNetStats();
  console.log(JSON.stringify(stats, null, 2));
  console.log('\n');
  
  // Show token stats
  console.log('=== Session Token Statistics ===');
  const tokenStats = core.getSessionTokenStats();
  console.log(JSON.stringify(tokenStats, null, 2));
  console.log('\n');
  
  // Show model statuses
  console.log('=== Model Statuses ===');
  const modelStatuses = await core.getModelStatuses();
  for (const [model, status] of modelStatuses) {
    console.log(`${model}: ${status ? '✅ Available' : '❌ Unavailable'}`);
  }
  console.log('\n');
  
  console.log('Demo complete!');
}

// Run demo if called directly
if (require.main === module) {
  demo().catch(error => {
    console.error('Demo error:', error);
    process.exit(1);
  });
}

export default demo;
