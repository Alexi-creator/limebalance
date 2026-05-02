import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @IsUUID()
  userId: string;

  @IsString()
  @MinLength(1)
  name: string;
}
