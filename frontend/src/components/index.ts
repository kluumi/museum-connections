// Barrel export for all components
// Provides organized access to component modules

// Dashboard components (sender dashboards)
export * from "./dashboard";

// Home page components
export * from "./home";

// Operator dashboard components
export * from "./operator";

// Receiver components (OBS fullscreen)
export * from "./receiver";

// Shared/common components
export * from "./shared";

// Theme components
export * from "./theme";

// Note: UI components (shadcn/ui) are imported directly from @/components/ui/*
// They are not re-exported here to avoid naming conflicts and keep bundle size small
