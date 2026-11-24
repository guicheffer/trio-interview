# Web app exercise template

Copy `vite.config.ts` into the exercise's `codebase/` when the exercise serves a Vite app. It makes the app work inside the platform preview (`/preview/<candidate>/<exercise>/`) on localhost and on a tunnel:

- `base` comes from `VITE_BASE`, which the platform sets for every terminal.
- absolute `fetch("/api/...")` calls are prefixed with the base and the trailing slash the proxy strips is restored.
- the dev server listens on 5173 and proxies `/api` to `PORT`, which the platform sets from `run.serverPort` in `exercise.json`.

Also set the router basename: `<BrowserRouter basename={import.meta.env.BASE_URL}>`.

Then in the `run` section of `exercise.json` set `port: 5173`, a `serverPort` of 3002 or higher (not 3000 or 3001) and `install` with the command that installs dependencies, so `make start` installs them before the interview.

Use this `tsconfig.json` as the starting point (the one in `exercises/vehicle-rental/codebase/`): `src` as the only include, `moduleResolution: bundler`, `isolatedModules`, `noEmit`, `types: ["vite/client", "node"]`. `tsconfig.server.json` extends it with `NodeNext` for `src/server`.
