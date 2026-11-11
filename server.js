// Tiny dependency-free static server for the frontend: `npm start` -> http://localhost:5173
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 5173;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };

http
  .createServer((req, res) => {
    const name = req.url.split('?')[0] === '/' ? 'index.html' : path.basename(req.url.split('?')[0]);
    const file = path.join(__dirname, name);
    fs.readFile(file, (err, data) => {
      if (err || !TYPES[path.extname(file)]) {
        res.writeHead(404);
        return res.end('Not found');
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Frontend running on http://localhost:${PORT}`));
