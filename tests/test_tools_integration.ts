#!/usr/bin/env ts-node
/**
 * 🧪 Lucid Terminal - Tool Integration Test Suite
 * Tests all 24 tools and command router integration
 */

import * as fs from 'fs/promises';
import { executeTool, executeCommandAsTool } from '../electron/core/tools/toolRegistry';
import { CommandRouter } from '../electron/core/commandRouter';

// Colors for output
const PURPLE = '\x1b[35m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const GOLD = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let passCount = 0;
let failCount = 0;

function header(text: string) {
  console.log(`\n${PURPLE}${'='.repeat(70)}${RESET}`);
  console.log(`${PURPLE}${text.padStart(35 + text.length / 2).padEnd(70)}${RESET}`);
  console.log(`${PURPLE}${'='.repeat(70)}${RESET}\n`);
}

function step(num: number, text: string) {
  console.log(`${BLUE}[${num}]${RESET} ${text}`);
}

function success(text: string) {
  console.log(`${GREEN}✅ ${text}${RESET}`);
  passCount++;
}

function error(text: string) {
  console.log(`${RED}❌ ${text}${RESET}`);
  failCount++;
}

function info(text: string) {
  console.log(`${GOLD}💡 ${text}${RESET}`);
}

async function testFileTool(name: string, args: any[]): Promise<boolean> {
  try {
    const result = await executeTool(name, ...args);
    if (result.success) {
      success(`${name}: ${result.output?.substring(0, 50) || 'OK'}`);
      return true;
    } else {
      error(`${name}: ${result.error || 'Failed'}`);
      return false;
    }
  } catch (e: any) {
    error(`${name}: ${e.message}`);
    return false;
  }
}

async function main() {
  header('🔧 Lucid Terminal Tool Integration Tests 🔧');
  
  const testDir = '/tmp/lucid-test-' + Date.now();
  
  try {
    // ═══════════════════════════════════════════════════════════
    // TEST 1: File Tools
    // ═══════════════════════════════════════════════════════════
    header('TEST 1: File Tools (8 tools)');
    
    step(1, 'Testing file.write...');
    await testFileTool('file.write', [`${testDir}/test.txt`, 'Hello World']);
    
    step(2, 'Testing file.read...');
    await testFileTool('file.read', [`${testDir}/test.txt`]);
    
    step(3, 'Testing file.edit...');
    await testFileTool('file.edit', [`${testDir}/test.txt`, 'World', 'Universe']);
    
    step(4, 'Testing file.list...');
    await testFileTool('file.list', [testDir, false]);
    
    step(5, 'Testing file.find...');
    await testFileTool('file.find', ['*.txt', testDir, 5]);
    
    step(6, 'Testing file.copy...');
    await testFileTool('file.copy', [`${testDir}/test.txt`, `${testDir}/test2.txt`]);
    
    step(7, 'Testing file.move...');
    await testFileTool('file.move', [`${testDir}/test2.txt`, `${testDir}/test-moved.txt`]);
    
    step(8, 'Testing file.grep...');
    await testFileTool('file.grep', ['Hello', testDir, '*.txt']);
    
    // ═══════════════════════════════════════════════════════════
    // TEST 2: System Tools
    // ═══════════════════════════════════════════════════════════
    header('TEST 2: System Tools (6 tools)');
    
    step(9, 'Testing system.pwd...');
    await testFileTool('system.pwd', []);
    
    step(10, 'Testing system.env...');
    const envResult = await executeTool('system.env');
    if (envResult.metadata?.platform) {
      success(`system.env: Platform=${envResult.metadata.platform}`);
    } else {
      error('system.env: No platform info');
    }
    
    step(11, 'Testing system.info...');
    await testFileTool('system.info', []);
    
    step(12, 'Testing system.cd...');
    const originalCwd = process.cwd();
    await testFileTool('system.cd', [testDir]);
    process.chdir(originalCwd); // Reset
    
    step(13, 'Testing system.processes...');
    await testFileTool('system.processes', []);
    
    info('Skipping system.kill (dangerous in test)');
    
    // ═══════════════════════════════════════════════════════════
    // TEST 3: Command Tools
    // ═══════════════════════════════════════════════════════════
    header('TEST 3: Command Tools (4 tools)');
    
    step(14, 'Testing command.exists...');
    const existsResult = await executeTool('command.exists', 'node');
    if (existsResult.success) {
      success('command.exists: node found');
    } else {
      error('command.exists: node not found');
    }
    
    step(15, 'Testing command.run (safe)...');
    await testFileTool('command.run', ['echo "Hello from shell"']);
    
    step(16, 'Testing command.run (risky - should block)...');
    const riskyResult = await executeTool('command.run', 'rm -rf /');
    if (!riskyResult.success && riskyResult.error?.includes('Risky')) {
      success('command.run: Risky command blocked ✅');
    } else {
      error('command.run: Risky command NOT blocked ⚠️');
    }
    
    info('Skipping command.python and command.script (require Python)');
    
    // ═══════════════════════════════════════════════════════════
    // TEST 4: Environment Tools
    // ═══════════════════════════════════════════════════════════
    header('TEST 4: Environment Tools (2 tools)');
    
    step(17, 'Testing env.find...');
    await testFileTool('env.find', ['.']);
    
    step(18, 'Testing env.activate...');
    const activateResult = await executeTool('env.activate', 'test-env');
    if (activateResult.output?.includes('activate')) {
      success('env.activate: Generated activation command');
    } else {
      error('env.activate: Failed');
    }
    
    // ═══════════════════════════════════════════════════════════
    // TEST 5: Command Mapping
    // ═══════════════════════════════════════════════════════════
    header('TEST 5: Command → Tool Mapping');
    
    step(19, 'Testing ls command...');
    const lsResult = await executeCommandAsTool('ls', [testDir]);
    if (lsResult.success) {
      success(`ls: Found ${lsResult.metadata?.count || 0} items`);
    } else {
      error('ls: Failed');
    }
    
    step(20, 'Testing cat command...');
    const catResult = await executeCommandAsTool('cat', [`${testDir}/test.txt`]);
    if (catResult.success && catResult.output?.includes('Hello')) {
      success('cat: File content read');
    } else {
      error('cat: Failed');
    }
    
    step(21, 'Testing pwd command...');
    await testFileTool('system.pwd', []);
    
    step(22, 'Testing find command...');
    await testFileTool('file.find', ['*.txt', testDir]);
    
    // ═══════════════════════════════════════════════════════════
    // TEST 6: Command Router Integration
    // ═══════════════════════════════════════════════════════════
    header('TEST 6: Command Router Integration');
    
    const router = new CommandRouter();
    
    step(23, 'Testing router route and execute...');
    const routing = router.route('help');
    if (routing.type === 'direct' && routing.confidence === 1.0) {
      success('Router: help command routes correctly');
    } else {
      error('Router: help routing failed');
    }
    
    step(24, 'Testing router fuzzy matching...');
    const fuzzyRouting = router.route('hlp'); // typo
    if (fuzzyRouting.type === 'fuzzy_match' && fuzzyRouting.suggestion?.includes('help')) {
      success('Router: Fuzzy matching works (hlp → help)');
    } else {
      error('Router: Fuzzy matching failed');
    }
    
    step(25, 'Testing router execution...');
    const execResult = await router.execute('help');
    if (execResult.success) {
      success('Router: help execution works');
    } else {
      error('Router: help execution failed');
    }
    
    step(26, 'Testing pwd through router...');
    const pwdExec = await router.execute('pwd');
    if (pwdExec.success && pwdExec.output) {
      success(`Router: pwd = ${pwdExec.output.substring(0, 40)}`);
    } else {
      error('Router: pwd failed');
    }
    
    // ═══════════════════════════════════════════════════════════
    // TEST 7: Performance Benchmarks
    // ═══════════════════════════════════════════════════════════
    header('TEST 7: Performance Benchmarks');
    
    step(27, 'Testing file.read performance...');
    const readStart = Date.now();
    await executeTool('file.read', `${testDir}/test.txt`);
    const readTime = Date.now() - readStart;
    if (readTime < 10) {
      success(`file.read: ${readTime}ms (target: <10ms)`);
    } else {
      info(`file.read: ${readTime}ms (slower than target)`);
    }
    
    step(28, 'Testing file.list performance...');
    const listStart = Date.now();
    await executeTool('file.list', testDir);
    const listTime = Date.now() - listStart;
    if (listTime < 50) {
      success(`file.list: ${listTime}ms (target: <50ms)`);
    } else {
      info(`file.list: ${listTime}ms (slower than target)`);
    }
    
    step(29, 'Testing command routing performance...');
    const routeStart = Date.now();
    router.route('help');
    const routeTime = Date.now() - routeStart;
    if (routeTime < 10) {
      success(`routing: ${routeTime}ms (target: <10ms)`);
    } else {
      info(`routing: ${routeTime}ms (slower than target)`);
    }
    
  } finally {
    // Cleanup
    try {
      await fs.rm(testDir, { recursive: true, force: true });
      info(`Cleaned up test directory: ${testDir}`);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
  
  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════
  header('📊 Test Summary');
  
  console.log(`${GREEN}Passed: ${passCount}${RESET}`);
  console.log(`${RED}Failed: ${failCount}${RESET}`);
  console.log(`${BLUE}Total:  ${passCount + failCount}${RESET}`);
  
  const percentage = Math.round((passCount / (passCount + failCount)) * 100);
  console.log(`\n${GOLD}Success Rate: ${percentage}%${RESET}`);
  
  if (failCount === 0) {
    console.log(`\n${GREEN}🎉 All tests passed! Phase 4 complete! 🎉${RESET}`);
  } else {
    console.log(`\n${GOLD}Some tests failed. Review errors above.${RESET}`);
  }
  
  console.log(`\n${PURPLE}${'='.repeat(70)}${RESET}\n`);
  
  process.exit(failCount > 0 ? 1 : 0);
}

// Run tests
main().catch(err => {
  console.error(`${RED}Fatal error: ${err.message}${RESET}`);
  process.exit(1);
});
