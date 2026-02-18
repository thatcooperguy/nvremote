/**
 * Host agent module — barrel export.
 *
 * Import everything from here:
 *   import { HostAgent, type HostAgentConfig } from './host';
 */

export { HostAgent } from './host-agent';
export type {
  HostAgentConfig,
  HostAgentState,
  HostAgentStatus,
  StreamerInfo,
  SessionStats,
  RegistrationResponse,
  HostConfig,
} from './host-agent';
