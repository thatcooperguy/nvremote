import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { SignalingGatewayWs } from '../signaling/signaling.gateway';
import {
  SdpOfferDto,
  SdpAnswerResponseDto,
  IceCandidateDto,
  IceCandidatesResponseDto,
} from './dto/webrtc-signaling.dto';

// ---------------------------------------------------------------------------
// WebRTC Relay Service
//
// Manages REST-based WebRTC signaling for web clients. The browser client
// cannot use Socket.IO (it uses native RTCPeerConnection), so we provide
// REST endpoints for SDP offer/answer exchange and ICE candidate trickle.
//
// Flow:
//   1. Web client creates SDP offer, POSTs to /sessions/:id/offer
//   2. Server relays offer to host via Socket.IO, waits for answer
//   3. Server returns SDP answer to web client
//   4. Web client trickles ICE candidates via POST /sessions/:id/ice-candidate
//   5. Web client polls GET /sessions/:id/ice-candidates for host candidates
// ---------------------------------------------------------------------------

interface PendingOffer {
  sessionId: string;
  userId: string;
  sdp: string;
  type: string;
  createdAt: number;
  answerResolve?: (answer: SdpAnswerResponseDto) => void;
}

interface SessionIceState {
  /** ICE candidates sent by the web client (to be relayed to host) */
  clientCandidates: IceCandidateDto[];
  /** ICE candidates received from the host (to be sent to web client on poll) */
  hostCandidates: IceCandidateDto[];
  /** Whether the host has finished ICE gathering */
  hostGatheringComplete: boolean;
  /** Track which host candidates the client has already retrieved */
  lastPolledIndex: number;
}

@Injectable()
export class WebRtcRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebRtcRelayService.name);

  /**
   * Pending SDP offers waiting for answers. Keyed by sessionId.
   * Auto-cleaned after 30 seconds.
   */
  private pendingOffers = new Map<string, PendingOffer>();

  /**
   * Per-session ICE candidate buffers. Keyed by sessionId.
   * Auto-cleaned when session ends or after 5 minutes of inactivity.
   */
  private iceStates = new Map<string, SessionIceState>();

  /** Cleanup interval */
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly signaling: SignalingGatewayWs,
  ) {
    // Clean up stale state every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  /**
   * Register relay callbacks with the signaling gateway so it can forward
   * host SDP answers and ICE candidates to this service.
   */
  onModuleInit(): void {
    this.signaling.registerWebRtcRelayCallbacks({
      onAnswer: (sessionId, sdp, type) =>
        this.resolveAnswer(sessionId, sdp, type),
      onHostCandidate: (sessionId, candidate) =>
        this.addHostCandidate(sessionId, candidate),
      onHostGatheringComplete: (sessionId) =>
        this.setHostGatheringComplete(sessionId),
    });
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
  }

  // -----------------------------------------------------------------------
  // SDP Offer/Answer
  // -----------------------------------------------------------------------

  /**
   * Handle an SDP offer from a web client.
   *
   * Relays the offer to the host via Socket.IO and waits up to 15 seconds
   * for an SDP answer. If the host doesn't respond, returns an error.
   */
  async handleOffer(
    sessionId: string,
    userId: string,
    dto: SdpOfferDto,
  ): Promise<SdpAnswerResponseDto> {
    // Validate session ownership
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('Not your session');
    }

    if (session.status === 'ENDED') {
      throw new BadRequestException('Session has ended');
    }

    // Initialize ICE state for this session
    if (!this.iceStates.has(sessionId)) {
      this.iceStates.set(sessionId, {
        clientCandidates: [],
        hostCandidates: [],
        hostGatheringComplete: false,
        lastPolledIndex: 0,
      });
    }

    // Create a promise that will be resolved when the host sends an answer
    const answerPromise = new Promise<SdpAnswerResponseDto>((resolve) => {
      this.pendingOffers.set(sessionId, {
        sessionId,
        userId,
        sdp: dto.sdp,
        type: dto.type,
        createdAt: Date.now(),
        answerResolve: resolve,
      });
    });

    // Relay the offer to the host via Socket.IO signaling
    this.signaling.relayWebClientOffer(session.hostId, {
      sessionId,
      sdp: dto.sdp,
      type: dto.type,
    });

    this.logger.log(`SDP offer relayed for session ${sessionId}`);

    // Wait for answer with timeout
    const timeoutPromise = new Promise<SdpAnswerResponseDto>((resolve) => {
      setTimeout(() => {
        resolve({
          sdp: '',
          type: 'answer',
          error: 'Host did not respond within 15 seconds',
        });
      }, 15_000);
    });

    const answer = await Promise.race([answerPromise, timeoutPromise]);

    // Clean up pending offer
    this.pendingOffers.delete(sessionId);

    return answer;
  }

  /**
   * Called by the signaling gateway when the host sends an SDP answer
   * in response to a web client's offer.
   */
  resolveAnswer(sessionId: string, sdp: string, type: string): void {
    const pending = this.pendingOffers.get(sessionId);
    if (pending?.answerResolve) {
      pending.answerResolve({ sdp, type });
      this.pendingOffers.delete(sessionId);
      this.logger.log(`SDP answer resolved for session ${sessionId}`);
    } else {
      this.logger.warn(
        `Received SDP answer for session ${sessionId} but no pending offer found`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // ICE Candidates
  // -----------------------------------------------------------------------

  /**
   * Accept an ICE candidate from the web client and relay to the host.
   */
  async addClientCandidate(
    sessionId: string,
    userId: string,
    dto: IceCandidateDto,
  ): Promise<{ success: boolean }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('Not your session');
    }

    // Store the candidate
    const iceState = this.getOrCreateIceState(sessionId);
    iceState.clientCandidates.push(dto);

    // Relay to the host via Socket.IO
    this.signaling.relayWebClientIceCandidate(session.hostId, {
      sessionId,
      candidate: {
        candidate: dto.candidate,
        sdpMid: dto.sdpMid ?? null,
        sdpMLineIndex: dto.sdpMLineIndex ?? null,
      },
    });

    return { success: true };
  }

  /**
   * Called by the signaling gateway when the host sends an ICE candidate
   * for a web client session.
   */
  addHostCandidate(sessionId: string, candidate: IceCandidateDto): void {
    const iceState = this.getOrCreateIceState(sessionId);
    iceState.hostCandidates.push(candidate);
  }

  /**
   * Called when the host signals ICE gathering complete.
   */
  setHostGatheringComplete(sessionId: string): void {
    const iceState = this.iceStates.get(sessionId);
    if (iceState) {
      iceState.hostGatheringComplete = true;
    }
  }

  /**
   * Poll for host ICE candidates (called by the web client).
   * Returns only candidates not yet seen by this client.
   */
  async getHostCandidates(
    sessionId: string,
    userId: string,
  ): Promise<IceCandidatesResponseDto> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('Not your session');
    }

    const iceState = this.iceStates.get(sessionId);
    if (!iceState) {
      return { candidates: [], gatheringComplete: false };
    }

    // Return only new candidates since last poll
    const newCandidates = iceState.hostCandidates.slice(
      iceState.lastPolledIndex,
    );
    iceState.lastPolledIndex = iceState.hostCandidates.length;

    return {
      candidates: newCandidates,
      gatheringComplete: iceState.hostGatheringComplete,
    };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private getOrCreateIceState(sessionId: string): SessionIceState {
    let state = this.iceStates.get(sessionId);
    if (!state) {
      state = {
        clientCandidates: [],
        hostCandidates: [],
        hostGatheringComplete: false,
        lastPolledIndex: 0,
      };
      this.iceStates.set(sessionId, state);
    }
    return state;
  }

  /**
   * Clean up session state when a session ends.
   */
  cleanupSession(sessionId: string): void {
    this.pendingOffers.delete(sessionId);
    this.iceStates.delete(sessionId);
  }

  /**
   * Periodic cleanup of stale state.
   */
  private cleanup(): void {
    const now = Date.now();
    const OFFER_TTL = 30_000; // 30 seconds
    const ICE_TTL = 300_000; // 5 minutes

    // Clean stale pending offers
    for (const [id, offer] of this.pendingOffers) {
      if (now - offer.createdAt > OFFER_TTL) {
        if (offer.answerResolve) {
          offer.answerResolve({
            sdp: '',
            type: 'answer',
            error: 'Offer expired',
          });
        }
        this.pendingOffers.delete(id);
      }
    }

    // Limit ICE state entries (prevent unbounded growth)
    if (this.iceStates.size > 1000) {
      const entries = [...this.iceStates.entries()];
      // Remove oldest half
      const toRemove = entries.slice(0, entries.length - 500);
      for (const [id] of toRemove) {
        this.iceStates.delete(id);
      }
      this.logger.warn(
        `Cleaned ${toRemove.length} stale ICE state entries`,
      );
    }
  }
}
