# 0 · Environment

Result column: P / F / B / S (see README). Fill in as you go.

| Id | Do | Expect | Result |
|---|---|---|---|
| 0.01 | Start the API (`PORT=3100 CORS_ORIGINS=http://localhost:3001 npx tsx watch src/server.ts` in `apps/api`) | log says listening on 3100, no error | |
| 0.02 | Open `http://localhost:3100/api/health` | an ok / healthy reply | |
| 0.03 | Start the web app (`NEXT_PUBLIC_API_BASE_URL=http://localhost:3100/api npx next dev -p 3001` in `apps/web`) | ready on 3001 | |
| 0.04 | Open `http://localhost:3001` | sent to the login page | |
| 0.05 | Run `seed:sample-sales` without `--apply` | prints what it would do; "already there" if the sample is in | |
| 0.06 | Run both automated suites (README) | all pass | |
