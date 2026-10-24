import dotenv from 'dotenv';
dotenv.config({ override: true });

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure execution under tsx loader for TypeScript and ESM resolution support
const isTsxRunning =
  process.execArgv.some((arg) => arg.includes('tsx')) ||
  process.argv.some((arg) => arg.includes('tsx')) ||
  Boolean(process.env.npm_lifecycle_script?.includes('tsx')) ||
  process.env.__TSX_BOOTSTRAPPED__ === '1';

if (!isTsxRunning) {
  process.env.__TSX_BOOTSTRAPPED__ = '1';
  const tsxBin = path.resolve(__dirname, 'node_modules/.bin/tsx');
  const child = spawn(tsxBin, [__filename, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
} else {
  startAppServer().catch((err) => {
    console.error('[Server] Fatal server startup error:', err);
    process.exit(1);
  });
}

async function startAppServer() {
  if (process.env.NODE_ENV !== 'test' && !process.env.JWT_SECRET) {
    console.error('[FATAL] JWT_SECRET environment variable is required to start the server. Please set JWT_SECRET in your .env file.');
    process.exit(1);
  }
  const fs = await import('fs');
  const express = (await import('express')).default;
  const { createServer: createViteServer } = await import('vite');
  const apiRouter = (await import('./server/routes/api')).default;
  const { initAzureSql } = await import('./server/db/azureSql');

  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API router
  app.use('/api', apiRouter);

  // Establish live Azure SQL Database connection pool asynchronously so port 3000 binds immediately
  initAzureSql().catch((err: any) => {
    console.warn('[Server] Notice: Azure SQL init attempt:', err?.message || err);
  });

  if (!isProd) {
    // Development mode: Vite dev server middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Serve transformed index.html for SPA page navigation in dev mode
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        if (fs.existsSync(indexPath)) {
          let template = fs.readFileSync(indexPath, 'utf-8');
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } else {
          next();
        }
      } catch (e: any) {
        if (vite) {
          vite.ssrFixStacktrace(e);
        }
        next(e);
      }
    });
  } else {
    // Production static bundle serving
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Device Doctor India CRM server running on http://0.0.0.0:${PORT}`);
  });
}
