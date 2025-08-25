import { IsNotEmpty, IsString } from 'class-validator';

export class ExcludeMenuDto {
  @IsString()
  @IsNotEmpty()
  code: string;
  @IsString()
  @IsNotEmpty()
  label: string;
}

export class ExcludeMenuAddDto extends ExcludeMenuDto {}
export class ExcludeMenuRemoveDto extends ExcludeMenuDto {}

export class SetUserExclusionsDto {
  @IsNotEmpty()
  @IsString()
  exclusionCategorieId: string;
}
