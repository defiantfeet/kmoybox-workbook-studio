import http from 'node:http';

const upstream = new URL(process.env.STUDIO_AUTH_TEST_SUPABASE ?? 'http://127.0.0.1:55431');
if (upstream.protocol !== 'http:' || upstream.hostname !== '127.0.0.1') throw new Error('Use a loopback test database gateway.');
let failJournalRead = false;

http.createServer(async (request, response) => {
  if (request.url === '/__test/journal' && request.method === 'POST') {
    try {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 100) return response.writeHead(413).end();
      }
      const { fail } = JSON.parse(body);
      if (typeof fail !== 'boolean') return response.writeHead(400).end();
      failJournalRead = fail;
      return response.writeHead(204).end();
    } catch {
      return response.writeHead(400).end();
    }
  }
  if (failJournalRead && request.method === 'GET' && request.url.startsWith('/rest/v1/journal_entries?')) {
    return response.writeHead(503, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ code: 'synthetic_read_failure', message: 'Simulated journal outage.' }));
  }
  const forwarded = http.request({
    hostname: upstream.hostname, port: upstream.port, path: request.url,
    method: request.method, headers: { ...request.headers, host: upstream.host },
  }, result => {
    response.writeHead(result.statusCode, result.headers);
    result.pipe(response);
  });
  forwarded.on('error', () => response.writeHead(502).end());
  request.pipe(forwarded);
}).listen(55436, '127.0.0.1');
