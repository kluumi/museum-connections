// Connection slice - manages signaling and WebRTC connection state
// Pattern: Zustand slice for modular state management

import type { StateCreator } from "zustand";
import { type ConnectionState, type NodeId, SignalingState } from "@/constants";

export interface ConnectionSlice {
  // Signaling state
  nodeId: NodeId | null;
  signalingState: SignalingState;
  connectedPeers: NodeId[];

  // WebRTC connection states (per peer)
  peerConnectionStates: Map<NodeId, ConnectionState>;

  // Actions
  setNodeId: (nodeId: NodeId) => void;
  setSignalingState: (state: SignalingState) => void;
  addConnectedPeer: (peerId: NodeId) => void;
  removeConnectedPeer: (peerId: NodeId) => void;
  setConnectedPeers: (peers: NodeId[]) => void;
  setPeerConnectionState: (peerId: NodeId, state: ConnectionState) => void;
  removePeerConnectionState: (peerId: NodeId) => void;
  reset: () => void;
}

const initialState = {
  nodeId: null as NodeId | null,
  signalingState: SignalingState.DISCONNECTED,
  connectedPeers: [] as NodeId[],
  peerConnectionStates: new Map<NodeId, ConnectionState>(),
};

export const createConnectionSlice: StateCreator<
  ConnectionSlice,
  [],
  [],
  ConnectionSlice
> = (set) => ({
  ...initialState,

  setNodeId: (nodeId) => set({ nodeId }),

  setSignalingState: (signalingState) => set({ signalingState }),

  addConnectedPeer: (peerId) =>
    set((state) => ({
      connectedPeers: state.connectedPeers.includes(peerId)
        ? state.connectedPeers
        : [...state.connectedPeers, peerId],
    })),

  removeConnectedPeer: (peerId) =>
    set((state) => ({
      connectedPeers: state.connectedPeers.filter((id) => id !== peerId),
    })),

  setConnectedPeers: (peers) => set({ connectedPeers: peers }),

  setPeerConnectionState: (peerId, connectionState) =>
    set((state) => {
      const newMap = new Map(state.peerConnectionStates);
      newMap.set(peerId, connectionState);
      return { peerConnectionStates: newMap };
    }),

  removePeerConnectionState: (peerId) =>
    set((state) => {
      const newMap = new Map(state.peerConnectionStates);
      newMap.delete(peerId);
      return { peerConnectionStates: newMap };
    }),

  reset: () => set(initialState),
});
