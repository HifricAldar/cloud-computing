import { IsNumber, IsString } from 'class-validator';

export class AnalyzeFoodSaveDto {
  @IsString()
  name: string;

  @IsNumber()
  nutriscore: number;

  @IsString()
  tags: string;

  @IsString()
  grade: string;

  @IsString()
  type: string;

  @IsNumber()
  calories: number;

  @IsNumber()
  fat: number;

  @IsNumber()
  sugar: number;

  @IsNumber()
  fiber: number;

  @IsNumber()
  protein: number;

  @IsNumber()
  natrium: number;

  @IsNumber()
  vegetable: number;
}
