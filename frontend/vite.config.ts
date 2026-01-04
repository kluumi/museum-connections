import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Check if we want HTTPS (for mobile/LAN access) or HTTP (for OBS localhost)
const useHttps = process.env.HTTPS !== "false";

// GitHub Pages base path (repo name)
const base = process.env.GITHUB_ACTIONS ? "/museum-connections/" : "/";

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    // Only use SSL plugin when HTTPS is enabled
    ...(useHttps ? [basicSsl()] : []),
  ],
  server: {
    host: true, // Allow LAN access (0.0.0.0)
    allowedHosts: [".pinggy.link"], // Allow all Pinggy tunnels
  },
  preview: {
    host: true,
  },
  build: {
    target: "ES2024",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
