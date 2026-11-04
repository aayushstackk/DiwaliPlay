/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { KioskDeviceStatus, KioskRemoteAction } from '../../src/types/backend';

// ============================================================================
// WebSocket Message Protocol between TV PC Agent and Cloud Relay
// ============================================================================

export interface KioskAgentHeartbeat {
  type: 'heartbeat';
  deviceId: string;
  timestamp: number;
  status: KioskDeviceStatus;
}

export interface KioskAgentAck {
  type: 'ack';
  requestId: string;
  action: KioskRemoteAction;
  success: boolean;
  status?: KioskDeviceStatus;
  message?: string;
  error?: string;
  timestamp: number;
}

export interface KioskAgentPong {
  type: 'pong';
  timestamp?: number;
}

export type KioskInboundMessage = KioskAgentHeartbeat | KioskAgentAck | KioskAgentPong;

export interface KioskServerCommand {
  type: 'command';
  requestId: string;
  action: KioskRemoteAction;
  params?: {
    passcode?: string;
  };
  timestamp: number;
}

export interface KioskServerHeartbeatAck {
  type: 'heartbeat_ack';
  timestamp: number;
}

export interface KioskServerPing {
  type: 'ping';
  timestamp: number;
}

export type KioskOutboundMessage = KioskServerCommand | KioskServerHeartbeatAck | KioskServerPing;

