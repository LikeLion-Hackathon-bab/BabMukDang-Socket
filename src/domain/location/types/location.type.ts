import { Id } from 'src/domain/common/types';
import { LocationCandidateDto } from '../dto/request.dto';

export interface LocationStore {
  candidates: Map<Id, LocationCandidateDto>; // candidateId -> raw
  votes: Map<Id, Set<Id>>; // candidateId -> Set<userId>
  currentSelection?: Id; // candidateId
  maxCandidates: number; // 최대 후보 수
}
