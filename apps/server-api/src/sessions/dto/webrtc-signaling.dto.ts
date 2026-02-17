import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ---------------------------------------------------------------------------
// REST-based WebRTC signaling DTOs
//
// The web client (Chrome browser) uses REST endpoints instead of Socket.IO
// for SDP offer/answer exchange and ICE candidate trickle. These DTOs
// define the request/response shapes for those endpoints.
// ---------------------------------------------------------------------------

/**
 * SDP offer sent by the web client to initiate WebRTC negotiation.
 * POST /sessions/:id/offer
 */
export class SdpOfferDto {
  @ApiProperty({
    description: 'SDP offer string',
    example: 'v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\n...',
  })
  @IsString()
  @IsNotEmpty()
  sdp!: string;

  @ApiProperty({
    description: 'SDP type (always "offer" for client-initiated)',
    example: 'offer',
  })
  @IsString()
  @IsNotEmpty()
  type!: string;
}

/**
 * SDP answer returned by the host (relayed through the API).
 */
export class SdpAnswerResponseDto {
  @ApiProperty({ description: 'SDP answer string' })
  sdp!: string;

  @ApiProperty({ description: 'SDP type', example: 'answer' })
  type!: string;

  @ApiPropertyOptional({ description: 'Error message if host rejected or timed out' })
  error?: string;
}

/**
 * ICE candidate sent by the web client.
 * POST /sessions/:id/ice-candidate
 */
export class IceCandidateDto {
  @ApiProperty({
    description: 'ICE candidate string',
    example: 'candidate:1 1 UDP 2113929471 192.168.1.5 54321 typ host',
  })
  @IsString()
  @IsNotEmpty()
  candidate!: string;

  @ApiPropertyOptional({ description: 'SDP media ID' })
  @IsOptional()
  @IsString()
  sdpMid?: string | null;

  @ApiPropertyOptional({ description: 'SDP media line index' })
  @IsOptional()
  @IsNumber()
  sdpMLineIndex?: number | null;
}

/**
 * ICE candidate response — may contain host candidates to send back.
 */
export class IceCandidateResponseDto {
  @ApiProperty({ description: 'Whether the candidate was accepted' })
  success!: boolean;

  @ApiPropertyOptional({
    description: 'Remote ICE candidates from the host (if available)',
    type: [IceCandidateDto],
  })
  remoteCandidates?: IceCandidateDto[];
}

/**
 * GET /sessions/:id/ice-candidates — poll for host ICE candidates.
 */
export class IceCandidatesResponseDto {
  @ApiProperty({ description: 'Host ICE candidates', type: [IceCandidateDto] })
  candidates!: IceCandidateDto[];

  @ApiProperty({ description: 'Whether ICE gathering is complete on the host side' })
  gatheringComplete!: boolean;
}
