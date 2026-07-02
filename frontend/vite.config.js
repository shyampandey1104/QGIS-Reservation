import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const downloadsDir = '/Users/shyamkumarpandey/Downloads'
const zipSubDir = 'MIRABHAINDAR MUNICIPAL CORPORATION RESERVATATION WORK 2023'

// Helper function to recursively find a file by exact name in a directory
function findFileRecursively(dir, targetName) {
  if (!fs.existsSync(dir)) return null;
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }
      if (stat.isDirectory()) {
        if (item === 'node_modules' || item.startsWith('.')) continue;
        const found = findFileRecursively(fullPath, targetName);
        if (found) return found;
      } else if (stat.isFile() && item.toLowerCase() === targetName.toLowerCase()) {
        return fullPath;
      }
    }
  } catch (e) {}
  return null;
}

// Helper function to find best match based on words/digits in a directory
function findBestMatchInDir(dir, targetName) {
  if (!fs.existsSync(dir)) return null;
  try {
    const items = fs.readdirSync(dir);
    let bestFile = null;
    let bestScore = 0;
    
    const targetParts = targetName.toLowerCase().split(/[^a-z0-9]/).filter(Boolean);
    if (targetParts.length === 0) return null;
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }
      if (!stat.isFile()) continue;
      
      const itemParts = item.toLowerCase().split(/[^a-z0-9]/).filter(Boolean);
      
      let score = 0;
      targetParts.forEach(p => {
        if (itemParts.includes(p)) score++;
      });
      
      if (score > bestScore) {
        bestScore = score;
        bestFile = fullPath;
      }
    }
    
    if (bestScore >= 2 || (targetParts.length === 1 && bestScore === 1)) {
      return bestFile;
    }
  } catch (e) {}
  return null;
}

function localFilesPlugin() {
  return {
    name: 'local-files-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/files/')) {
          // Remove query params if any
          const urlPath = req.url.split('?')[0];
          // Decode URL
          const decodedPath = decodeURIComponent(urlPath).replace(/\\/g, '/');
          
          const relativePart = decodedPath.replace(/^\/files\//, '');
          const filename = path.basename(decodedPath);
          const pathParts = decodedPath.split('/');
          const resFolder = pathParts.find(p => p.startsWith('RES_'));
          const subDir = pathParts.includes('CAD') ? 'CAD' : 'DOCUMENT';
          
          // List of directories to search
          const scratchSiteFiles = '/Users/shyamkumarpandey/.gemini/antigravity/scratch/qgis_reservation/frappe-bench/sites/qgis_reservation.com/public/files';
          const mainSiteFiles = '/Users/shyamkumarpandey/gis/frappe-bench/sites/qgis.com/public/files';
          
          const searchDirs = [
            scratchSiteFiles,
            mainSiteFiles,
            downloadsDir,
            path.join(downloadsDir, zipSubDir)
          ];
          
          let fileToServe = null;
          
          // 1. Try exact relative paths in all search directories
          for (const baseDir of searchDirs) {
            const exactPath = path.join(baseDir, relativePart);
            if (fs.existsSync(exactPath) && fs.statSync(exactPath).isFile()) {
              fileToServe = exactPath;
              break;
            }
          }
          
          // 2. Try exact filename match in Downloads directly (fallback for loose downloads)
          if (!fileToServe) {
            const loosePath = path.join(downloadsDir, filename);
            if (fs.existsSync(loosePath) && fs.statSync(loosePath).isFile()) {
              fileToServe = loosePath;
            }
          }
          
          // 3. Try best match in specific RES_xxx/SUBDIR folders if they exist
          if (!fileToServe && resFolder) {
            for (const baseDir of searchDirs) {
              const targetFolder = path.join(baseDir, resFolder, subDir);
              const matchedPath = findBestMatchInDir(targetFolder, filename);
              if (matchedPath) {
                fileToServe = matchedPath;
                break;
              }
            }
          }
          
          // 4. Try recursive exact filename search across all search directories
          if (!fileToServe) {
            for (const baseDir of searchDirs) {
              const matchedPath = findFileRecursively(baseDir, filename);
              if (matchedPath) {
                fileToServe = matchedPath;
                break;
              }
            }
          }
          
          if (fileToServe) {
            console.log(`[localFilesPlugin] Serving ${decodedPath} from local path: ${fileToServe}`);
            const ext = path.extname(fileToServe).toLowerCase();
            let contentType = 'application/octet-stream';
            if (ext === '.pdf') contentType = 'application/pdf';
            else if (ext === '.png') contentType = 'image/png';
            else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
            else if (ext === '.svg') contentType = 'image/svg+xml';
            
            res.writeHead(200, { 'Content-Type': contentType });
            fs.createReadStream(fileToServe).pipe(res);
            return;
          } else {
            console.log(`[localFilesPlugin] File not found locally for: ${decodedPath}`);
          }
        }
        next();
      });
    }
  }
}

// Plugin to handle local API calls (mocking file uploads and property surveys) without Frappe backend
function localMockApiPlugin() {
  return {
    name: 'local-mock-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST') {
          return next();
        }

        // Handle survey saving/submission mock endpoint
        if (req.url.includes('mock_save_property_survey')) {
          const chunks = [];
          req.on('data', chunk => chunks.push(chunk));
          req.on('end', () => {
            try {
              const bodyStr = Buffer.concat(chunks).toString();
              let payload = {};
              try {
                payload = JSON.parse(bodyStr);
              } catch (e) {
                // Try reading standard form URL encoded if not JSON
                const urlParams = new URLSearchParams(bodyStr);
                payload = JSON.parse(urlParams.get('data') || '{}');
              }

              const status = payload.status || 'Draft';
              console.log(`[localMockApiPlugin] Saved Property Survey:`, payload);

              // Write to a local JSON file in public/uploads/surveys.json as a mock DB
              const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
              if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
              const dbFile = path.join(uploadsDir, 'surveys.json');
              let existing = [];
              if (fs.existsSync(dbFile)) {
                try { existing = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch (e) {}
              }
              // Update or append
              const idx = existing.findIndex(s => s.property_id === payload.property_id);
              if (idx !== -1) {
                existing[idx] = { ...existing[idx], ...payload };
              } else {
                existing.push(payload);
              }
              fs.writeFileSync(dbFile, JSON.stringify(existing, null, 2), 'utf8');

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                message: {
                  status: 'success',
                  message: `Survey saved as ${status} successfully!`,
                  name: `SURVEY-${Date.now().toString().slice(-5)}`
                }
              }));
            } catch (err) {
              console.error('[localMockApiPlugin] Survey error:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ message: { error: err.message } }));
            }
          });
          return;
        }

        // Handle upload file mock endpoint
        if (req.url.includes('upload_file')) {
          const chunks = [];
          req.on('data', chunk => chunks.push(chunk));
          req.on('end', () => {
            const buf = Buffer.concat(chunks);
            const contentType = req.headers['content-type'] || '';
            const boundary = contentType.split('boundary=')[1];

            if (!boundary) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ message: { error: 'No boundary' } }));
              return;
            }

            // Parse multipart parts
            const sep = Buffer.from('--' + boundary);
            const parts = [];
            let start = buf.indexOf(sep) + sep.length;
            while (start < buf.length) {
              const end = buf.indexOf(sep, start);
              if (end === -1) break;
              const part = buf.slice(start, end);
              // Skip leading CRLF
              const headerEnd = part.indexOf('\r\n\r\n');
              if (headerEnd === -1) { start = end + sep.length; continue; }
              const headerStr = part.slice(2, headerEnd).toString();
              const body = part.slice(headerEnd + 4, part.length - 2); // trim trailing \r\n
              parts.push({ header: headerStr, body });
              start = end + sep.length;
            }

            // Find the 'file' part
            let filePart = null;
            let originalName = 'upload.bin';
            for (const p of parts) {
              if (p.header.includes('name="file"')) {
                filePart = p;
                const m = p.header.match(/filename="([^"]+)"/);
                if (m) originalName = m[1];
              }
            }

            if (!filePart) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ message: { error: 'No file in upload' } }));
              return;
            }

            // Save to public/uploads/
            const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

            const safeName = Date.now() + '_' + originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
            const destPath = path.join(uploadsDir, safeName);
            fs.writeFileSync(destPath, filePart.body);

            const fileUrl = `/uploads/${safeName}`;
            console.log(`[localMockApiPlugin] Saved uploaded file: ${destPath}`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              message: {
                file_url: fileUrl,
                url: fileUrl,
                file_name: originalName,
                name: safeName
              }
            }));
          });

          req.on('error', (err) => {
            console.error('[localMockApiPlugin] Error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: { error: err.message } }));
          });
          return;
        }

        return next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), localFilesPlugin(), localMockApiPlugin()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        headers: {
          'X-Frappe-Site-Name': 'qgis_reservation.com'
        }
      },
      '/files': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        headers: {
          'X-Frappe-Site-Name': 'qgis_reservation.com'
        }
      },
    },
  },
})

