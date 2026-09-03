#!/usr/bin/env node
import http from "node:http";
const port = Number(process.env.MOCK_PORT ?? 8787);
const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/v1/chat")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [
          { message: { content: '{"verdict":"unverified","confidence":0.5}' } },
        ],
      }),
    );
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, mock: true }));
});
server.listen(port, () => console.log(`mock listening on ${port}`));
