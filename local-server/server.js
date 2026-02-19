#!/usr/bin/env node

const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const cors = require('cors');
const mime = require('mime-types');
const chokidar = require('chokidar');
const os = require('os');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3031;

// =====================================================
// Configuration
// =====================================================
// Store the current working directory (user-selected folder)
let currentRoot = process.cwd();
let watcher = null;

// =====================================================
// Middleware
// =====================================================
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://vibrant-patience-production-61eb.up.railway.app'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from the current root
app.use('/files', (req, res, next) => {
  const filePath = path.join(currentRoot, req.url);
  res.sendFile(filePath);
});

// =====================================================
// API Routes
// =====================================================

/**
 * GET /api/status - Check if server is running
 */
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    platform: os.platform(),
    currentRoot: currentRoot,
    hostname: os.hostname()
  });
});

/**
 * GET /api/drives - Get available drives (Windows) or root folders (Unix)
 */
app.get('/api/drives', async (req, res) => {
  try {
    if (process.platform === 'win32') {
      // Windows: Get available drives
      const drives = [];
      for (let letter = 65; letter <= 90; letter++) {
        const drive = String.fromCharCode(letter) + ':\\';
        try {
          await fs.access(drive);
          drives.push(drive);
        } catch {
          // Drive doesn't exist, skip
        }
      }
      res.json({ drives });
    } else {
      // Unix: Return root and home
      res.json({
        drives: ['/', '/home', '/usr', '/etc', '/tmp']
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/set-root - Set the current working directory
 */
app.post('/api/set-root', async (req, res) => {
  const { path: newPath } = req.body;
  
  try {
    const stats = await fs.stat(newPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }
    
    currentRoot = path.resolve(newPath);
    
    // Setup file watcher for real-time updates
    if (watcher) {
      await watcher.close();
    }
    
    watcher = chokidar.watch(currentRoot, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true
    });
    
    console.log(`[INFO] Root set to: ${currentRoot}`);
    res.json({ 
      success: true, 
      currentRoot: currentRoot,
      message: `Working directory set to ${currentRoot}`
    });
    
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/list - List contents of current directory or specified path
 */
app.get('/api/list', async (req, res) => {
  const targetPath = req.query.path ? path.resolve(currentRoot, req.query.path) : currentRoot;
  
  try {
    // Security: Ensure path is within currentRoot
    if (!targetPath.startsWith(currentRoot)) {
      return res.status(403).json({ error: 'Access denied: Path outside root' });
    }
    
    const items = await fs.readdir(targetPath);
    const details = await Promise.all(
      items.map(async item => {
        const itemPath = path.join(targetPath, item);
        try {
          const stat = await fs.stat(itemPath);
          return {
            name: item,
            type: stat.isDirectory() ? 'dir' : 'file',
            size: stat.size,
            modified: stat.mtime,
            path: path.relative(currentRoot, itemPath).replace(/\\/g, '/')
          };
        } catch {
          return null; // Skip files we can't access
        }
      })
    );
    
    // Filter out nulls and sort
    const validItems = details
      .filter(item => item !== null)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    
    res.json({
      currentDir: targetPath,
      relativePath: path.relative(currentRoot, targetPath) || '.',
      items: validItems
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/file - Read file content
 */
app.get('/api/file', async (req, res) => {
  const filePath = path.resolve(currentRoot, req.query.path);
  
  try {
    if (!filePath.startsWith(currentRoot)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({
      path: req.query.path,
      content: content,
      mime: mime.lookup(filePath) || 'text/plain'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/file - Write file content
 */
app.post('/api/file', async (req, res) => {
  const { path: filePath, content } = req.body;
  const fullPath = path.resolve(currentRoot, filePath);
  
  try {
    if (!fullPath.startsWith(currentRoot)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    
    res.json({ success: true, path: filePath });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/mkdir - Create directory
 */
app.post('/api/mkdir', async (req, res) => {
  const { path: dirPath } = req.body;
  const fullPath = path.resolve(currentRoot, dirPath);
  
  try {
    if (!fullPath.startsWith(currentRoot)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await fs.mkdir(fullPath, { recursive: true });
    res.json({ success: true, path: dirPath });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/file - Delete file or directory
 */
app.delete('/api/file', async (req, res) => {
  const { path: targetPath, recursive } = req.query;
  const fullPath = path.resolve(currentRoot, targetPath);
  
  try {
    if (!fullPath.startsWith(currentRoot)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const stat = await fs.stat(fullPath);
    
    if (stat.isDirectory()) {
      if (recursive === 'true') {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        const contents = await fs.readdir(fullPath);
        if (contents.length > 0) {
          return res.status(400).json({ error: 'Directory not empty' });
        }
        await fs.rmdir(fullPath);
      }
    } else {
      await fs.unlink(fullPath);
    }
    
    res.json({ success: true, path: targetPath });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// Simple Web UI for testing (optional)
// =====================================================
// app.get('/', (req, res) => {
//   res.send(`
//     <!DOCTYPE html>
//     <html>
//     <head>
//         <title>Terminal Agent Local Server</title>
//         <style>
//             body { font-family: monospace; background: #1a1a1a; color: #00ff00; padding: 20px; }
//             pre { background: #333; padding: 10px; border-radius: 5px; }
//             input, button { background: #333; color: #00ff00; border: 1px solid #00ff00; padding: 5px; margin: 5px; }
//         </style>
//     </head>
//     <body>
//         <h1>🚀 Terminal Agent Local Server</h1>
//         <p>Status: <span id="status">Checking...</span></p>
//         <p>Current Directory: <span id="currentDir">${currentRoot}</span></p>
        
//         <h2>Set Root Directory</h2>
//         <input type="text" id="rootPath" placeholder="Enter full path" size="50" />
//         <button onclick="setRoot()">Set Root</button>
        
//         <h2>Available Drives</h2>
//         <button onclick="listDrives()">List Drives</button>
//         <pre id="drivesOutput"></pre>
        
//         <h2>Directory Listing</h2>
//         <input type="text" id="listPath" placeholder="Path (relative to root)" value="." size="50" />
//         <button onclick="listDirectory()">List</button>
//         <pre id="listOutput"></pre>
        
//         <script>
//             async function setRoot() {
//                 const path = document.getElementById('rootPath').value;
//                 const response = await fetch('/api/set-root', {
//                     method: 'POST',
//                     headers: { 'Content-Type': 'application/json' },
//                     body: JSON.stringify({ path })
//                 });
//                 const data = await response.json();
//                 document.getElementById('currentDir').textContent = data.currentRoot;
//                 alert(data.message);
//             }
            
//             async function listDrives() {
//                 const response = await fetch('/api/drives');
//                 const data = await response.json();
//                 document.getElementById('drivesOutput').textContent = JSON.stringify(data, null, 2);
//             }
            
//             async function listDirectory() {
//                 const path = document.getElementById('listPath').value;
//                 const response = await fetch('/api/list?path=' + encodeURIComponent(path));
//                 const data = await response.json();
//                 document.getElementById('listOutput').textContent = JSON.stringify(data, null, 2);
//             }
            
//             // Check status
//             fetch('/api/status')
//                 .then(r => r.json())
//                 .then(data => {
//                     document.getElementById('status').textContent = '✅ Online';
//                 })
//                 .catch(() => {
//                     document.getElementById('status').textContent = '❌ Offline';
//                 });
//         </script>
//     </body>
//     </html>
//   `);
// });

// // =====================================================
// // Start Server
// // =====================================================
// const server = app.listen(PORT, '0.0.0.0', () => {
//   console.log('\n' + '='.repeat(60));
//   console.log('🚀 TERMINAL AGENT LOCAL SERVER');
//   console.log('='.repeat(60));
//   console.log(`📍 Local URL: http://localhost:${PORT}`);
//   console.log(`📁 Current Root: ${currentRoot}`);
//   console.log(`💻 Platform: ${os.platform()}`);
//   console.log('='.repeat(60));
//   console.log('\n📋 Available Endpoints:');
//   console.log(`   GET  /api/status        - Server status`);
//   console.log(`   GET  /api/drives        - List available drives`);
//   console.log(`   POST /api/set-root      - Set working directory`);
//   console.log(`   GET  /api/list          - List directory contents`);
//   console.log(`   GET  /api/file          - Read file`);
//   console.log(`   POST /api/file          - Write file`);
//   console.log(`   POST /api/mkdir         - Create directory`);
//   console.log(`   DELETE /api/file        - Delete file/directory`);
//   console.log('='.repeat(60));
//   console.log('\n🌐 Connect your frontend to:');
//   console.log(`   http://localhost:${PORT}`);
//   console.log('='.repeat(60) + '\n');
// });

// // Handle graceful shutdown
// process.on('SIGINT', () => {
//   console.log('\n🛑 Shutting down server...');
//   if (watcher) watcher.close();
//   server.close(() => {
//     console.log('✅ Server stopped');
//     process.exit(0);
//   });
// });