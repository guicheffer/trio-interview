import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const base = process.env.VITE_BASE || "/";

// When served under a tunnel path (/preview/<candidate>/<exercise>/), absolute fetch("/api/...") calls
// would hit the interview platform root, so prefix them with the base. Also restore the trailing
// slash the platform proxy strips, which the router basename needs.
const prefixFetchWithBase = {
  name: "prefix-fetch-with-base",
  transformIndexHtml() {
    if (base === "/") return [];
    const prefix = base.replace(/\/$/, "");
    return [
      {
        tag: "script",
        injectTo: "head-prepend" as const,
        children: `(function(){var p=${JSON.stringify(prefix)},f=window.fetch;if(location.pathname===p)history.replaceState(null,"",p+"/"+location.search+location.hash);window.fetch=function(i,o){return f.call(this,typeof i==="string"&&i[0]==="/"&&i.indexOf(p+"/")!==0?p+i:i,o)}})();`,
      },
    ];
  },
};

export default defineConfig({
  base,
  plugins: [react(), prefixFetchWithBase],
  server: {
    port: 5173,
    host: "127.0.0.1",
    // Hot reload travels through the platform preview path; a path that does not end in a slash survives the Next.js proxy
    hmr: { path: "hmr" },
    strictPort: false,
    proxy: {
      "/api": { target: process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : "http://127.0.0.1:3000", changeOrigin: true },
      "/auth": { target: process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
});
