import { defineConfig } from 'vite';

// The public preview sits behind a tunnel, so the host check has to allow it.
export default defineConfig({
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
});
