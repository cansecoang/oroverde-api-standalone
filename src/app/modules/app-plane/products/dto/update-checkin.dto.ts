import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateCheckInDto {
  @ApiPropertyOptional({ example: 'Sprint Review #6' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ example: 'Review Q2 indicator progress' })
  @IsString()
  @IsOptional()
  topic?: string;

  @ApiPropertyOptional({ example: '2025-08-01T14:00:00Z' })
  @IsDateString()
  @IsOptional()
  scheduled_at?: string;

  @ApiPropertyOptional({ example: 'https://meet.google.com/abc-xyz' })
  @IsString()
  @IsOptional()
  meeting_link?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  attendeeIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  linkedTaskIds?: string[];
}
