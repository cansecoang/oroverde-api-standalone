import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StrategyTimelineTaskDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional() statusName: string | null;
  @ApiPropertyOptional() phaseName: string | null;
  @ApiPropertyOptional() assigneeName: string | null;
  @ApiPropertyOptional() plannedStart: string | null;
  @ApiPropertyOptional() plannedEnd: string | null;
  @ApiPropertyOptional() actualStart: string | null;
  @ApiPropertyOptional() actualEnd: string | null;
}

export class StrategyTimelineProductDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() countryName: string | null;
  @ApiPropertyOptional() ownerOrganizationName: string | null;
  @ApiPropertyOptional() deliverable: string | null;
  @ApiPropertyOptional() plannedStart: string | null;
  @ApiPropertyOptional() plannedEnd: string | null;
  @ApiPropertyOptional() actualStart: string | null;
  @ApiPropertyOptional() actualEnd: string | null;
  @ApiProperty({ type: Number }) committedTarget: number;
  @ApiProperty({ type: Number }) reportedProgress: number;
  @ApiProperty({ type: Number }) progressPercent: number;
  @ApiProperty({ type: [StrategyTimelineTaskDto] }) tasks: StrategyTimelineTaskDto[];
}

export class StrategyTimelineWorkpackageDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() code: string | null;
  @ApiPropertyOptional() plannedStart: string | null;
  @ApiPropertyOptional() plannedEnd: string | null;
  @ApiPropertyOptional() actualStart: string | null;
  @ApiPropertyOptional() actualEnd: string | null;
  @ApiProperty({ type: Number }) committedTotal: number;
  @ApiProperty({ type: Number }) reportedTotal: number;
  @ApiProperty({ type: Number }) progressPercent: number;
  @ApiProperty({ type: [StrategyTimelineProductDto] }) products: StrategyTimelineProductDto[];
}

export class StrategyTimelineIndicatorDto {
  @ApiProperty() outputId: string;
  @ApiProperty() outputCode: string;
  @ApiProperty() outputName: string;
  @ApiProperty({ type: Number }) outputOrder: number;
  @ApiProperty() indicatorId: string;
  @ApiProperty() indicatorCode: string;
  @ApiProperty() indicatorDescription: string;
  @ApiProperty() unit: string;
  @ApiProperty({ type: Number }) totalTarget: number;
  @ApiProperty({ type: Number }) committedTotal: number;
  @ApiProperty({ type: Number }) reportedTotal: number;
  @ApiProperty({ type: Number }) progressPercent: number;
  @ApiPropertyOptional() indicatorPlannedCompletionDate: string | null;
  @ApiPropertyOptional() indicatorActualCompletionDate: string | null;
  @ApiPropertyOptional() plannedStart: string | null;
  @ApiPropertyOptional() plannedEnd: string | null;
  @ApiPropertyOptional() actualStart: string | null;
  @ApiPropertyOptional() actualEnd: string | null;
  @ApiProperty({ type: [StrategyTimelineWorkpackageDto] }) workpackages: StrategyTimelineWorkpackageDto[];
}

export class StrategyTimelineOutputOptionDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: Number }) order: number;
}

export class StrategyTimelineIndicatorOptionDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() description: string;
  @ApiProperty() outputId: string;
  @ApiProperty() outputCode: string;
}

export class StrategyTimelineMetaDto {
  @ApiProperty({ type: Number }) indicatorCount: number;
  @ApiProperty({ type: Number }) workpackageCount: number;
  @ApiProperty({ type: Number }) productCount: number;
  @ApiProperty({ type: Number }) taskCount: number;
  @ApiProperty({ type: Number }) unscheduledTaskCount: number;
}

export class StrategyTimelineResponseDto {
  @ApiProperty() generatedAt: string;
  @ApiProperty() workpackageKey: string;
  @ApiPropertyOptional() tenantStartDate: string | null;
  @ApiPropertyOptional() tenantEndDate: string | null;
  @ApiProperty({ type: [StrategyTimelineOutputOptionDto] }) outputs: StrategyTimelineOutputOptionDto[];
  @ApiProperty({ type: [StrategyTimelineIndicatorOptionDto] }) indicators: StrategyTimelineIndicatorOptionDto[];
  @ApiProperty({ type: [StrategyTimelineIndicatorDto] }) timeline: StrategyTimelineIndicatorDto[];
  @ApiProperty({ type: StrategyTimelineMetaDto }) meta: StrategyTimelineMetaDto;
}
