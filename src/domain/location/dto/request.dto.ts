import { IsString, IsNotEmpty, IsNumber } from 'class-validator';
import { LocationCandidate } from '../types/location.type';
export class LocationCandidateDto implements LocationCandidate {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  placeName: string;

  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;

  @IsString()
  address: string;
}

export class CandidateIdDto {
  @IsString()
  @IsNotEmpty()
  candidateId: string;
}

export class CandidateRemoveDto extends CandidateIdDto {}
export class CandidateVoteDto extends CandidateIdDto {}
export class CandidateUnvoteDto extends CandidateIdDto {}
export class CandidateSelectDto extends CandidateIdDto {}
export class CandidateUnselectDto extends CandidateIdDto {}
