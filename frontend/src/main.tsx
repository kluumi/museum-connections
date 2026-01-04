import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import "./index.css";

// Check if we're deployed on GitHub Pages (set during CI/CD build)
const isGitHubPages = import.meta.env.VITE_GITHUB_PAGES === "true";

// GitHub Pages SPA redirect handling
// When 404.html redirects to index.html, restore the original path
if (isGitHubPages) {
  const ghPagesRedirect = sessionStorage.getItem("gh-pages-redirect");
  if (ghPagesRedirect) {
    sessionStorage.removeItem("gh-pages-redirect");
    // Replace current URL with the original path (without page reload)
    window.history.replaceState(null, "", ghPagesRedirect);
  }
}

// Use base path for GitHub Pages, otherwise no basepath for local dev
const basePath = isGitHubPages
  ? import.meta.env.BASE_URL.replace(/\/$/, "")
  : undefined;
const router = createRouter({ routeTree, basepath: basePath || undefined });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
