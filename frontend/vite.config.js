import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// base "./" works on any GitHub Pages path (https://<user>.github.io/<repo>/) with hash routing
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Groovy Employees",
        short_name: "Employees",
        description: "Employee records and monthly salary slips for Groovy Business Group",
        theme_color: "#654321",
        background_color: "#FAF7F2",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 20, maxAgeSeconds: 31536000 } },
          },
        ],
      },
    }),
  ],
  // 5174, so it can run side by side with Groovy Kiosk on 5173
  server: { host: true, port: 5174 },
});
