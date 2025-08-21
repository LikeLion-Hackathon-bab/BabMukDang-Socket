import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { BaseClientDto } from 'src/promise/dto/client-to-server.dto';

export class LocationCandidateDto {
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

  @IsOptional()
  @IsString()
  address?: string;
}

export class CandidateIdDto extends BaseClientDto {
  @IsString()
  @IsNotEmpty()
  candidateId: string;
}

export class CandidateRemoveDto extends CandidateIdDto {}
export class CandidateVoteDto extends CandidateIdDto {}
export class CandidateUnvoteDto extends CandidateIdDto {}
export class CandidateSelectDto extends CandidateIdDto {}
export class CandidateUnselectDto extends CandidateIdDto {}
