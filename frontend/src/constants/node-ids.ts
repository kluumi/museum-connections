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
 * Uses crypto.randomUUID for uniqueness.
 *
 * Note: Each page load gets a fresh ID to avoid conflicts when opening
 * multiple tabs (sessionStorage can be inherited when opening links
 * in new tabs via middle-click or Ctrl+click).
 */
export function generateOperatorNodeId(): NodeId {
  const suffix = crypto.randomUUID().slice(0, 8);
  return `operator-${suffix}` as NodeId;
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
