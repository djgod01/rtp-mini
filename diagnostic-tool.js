/**
 * RTP MIDI Diagnostic Tool for Node.js v23.11.0 Compatibility
 * 
 * This tool helps diagnose issues with the RTP MIDI library
 * when running on modern Node.js versions.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

console.log(`${colors.blue}RTP MIDI Node.js Compatibility Diagnostic Tool${colors.reset}\n`);

// Check Node.js version
const nodeVersion = process.version;
console.log(`Node.js Version: ${nodeVersion}`);

// Function to check if a Node.js API is deprecated
function checkDeprecatedAPIs() {
  console.log(`\n${colors.blue}Checking for deprecated APIs...${colors.reset}`);
  
  const deprecatedPatterns = [
    { pattern: /util\.inherits/, description: 'util.inherits is deprecated. Use ES6 class extends instead.' },
    { pattern: /new Buffer\(/, description: 'new Buffer() constructor is deprecated. Use Buffer.from() or Buffer.alloc() instead.' },
    { pattern: /\.reuseAddr/, description: 'reuseAddr is deprecated in Socket options. Use reuseAddress instead.' },
    { pattern: /\.close\(\)/, description: 'Use socket.disconnect() and socket.close() with appropriate handling.' },
    { pattern: /\.createSocket\(\s*['"]{1}udp[46]['"]{1}\s*\)/, description: 'Old socket creation pattern. Use { type: "udp4" or "udp6" } object pattern.' },
  ];

  // Get all JavaScript files in the source directory
  const sourceDir = path.resolve(__dirname, './src');
  const jsFiles = getAllJSFiles(sourceDir);
  
  let issuesFound = false;
  
  jsFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(__dirname, file);
    let fileIssues = false;
    
    deprecatedPatterns.forEach(({ pattern, description }) => {
      if (pattern.test(content)) {
        if (!fileIssues) {
          console.log(`\n${colors.yellow}Issues in ${relativePath}:${colors.reset}`);
          fileIssues = true;
          issuesFound = true;
        }
        console.log(`  - ${colors.red}${description}${colors.reset}`);
      }
    });
  });
  
  if (!issuesFound) {
    console.log(`${colors.green}No known deprecated APIs found.${colors.reset}`);
  }
}

// Function to get all JS files recursively
function getAllJSFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      results = results.concat(getAllJSFiles(filePath));
    } else if (file.endsWith('.js')) {
      results.push(filePath);
    }
  });
  
  return results;
}

// Check for dependency issues
function checkDependencies() {
  console.log(`\n${colors.blue}Checking dependencies...${colors.reset}`);
  
  const packageJsonPath = path.resolve(__dirname, './package.json');
  const packageJson = require(packageJsonPath);
  
  console.log('Dependencies:');
  Object.entries(packageJson.dependencies || {}).forEach(([dep, version]) => {
    console.log(`  - ${dep}: ${version}`);
  });
  
  console.log('\nOptional Dependencies:');
  Object.entries(packageJson.optionalDependencies || {}).forEach(([dep, version]) => {
    console.log(`  - ${dep}: ${version}`);
  });
  
  // Check for known problematic dependencies
  const problematicDeps = [];
  
  if (packageJson.dependencies && packageJson.dependencies['midi-common'] === '*') {
    problematicDeps.push('midi-common: Wildcard version (*) can lead to compatibility issues. Specify a fixed version.');
  }
  
  if (packageJson.optionalDependencies && packageJson.optionalDependencies.midi) {
    try {
      require('midi');
      console.log(`\n${colors.green}node-midi module loaded successfully.${colors.reset}`);
    } catch (err) {
      problematicDeps.push(`midi: ${err.message}`);
    }
  }
  
  if (problematicDeps.length > 0) {
    console.log(`\n${colors.yellow}Potential dependency issues:${colors.reset}`);
    problematicDeps.forEach(issue => {
      console.log(`  - ${issue}`);
    });
  }
}

// Check for ES Modules compatibility
function checkESModulesCompatibility() {
  console.log(`\n${colors.blue}Checking ES Modules compatibility...${colors.reset}`);
  
  const packageJsonPath = path.resolve(__dirname, './package.json');
  const packageJson = require(packageJsonPath);
  
  if (!packageJson.type) {
    console.log(`${colors.yellow}No "type" field in package.json. Default is "commonjs".${colors.reset}`);
    console.log('Consider adding "type": "module" for ES Modules support or "type": "commonjs" to be explicit.');
  } else {
    console.log(`Package type: ${packageJson.type}`);
  }
  
  if (!packageJson.exports) {
    console.log(`${colors.yellow}No "exports" field in package.json.${colors.reset}`);
    console.log('Consider adding an "exports" field to define entry points for both ESM and CommonJS.');
  }
}

// Test basic functionality
function testBasicFunctionality() {
  console.log(`\n${colors.blue}Testing basic library functionality...${colors.reset}`);
  
  try {
    const rtpmidi = require('./index');
    console.log(`${colors.green}Successfully loaded the RTP MIDI library.${colors.reset}`);
    
    // Create a session and check its properties
    const session = rtpmidi.manager.createSession({
      port: 5008,
      bonjourName: 'Diagnostic Test',
      published: false, // Don't publish during testing
    });
    
    console.log('Created session:');
    console.log(`  - Local Name: ${session.localName}`);
    console.log(`  - Bonjour Name: ${session.bonjourName}`);
    console.log(`  - Port: ${session.port}`);
    console.log(`  - SSRC: ${session.ssrc}`);
    
    // Clean up
    rtpmidi.manager.removeSession(session);
    console.log(`${colors.green}Successfully removed the test session.${colors.reset}`);
    
  } catch (err) {
    console.log(`${colors.red}Error loading or using the library:${colors.reset}`);
    console.log(err);
  }
}

// Run all diagnostics
function runDiagnostics() {
  checkDeprecatedAPIs();
  checkDependencies();
  checkESModulesCompatibility();
  testBasicFunctionality();
  
  console.log(`\n${colors.blue}Diagnostic completed.${colors.reset}`);
}

runDiagnostics();