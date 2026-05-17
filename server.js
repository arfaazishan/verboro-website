import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(root, '.env');

if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

const port = Number(process.env.PORT || 3000);
const publicFiles = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
]);

const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'CONTACT_TO'];
const missingConfig = () => required.filter((key) => !process.env[key]);

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}[char]));

const readBody = (request) => new Promise((resolve, reject) => {
  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
    if (body.length > 25_000) {
      reject(new Error('Request body is too large.'));
      request.destroy();
    }
  });
  request.on('end', () => resolve(body));
  request.on('error', reject);
});

const smtpRead = (socket) => new Promise((resolve, reject) => {
  let data = '';
  const onData = (chunk) => {
    data += chunk.toString('utf8');
    const lines = data.split(/\r?\n/).filter(Boolean);
    const last = lines.at(-1);
    if (last && /^\d{3} /.test(last)) {
      socket.off('data', onData);
      socket.off('error', onError);
      resolve(data);
    }
  };
  const onError = (error) => {
    socket.off('data', onData);
    reject(error);
  };
  socket.on('data', onData);
  socket.on('error', onError);
});

const smtpCommand = async (socket, command, expected = /^[23]/) => {
  if (command) socket.write(`${command}\r\n`);
  const response = await smtpRead(socket);
  if (!expected.test(response)) {
    throw new Error(`SMTP command failed: ${response.trim()}`);
  }
  return response;
};

const connectSmtp = () => new Promise((resolve, reject) => {
  const host = process.env.SMTP_HOST;
  const portNumber = Number(process.env.SMTP_PORT);
  const secure = process.env.SMTP_SECURE !== 'false';
  const socket = secure ? tls.connect(portNumber, host, { servername: host }) : net.connect(portNumber, host);
  socket.once('connect', () => resolve(socket));
  socket.once('secureConnect', () => resolve(socket));
  socket.once('error', reject);
});

const sendMail = async ({ name, email, message }) => {
  let socket = await connectSmtp();
  await smtpCommand(socket, null, /^220/);
  const ehloHost = process.env.SMTP_EHLO_HOST || 'verboro.com';
  const greeting = await smtpCommand(socket, `EHLO ${ehloHost}`);

  if (process.env.SMTP_SECURE === 'false' && /STARTTLS/i.test(greeting)) {
    await smtpCommand(socket, 'STARTTLS', /^220/);
    socket = tls.connect({ socket, servername: process.env.SMTP_HOST });
    await new Promise((resolve, reject) => {
      socket.once('secureConnect', resolve);
      socket.once('error', reject);
    });
    await smtpCommand(socket, `EHLO ${ehloHost}`);
  }

  await smtpCommand(socket, 'AUTH LOGIN', /^334/);
  await smtpCommand(socket, Buffer.from(process.env.SMTP_USER).toString('base64'), /^334/);
  await smtpCommand(socket, Buffer.from(process.env.SMTP_PASS).toString('base64'), /^235/);

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const to = process.env.CONTACT_TO;
  const subject = `New Verboro consultation request from ${name}`;
  const text = `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`;
  const html = `<p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Message:</strong></p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;
  const messageContent = [
    `From: Verboro Website <${from}>`,
    `To: ${to}`,
    `Reply-To: ${email}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="verboro-contact"',
    '',
    '--verboro-contact',
    'Content-Type: text/plain; charset=utf-8',
    '',
    text,
    '',
    '--verboro-contact',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    '',
    '--verboro-contact--',
  ].join('\r\n');
  const raw = `${messageContent.replace(/^\./gm, '..')}\r\n.`;

  await smtpCommand(socket, `MAIL FROM:<${from}>`);
  await smtpCommand(socket, `RCPT TO:<${to}>`);
  await smtpCommand(socket, 'DATA', /^354/);
  await smtpCommand(socket, raw);
  await smtpCommand(socket, 'QUIT');
  socket.end();
};

const sendJson = (response, status, payload) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
};

const serveFile = (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(root, requestedPath));

  if (!filePath.startsWith(root) || path.basename(filePath).startsWith('.')) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, { 'Content-Type': publicFiles.get(path.extname(filePath)) || 'application/octet-stream' });
    response.end(contents);
  });
};

const server = http.createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/api/contact') {
    try {
      const { name, email, message } = JSON.parse(await readBody(request));
      if (!name || !email || !message || !/^\S+@\S+\.\S+$/.test(email)) {
        sendJson(response, 400, { error: 'A valid name, email, and message are required.' });
        return;
      }

      const missing = missingConfig();
      if (missing.length > 0) {
        console.error(`Contact form email is not configured. Missing: ${missing.join(', ')}`);
        sendJson(response, 500, { error: 'Contact form email is not configured.' });
        return;
      }

      await sendMail({ name, email, message });
      sendJson(response, 200, { ok: true });
    } catch (error) {
      console.error(error);
      sendJson(response, 500, { error: 'Unable to send message.' });
    }
    return;
  }

  if (request.method === 'GET') {
    serveFile(request, response);
    return;
  }

  response.writeHead(405);
  response.end('Method not allowed');
});

server.listen(port, () => {
  console.log(`Verboro site running at http://localhost:${port}`);
});
