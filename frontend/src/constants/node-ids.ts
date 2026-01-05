// Type-safe node identifiers matching the hub-and-spoke architecture

export const NodeId = {
  // Senders (dashboards)
  NANTES: "nantes",
  PARIS: "paris",

  // Receivers (OBS sources)
  OBS_NANTES: "obs_nantes",
  OBS_PARIS: "obs_paris",

  // Monitoring (base ID - actual instances use operator-{uuid})
  OPERATOR: "operator",
} as const;

// Base NodeId type from constants
type BaseNodeId = (typeof NodeId)[keyof typeof NodeId];

// NodeId can be a base ID or a dynamic operator instance ID (operator-{suffix})
export type NodeId = BaseNodeId | `operator-${string}`;

/**
 * Generate a unique operator node ID for this browser tab.
 *
 * Uses sessionStorage to preserve the ID across page refreshes (avoiding 30s
 * reconnection delays), while still generating a new ID for truly new tabs.
 *
 * Detection logic:
 * - If sessionStorage has an ID that was set in this exact page lifecycle
 *   (within 100ms), it's a duplicate tab via middle-click → generate new ID
 * - Otherwise, reuse the existing ID (page refresh) or create new one (first visit)
 */
export function generateOperatorNodeId(): NodeId {
  const STORAGE_KEY = "operator_node_id";
  const TIMESTAMP_KEY = "operator_node_id_ts";

  const existingId = sessionStorage.getItem(STORAGE_KEY);
  const existingTimestamp = sessionStorage.getItem(TIMESTAMP_KEY);
  const now = Date.now();

  // Check if this might be a duplicated tab (sessionStorage inherited)
  // If the timestamp was set very recently (< 100ms), it's likely a new tab
  // that inherited sessionStorage from Ctrl+click / middle-click
  const isDuplicateTab =
    existingTimestamp && now - Number.parseInt(existingTimestamp, 10) < 100;

  if (existingId && !isDuplicateTab) {
    // Reuse existing ID (page refresh scenario)
    // Update timestamp to mark this page as "active"
    sessionStorage.setItem(TIMESTAMP_KEY, String(now));
    return existingId as NodeId;
  }

  // Generate new ID (first visit or duplicate tab)
  const suffix = crypto.randomUUID().slice(0, 8);
  const newId = `operator-${suffix}` as NodeId;

  sessionStorage.setItem(STORAGE_KEY, newId);
  sessionStorage.setItem(TIMESTAMP_KEY, String(now));

  return newId;
}

/**
 * Check if a node ID is an operator instance (operator or operator-{suffix})
 */
export function isOperatorNode(nodeId: string): boolean {
  return nodeId === NodeId.OPERATOR || nodeId.startsWith("operator-");
}

// Sender nodes (produce streams)
export const SENDER_NODES = [NodeId.NANTES, NodeId.PARIS] as const;
export type SenderNodeId = (typeof SENDER_NODES)[number];

// Receiver nodes (consume streams)
export const RECEIVER_NODES = [NodeId.OBS_NANTES, NodeId.OBS_PARIS] as const;
export type ReceiverNodeId = (typeof RECEIVER_NODES)[number];

// Node routing configuration
export const NODE_TARGETS: Record<SenderNodeId, readonly NodeId[]> = {
  [NodeId.NANTES]: [NodeId.OBS_PARIS, NodeId.OPERATOR],
  [NodeId.PARIS]: [NodeId.OBS_NANTES, NodeId.OPERATOR],
} as const;

export const NODE_PRIMARY_TARGET: Record<SenderNodeId, ReceiverNodeId> = {
  [NodeId.NANTES]: NodeId.OBS_PARIS,
  [NodeId.PARIS]: NodeId.OBS_NANTES,
} as const;

// Receiver source configuration
export const RECEIVER_SOURCE: Record<ReceiverNodeId, SenderNodeId> = {
  [NodeId.OBS_NANTES]: NodeId.PARIS,
  [NodeId.OBS_PARIS]: NodeId.NANTES,
} as const;

// Display names (French) - base node IDs only
const BASE_DISPLAY_NAMES: Record<BaseNodeId, string> = {
  [NodeId.NANTES]: "Nantes",
  [NodeId.PARIS]: "Paris",
  [NodeId.OBS_NANTES]: "OBS Nantes",
  [NodeId.OBS_PARIS]: "OBS Paris",
  [NodeId.OPERATOR]: "Opérateur",
} as const;

/**
 * Get display name for a node ID.
 * Handles dynamic operator IDs (operator-xxx -> "Opérateur")
 */
export function getNodeDisplayName(nodeId: NodeId | string): string {
  // Check base names first
  if (nodeId in BASE_DISPLAY_NAMES) {
    return BASE_DISPLAY_NAMES[nodeId as BaseNodeId];
  }
  // Dynamic operator instances
  if (isOperatorNode(nodeId)) {
    return "Opérateur";
  }
  return nodeId;
}

// Legacy export for backwards compatibility (only base IDs)
export const NODE_DISPLAY_NAMES = BASE_DISPLAY_NAMES;

// Helper functions
export function isSenderNode(nodeId: string): nodeId is SenderNodeId {
  return SENDER_NODES.includes(nodeId as SenderNodeId);
}

export function isReceiverNode(nodeId: string): nodeId is ReceiverNodeId {
  return RECEIVER_NODES.includes(nodeId as ReceiverNodeId);
}

export function isValidNodeId(nodeId: string): nodeId is NodeId {
  // Check static node IDs
  if (Object.values(NodeId).includes(nodeId as BaseNodeId)) {
    return true;
  }
  // Check dynamic operator IDs
  return isOperatorNode(nodeId);
}
