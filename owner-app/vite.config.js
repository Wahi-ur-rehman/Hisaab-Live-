import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      {
        name: 'inject-sw-env',
        closeBundle() {
          const swSrc = path.resolve(__dirname, 'public/firebase-messaging-sw.js');
          const swDest = path.resolve(__dirname, 'dist/firebase-messaging-sw.js');
          if (!fs.existsSync(swSrc)) return;
          let sw = fs.readFileSync(swSrc, 'utf-8');
          sw = sw
            .replace(/__FIREBASE_API_KEY__/g, JSON.stringify(env.VITE_FIREBASE_API_KEY || ''))
            .replace(/__FIREBASE_AUTH_DOMAIN__/g, JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN || ''))
            .replace(/__FIREBASE_PROJECT_ID__/g, JSON.stringify(env.VITE_FIREBASE_PROJECT_ID || ''))
            .replace(/__FIREBASE_SENDER_ID__/g, JSON.stringify(env.VITE_FIREBASE_MESSAGING_SENDER_ID || ''))
            .replace(/__FIREBASE_APP_ID__/g, JSON.stringify(env.VITE_FIREBASE_APP_ID || ''));
          fs.mkdirSync(path.dirname(swDest), { recursive: true });
          fs.writeFileSync(swDest, sw, 'utf-8');
        },
      },
    ],
    define: {
      __FIREBASE_API_KEY__: JSON.stringify(env.VITE_FIREBASE_API_KEY || ''),
      __FIREBASE_SENDER_ID__: JSON.stringify(env.VITE_FIREBASE_MESSAGING_SENDER_ID || ''),
      __FIREBASE_APP_ID__: JSON.stringify(env.VITE_FIREBASE_APP_ID || ''),
      __FIREBASE_AUTH_DOMAIN__: JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN || ''),
      __FIREBASE_PROJECT_ID__: JSON.stringify(env.VITE_FIREBASE_PROJECT_ID || ''),
    },
    build: { outDir: 'dist' },
  };
});
