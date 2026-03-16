import { ApiProperty } from '@nestjs/swagger';

export class ProductSummaryDto {
  @ApiProperty({ description: 'Total number of tasks in the product' })
  totalTasks: number;

  @ApiProperty({ description: 'Number of completed tasks (includes Reviewed)' })
  completedTasks: number;

  @ApiProperty({ description: 'Number of tasks currently in progress' })
  inProgressTasks: number;

  @ApiProperty({ description: 'Number of pending tasks' })
  pendingTasks: number;

  @ApiProperty({ description: 'Completion percentage in range 0-100' })
  completionPercentage: number;
}

export class StatusDistributionItemDto {
  @ApiProperty({ description: 'Status identifier' })
  id: string;

  @ApiProperty({ description: 'Status display name' })
  name: string;

  @ApiProperty({ description: 'Status code' })
  code: string;

  @ApiProperty({ description: 'Number of tasks in this status' })
  value: number;

  @ApiProperty({ description: 'Percentage of total tasks for this status' })
  percentage: number;
}

export class PhaseMetricItemDto {
  @ApiProperty({ description: 'Phase identifier' })
  id: string;

  @ApiProperty({ description: 'Phase display name' })
  name: string;

  @ApiProperty({ description: 'Total number of tasks in this phase' })
  totalTasks: number;

  @ApiProperty({ description: 'Completed tasks in this phase' })
  completedTasks: number;

  @ApiProperty({ description: 'Pending tasks in this phase' })
  pendingTasks: number;

  @ApiProperty({ description: 'Completion percentage for this phase' })
  completionPercentage: number;
}

export class PendingByOrganizationItemDto {
  @ApiProperty({ description: 'Organization identifier' })
  organizationId: string;

  @ApiProperty({ description: 'Organization name' })
  organizationName: string;

  @ApiProperty({ description: 'Pending task count assigned to this organization' })
  pendingCount: number;

  @ApiProperty({ description: 'Percentage over total pending tasks' })
  percentage: number;
}

export class ProductMetricsDto {
  @ApiProperty({ description: 'Product identifier' })
  productId: string;

  @ApiProperty({ description: 'Product display name' })
  productName: string;

  @ApiProperty({ type: ProductSummaryDto })
  productSummary: ProductSummaryDto;

  @ApiProperty({ type: [StatusDistributionItemDto] })
  statusDistribution: StatusDistributionItemDto[];

  @ApiProperty({ type: [PhaseMetricItemDto] })
  phaseMetrics: PhaseMetricItemDto[];

  @ApiProperty({ type: [PendingByOrganizationItemDto] })
  pendingTasksByOrganization: PendingByOrganizationItemDto[];

  @ApiProperty({ description: 'Total number of pending tasks' })
  totalPendingTasks: number;

  @ApiProperty({ description: 'ISO timestamp for payload generation' })
  generatedAt: string;
}
