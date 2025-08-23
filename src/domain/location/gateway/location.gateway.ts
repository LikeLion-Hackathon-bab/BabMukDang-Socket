import { Injectable } from '@nestjs/common';
import { WsLogger } from 'src/domain/common/logger/ws-logger.service';
import { Socket } from 'socket.io';
import type { UserInfo } from 'src/domain/common/types';
import { LocationCandidateDto, CandidateIdDto } from '../dto/request.dto';
import { WsRoom, WsUser } from 'src/domain/common/websoket.decorator';
import { LocationService } from '../services/location.service';
import { Server } from 'socket.io';

@Injectable()
export class LocationHandlers {
  //   constructor(private readonly locationStore: LocationStore) {}

  constructor(
    private readonly logger: WsLogger,
    private readonly locationService: LocationService,
  ) {}

  // @SubscribeMessage('location-candidate-add')
  // handleLocationCandidateAdd(
  //   @ConnectedSocket() client: Socket,
  //   @MessageBody() payload: LocationCandidateDto,
  // ) {
  // }
  server: Server;

  // ===== 장소 후보 관련 핸들러 =====

  handleAddLocationCandidate(
    client: Socket,
    payload: LocationCandidateDto,
    roomId: string,
    userInfo: UserInfo,
  ) {
    const { placeName, lat, lng, address } = payload;

    this.locationService.addCandidate({
      roomId,
      placeName,
      lat,
      lng,
      address,
      userId: userInfo.userId,
    });

    this.logger.log(`Location candidate added in room ${roomId}: ${placeName}`);

    const responseDto: LocationCandidateDto[] =
      this.locationService.getCandidates(roomId);
    this.server.to(roomId).emit('location-candidate-added', responseDto);
  }
  handleRemoveLocationCandidate(
    client: Socket,
    payload: CandidateIdDto,
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    const { candidateId } = payload;

    // TODO: Implement removeLocationCandidate method in RoomStoreService
    this.logger.log(
      `Location candidate ${candidateId} removed by user ${userInfo.userId} in room ${roomId}`,
    );
    const responseDto: LocationCandidateDto[] =
      this.locationService.getCandidates(roomId);

    // 다른 참여자들에게 후보 제거 알림
    this.server.to(roomId).emit('location-candidate-removed', responseDto);
  }

  handleVoteLocation(
    client: Socket,
    payload: CandidateIdDto,
    roomId: string,
    userInfo: UserInfo,
  ) {
    const { candidateId } = payload;

    this.locationService.voteCandidate(roomId, candidateId, userInfo.userId);
    this.logger.log(
      `User ${userInfo.username} voted for location ${candidateId} in room ${roomId}`,
    );

    const candidates: LocationCandidateDto[] =
      this.locationService.getCandidates(roomId);

    const voteState = this.locationService.getSerializedVoteStates(roomId);
    const responseDto = {
      candidates,
      voteState,
    };

    // 다른 참여자들에게 투표 결과 알림
    this.server.to(roomId).emit('location-vote-updated', responseDto);
  }
}
