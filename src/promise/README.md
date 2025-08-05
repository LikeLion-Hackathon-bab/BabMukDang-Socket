# Promise Module - NestJS 표준 패턴 리팩토링

이 모듈은 NestJS의 표준 패턴을 따라 리팩토링되었습니다.

## 구조

### Guards (권한 검사)

- **RoomAccessGuard**: 방 접근 권한 확인
- **UserOwnershipGuard**: 사용자 데이터 소유권 확인
- **RoomManagementGuard**: 방 관리 권한 확인

### Interceptors (요청/응답 가로채기)

- **LoggingInterceptor**: 요청/응답 로깅
- **DataOwnershipInterceptor**: 응답 데이터 소유권 검사

### Pipes (파라미터 유효성 검사)

- **UserInfoValidationPipe**: 사용자 정보 유효성 검사
- **RoomIdValidationPipe**: 방 ID 유효성 검사
- **PhaseDataValidationPipe**: 단계 데이터 유효성 검사

### Services (비즈니스 로직)

- **GuardService**: 유틸리티 함수들 (데이터 소유권 검사, 로깅 등)
- **RoomService**: 방 관리 로직
- **ChatService**: 채팅 관리 로직
- **PhaseService**: 단계 관리 로직

## 사용법

### Gateway에서 Guard 사용

```typescript
@SubscribeMessage('chat-message')
@UseGuards(RoomAccessGuard, UserOwnershipGuard)
handleChatMessage(@ConnectedSocket() client: Socket, @MessageBody() payload: ChatMessage) {
  // 권한 검사가 통과된 후 실행됨
}
```

### Gateway에서 Interceptor 사용

```typescript
@WebSocketGateway()
@UseInterceptors(LoggingInterceptor) // 모든 메서드에 로깅 적용
export class MyGateway {
  @SubscribeMessage('update-data')
  @UseInterceptors(DataOwnershipInterceptor) // 특정 메서드에만 적용
  handleUpdateData() {
    // 응답 데이터 소유권 검사 후 반환
  }
}
```

### Gateway에서 Pipe 사용

```typescript
@SubscribeMessage('join-room')
@UsePipes(UserInfoValidationPipe, RoomIdValidationPipe)
handleJoinRoom(@MessageBody() payload: JoinRoomPayload) {
  // 유효성 검사가 통과된 후 실행됨
}
```

## 장점

1. **관심사 분리**: 권한 검사, 유효성 검사, 로깅이 각각 분리됨
2. **재사용성**: Guard, Interceptor, Pipe를 다른 Gateway에서도 재사용 가능
3. **테스트 용이성**: 각 컴포넌트를 독립적으로 테스트 가능
4. **NestJS 표준**: NestJS의 권장 패턴을 따름
5. **타입 안전성**: TypeScript의 타입 체크 활용

## 기존 코드와의 차이점

### Before (기존 GuardService)

```typescript
// 권한 검사를 수동으로 호출
const permissionCheck = this.guardService.canModifyOwnData(
  socketId,
  userId,
  roomService,
);
if (!permissionCheck.allowed) {
  return;
}
```

### After (NestJS 표준 패턴)

```typescript
// 데코레이터로 권한 검사 자동화
@UseGuards(UserOwnershipGuard)
handleMethod() {
  // 권한 검사가 자동으로 실행됨
}
```

## 마이그레이션 가이드

1. **GuardService의 boolean 반환 메서드들** → **Guard 클래스로 변환**
2. **수동 권한 검사 코드** → **@UseGuards 데코레이터 사용**
3. **수동 유효성 검사** → **@UsePipes 데코레이터 사용**
4. **수동 로깅** → **@UseInterceptors 데코레이터 사용**
5. **유틸리티 함수들** → **GuardService에 유지**
