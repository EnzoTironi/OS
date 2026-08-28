# conversation

Zoen conversation is an [eve](https://eve.dev) agent. Callers talk to it on the HTTP eve channel.

## Run locally

You need Node 24. From this directory:

```bash
npm install
eve dev --no-ui
```

`eve dev` sets `EVE_DEV=1`, so `localDev()` accepts requests. The default port is 2000.

Start a session:

```bash
curl -X POST http://127.0.0.1:2000/eve/v1/session \
  -H 'content-type: application/json' \
  -d '{"message":"oi"}'
```

Stream events:

```bash
curl http://127.0.0.1:2000/eve/v1/session/<sessionId>/stream
```

Assistant text arrives on `message.appended` and `message.completed`. Health is public at `GET /eve/v1/health`. Session routes are not.

Edit `agent/instructions.md` for voice. Edit `agent/agent.ts` for the model.

The model is a direct OpenAI-compatible `LanguageModel`. Set `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `ZOEN_MODEL` in the process environment. Do not commit those values.

## Self-host on Fly

Build the Nitro server, then start it:

```bash
eve build
eve start --host 0.0.0.0
```

`eve start` does not set `EVE_DEV`. `localDev()` skips. Session routes return 401 until you replace `placeholderAuth()` with a real `AuthFn`. Health stays public:

```bash
curl http://127.0.0.1:3000/eve/v1/health
```

Fly is the host. Workflow world stays the eve default in this app. Postgres world comes later. Do not set `experimental.workflow.world` here yet.

Forward `/eve/` and `/.well-known/workflow/` through the proxy. Do not rewrite those paths.

See [Self-host eve](https://eve.dev/docs/guides/deployment/self-hosting) for storage, sandbox, and proxy notes. The same page lives at `node_modules/eve/docs/guides/deployment/self-hosting.md` after `npm install`.

## Learn more

- [eve documentation](https://eve.dev/docs)
- [eve on GitHub](https://github.com/vercel/eve)
