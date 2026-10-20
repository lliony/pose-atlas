import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.API_PROXY_TARGET;
  const proxy = {
    '/api/ai': { target: env.AI_PROXY_TARGET || 'http://127.0.0.1:5175', changeOrigin: false },
    ...(target ? Object.fromEntries(
      ['/api', '/signin-with-chatgpt', '/callback', '/signout-with-chatgpt'].map(path => [path, { target, changeOrigin: false }]),
    ) : {}),
  };
  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5174,
      strictPort: true,
      proxy,
    },
    preview: { host: "127.0.0.1", port: 4174, proxy },
  };
});
