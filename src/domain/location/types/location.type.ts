import { Id } from 'src/domain/common/types';

export interface LocationStore {
  candidates: Map<Id, LocationCandidate>; // candidateId -> raw
  votes: Map<Id, Set<Id>>; // candidateId -> Set<userId>
  maxCandidates: number; // 최대 후보 수
}

export interface LocationCandidate {
  id: Id;
  placeName: string;
  lat: number;
  lng: number;
  address: string;
}
