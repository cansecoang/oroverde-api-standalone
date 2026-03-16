import { Injectable, BadRequestException, Scope, NotFoundException } from '@nestjs/common';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
import { StrategicOutput } from './entities/strategic-output.entity';
import { StrategicIndicator } from './entities/strategic-indicator.entity';
import { ProductStrategy } from './entities/product-strategy.entity';
import { StrategyValue } from './entities/strategy-value.entity';
import { CreateOutputDto } from './dto/create-output.dto';
import { CreateIndicatorDto } from './dto/create-indicator.dto';
import { AssignStrategyDto } from './dto/assign-strategy.dto';
import { ReportProgressDto } from './dto/report-progress.dto';
import { StrategyTimelineQueryDto } from './dto/strategy-timeline-query.dto';
import {
  StrategyTimelineIndicatorDto,
  StrategyTimelineIndicatorOptionDto,
  StrategyTimelineOutputOptionDto,
  StrategyTimelineProductDto,
  StrategyTimelineResponseDto,
  StrategyTimelineTaskDto,
  StrategyTimelineWorkpackageDto,
} from './dto/strategy-timeline-response.dto';

interface StrategyTimelineAssignmentRow {
  output_id: string | null;
  output_code: string | null;
  output_name: string | null;
  output_order: number | string | null;
  indicator_id: string;
  indicator_code: string | null;
  indicator_description: string | null;
  indicator_unit: string | null;
  indicator_total_target: number | string | null;
  indicator_planned_completion_date: string | Date | null;
  indicator_actual_completion_date: string | Date | null;
  committed_target: number | string | null;
  reported_progress: number | string | null;
  product_id: string;
  product_name: string | null;
  product_deliverable: string | null;
  owner_organization_name: string | null;
  country_name: string | null;
  workpackage_id: string | null;
  workpackage_name: string | null;
  workpackage_code: string | null;
}

interface StrategyTimelineTaskRow {
  id: string;
  title: string | null;
  product_id: string;
  planned_start: string | Date | null;
  planned_end: string | Date | null;
  actual_start: string | Date | null;
  actual_end: string | Date | null;
  status_name: string | null;
  phase_name: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
}

interface TimelineRangeAccumulator {
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
}

interface TimelineRangeResult {
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
}

interface ProductTaskProgress {
  totalTasks: number;
  completedTasks: number;
  completionRatio: number;
  latestCompletedTaskDate: string | null;
}

@Injectable({ scope: Scope.REQUEST })
export class StrategyService {
  constructor(private tenantConnection: TenantConnectionService) {}

  // 1. CREAR OUTPUT (Asegurando el Orden)
  async createOutput(dto: CreateOutputDto) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const repo = dataSource.getRepository(StrategicOutput);

    // Validación: ¿Ya existe un Output con ese número de orden?
    // Ej: Ya existe el Output 1, no puedes crear otro Output 1.
    const existing = await repo.findOne({ where: { order: dto.order } });
    if (existing) {
        throw new BadRequestException(`Ya existe un Output con el número de orden ${dto.order}.`);
    }

    // Generamos el código visual automáticamente: "Output 1", "Output 2"
    const code = `Output ${dto.order}`; 

    const output = repo.create({
        ...dto,
        code: code // Guardamos "Output 1"
    });
    return repo.save(output);
  }

  // 2. CREAR INDICADOR (Lógica Automática)
  async createIndicator(dto: CreateIndicatorDto) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    
    // A. Buscamos el Output Padre para saber su número (1, 2, 3...)
    const outputRepo = dataSource.getRepository(StrategicOutput);
    const output = await outputRepo.findOne({ where: { id: dto.outputId } });
    
    if (!output) throw new NotFoundException('El Output seleccionado no existe.');

    // B. Construimos el Código Maestro
    // Formato: [OutputOrder].[IndicatorNumber] -> "1.1", "1.12"
    const finalCode = `${output.order}.${dto.indicatorNumber}`;

    // C. Validamos que este código final no exista ya
    const indRepo = dataSource.getRepository(StrategicIndicator);
    const existing = await indRepo.findOne({ where: { code: finalCode } });
    
    if (existing) {
        throw new BadRequestException(`El código '${finalCode}' ya existe en este Output. Intenta con otro número.`);
    }

    // D. Guardamos
    const indicator = indRepo.create({
        code: finalCode, // 👈 Guardamos el string generado
        description: dto.description,
        unit: dto.unit,
        total_target: dto.total_target,
        plannedCompletionDate: dto.plannedCompletionDate,
        actualCompletionDate: dto.actualCompletionDate,
        output: output
    });
    return indRepo.save(indicator);
  }

  // 👇 RENOMBRADO: Asignar Proyecto a Indicador
  async assignToProject(dto: AssignStrategyDto) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const repo = dataSource.getRepository(ProductStrategy);

    // Validar existencia de asignación usando indicatorId
    const existing = await repo.findOne({ 
      where: { productId: dto.productId, indicatorId: dto.indicatorId }
    });
    if (existing) throw new BadRequestException('Este proyecto ya contribuye a este indicador.');

    const assignment = repo.create({
      productId: dto.productId,
      indicatorId: dto.indicatorId, // 👈
      committed_target: dto.target
    });
    return repo.save(assignment);
  }

  async updateCommittedTarget(productId: string, assignmentId: string, target: number) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const strategyRepo = dataSource.getRepository(ProductStrategy);
    const normalizedTarget = Number(target);

    if (!Number.isFinite(normalizedTarget) || normalizedTarget < 0) {
      throw new BadRequestException('La meta comprometida debe ser un número válido mayor o igual a 0.');
    }

    const strategy = await strategyRepo.findOne({
      where: { id: assignmentId, productId },
    });

    if (!strategy) {
      throw new NotFoundException('La asignación producto-indicador no fue encontrada.');
    }

    const taskProgress = await this.getProductTaskProgress(dataSource, productId);
    const currentReportedTotal = taskProgress.completedTasks;

    if (normalizedTarget < currentReportedTotal) {
      throw new BadRequestException(
        `La meta comprometida no puede ser menor a las tareas completadas (${currentReportedTotal}).`,
      );
    }

    strategy.committed_target = normalizedTarget;
    return strategyRepo.save(strategy);
  }

  // ---------------------------------------------------------
  // 3. OPERACIÓN (Reportes con HARD CAP 🔒)
  // ---------------------------------------------------------

  async reportProgress(_dto: ReportProgressDto) {
    throw new BadRequestException(
      'El avance de indicadores ahora se calcula automáticamente desde tareas completadas del producto.',
    );
  }

  async getIndicatorTimeline(query: StrategyTimelineQueryDto): Promise<StrategyTimelineResponseDto> {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const tenantDateWindow = await this.tenantConnection.getCurrentTenantDateWindow();
    const workpackageKey = (query.workpackageKey || 'workpackage').trim() || 'workpackage';
    const completedTaskPredicate = this.completedTaskPredicateSql('st_task');

    const params: unknown[] = [workpackageKey];
    const whereFragments: string[] = [];
    let paramIndex = 2;

    if (query.outputId) {
      whereFragments.push(`so.id = $${paramIndex++}`);
      params.push(query.outputId);
    }

    if (query.indicatorId) {
      whereFragments.push(`si.id = $${paramIndex++}`);
      params.push(query.indicatorId);
    }

    if (query.search?.trim()) {
      whereFragments.push(`(
        p.name ILIKE $${paramIndex}
        OR si.code ILIKE $${paramIndex}
        OR si.description ILIKE $${paramIndex}
        OR COALESCE(ci_wp.name, pcv_wp.value_text, 'Unassigned') ILIKE $${paramIndex}
      )`);
      params.push(`%${query.search.trim()}%`);
      paramIndex += 1;
    }

    const whereClause = whereFragments.length > 0
      ? `WHERE ${whereFragments.join(' AND ')}`
      : '';

    const assignments = await dataSource.query<StrategyTimelineAssignmentRow[]>(
      `SELECT
         so.id AS output_id,
         so.code AS output_code,
         so.name AS output_name,
         so."order" AS output_order,
         si.id AS indicator_id,
         si.code AS indicator_code,
         si.description AS indicator_description,
         si.unit AS indicator_unit,
         si.total_target AS indicator_total_target,
         si.planned_completion_date AS indicator_planned_completion_date,
         si.actual_completion_date AS indicator_actual_completion_date,
         ps.committed_target AS committed_target,
         COALESCE(task_progress.completed_tasks, 0) AS reported_progress,
         p.id AS product_id,
         p.name AS product_name,
         p.deliverable AS product_deliverable,
         wo.name AS owner_organization_name,
         c.name AS country_name,
         ci_wp.id AS workpackage_id,
         COALESCE(ci_wp.name, pcv_wp.value_text, 'Unassigned') AS workpackage_name,
         ci_wp.code AS workpackage_code
       FROM product_strategies ps
       JOIN strategic_indicators si ON ps.indicator_id = si.id
       LEFT JOIN strategic_outputs so ON si.output_id = so.id
       JOIN products p ON ps.product_id = p.id
       LEFT JOIN workspace_organizations wo ON p.owner_organization_id = wo.id
       LEFT JOIN countries c ON p.country_id = c.id
       LEFT JOIN product_field_definitions pfd_wp ON pfd_wp.key = $1
       LEFT JOIN product_custom_values pcv_wp ON pcv_wp.product_id = p.id AND pcv_wp.field_id = pfd_wp.id
       LEFT JOIN catalog_items ci_wp ON ci_wp.id = pcv_wp.value_catalog_id
       LEFT JOIN (
         SELECT
           t.product_id,
           COUNT(*)::int AS total_tasks,
           SUM(CASE WHEN ${completedTaskPredicate} THEN 1 ELSE 0 END)::int AS completed_tasks
         FROM tasks t
         LEFT JOIN catalog_items st_task ON st_task.id = t.status_id
         GROUP BY t.product_id
       ) task_progress ON task_progress.product_id = p.id
       ${whereClause}
       ORDER BY so."order" NULLS LAST, so.code, si.code, workpackage_name, p.name`,
      params,
    );

    const productIds = Array.from(
      new Set(assignments.map((row) => row.product_id).filter((id): id is string => !!id)),
    );

    const tasks = productIds.length > 0
      ? await dataSource.query<StrategyTimelineTaskRow[]>(
          `SELECT
             t.id,
             t.title,
             t.product_id,
             t.start_date AS planned_start,
             t.end_date AS planned_end,
             t.actual_start_date AS actual_start,
             t.actual_end_date AS actual_end,
             st.name AS status_name,
             ph.name AS phase_name,
             wm.full_name AS assignee_name,
             wm.email AS assignee_email
           FROM tasks t
           LEFT JOIN catalog_items st ON st.id = t.status_id
           LEFT JOIN catalog_items ph ON ph.id = t.phase_id
           LEFT JOIN product_members pm ON pm.id = t.assignee_member_id
           LEFT JOIN workspace_members wm ON wm.id = pm.member_id
           WHERE t.product_id = ANY($1::uuid[])
           ORDER BY t.title ASC`,
          [productIds],
        )
      : [];

    const tasksByProduct = new Map<string, StrategyTimelineTaskDto[]>();
    let unscheduledTaskCount = 0;
    const uniqueTaskIds = new Set<string>();

    for (const row of tasks) {
      const plannedStart = this.normalizeDate(row.planned_start);
      const plannedEnd = this.normalizeDate(row.planned_end);
      const actualStart = this.normalizeDate(row.actual_start);
      const actualEnd = this.normalizeDate(row.actual_end);

      const taskVm: StrategyTimelineTaskDto = {
        id: row.id,
        title: this.normalizeLabel(row.title, 'Untitled task'),
        statusName: this.normalizeOptionalText(row.status_name),
        phaseName: this.normalizeOptionalText(row.phase_name),
        assigneeName: this.normalizeOptionalText(row.assignee_name)
          ?? this.normalizeOptionalText(row.assignee_email),
        plannedStart,
        plannedEnd,
        actualStart,
        actualEnd,
      };

      if (!tasksByProduct.has(row.product_id)) {
        tasksByProduct.set(row.product_id, []);
      }

      tasksByProduct.get(row.product_id)?.push(taskVm);
      uniqueTaskIds.add(taskVm.id);

      if (!plannedStart || !plannedEnd) {
        unscheduledTaskCount += 1;
      }
    }

    for (const productTasks of tasksByProduct.values()) {
      productTasks.sort((a, b) =>
        this.compareNullableDateAsc(a.plannedStart, b.plannedStart)
        || this.compareCode(a.title, b.title),
      );
    }

    const outputsOptionsMap = new Map<string, StrategyTimelineOutputOptionDto>();
    const indicatorsOptionsMap = new Map<string, StrategyTimelineIndicatorOptionDto>();
    const indicatorsMap = new Map<string, StrategyTimelineIndicatorDto>();
    const workpackageMapByIndicator = new Map<string, Map<string, StrategyTimelineWorkpackageDto>>();
    const uniqueProductIds = new Set<string>();

    for (const row of assignments) {
      if (row.output_id) {
        outputsOptionsMap.set(row.output_id, {
          id: row.output_id,
          code: this.normalizeLabel(row.output_code, 'N/A'),
          name: this.normalizeLabel(row.output_name, 'No output'),
          order: this.toNumber(row.output_order),
        });
      }

      indicatorsOptionsMap.set(row.indicator_id, {
        id: row.indicator_id,
        code: this.normalizeLabel(row.indicator_code, 'N/A'),
        description: this.normalizeLabel(row.indicator_description, 'No description'),
        outputId: row.output_id ?? 'unassigned-output',
        outputCode: this.normalizeLabel(row.output_code, 'N/A'),
      });

      if (!indicatorsMap.has(row.indicator_id)) {
        indicatorsMap.set(row.indicator_id, {
          outputId: row.output_id ?? 'unassigned-output',
          outputCode: this.normalizeLabel(row.output_code, 'N/A'),
          outputName: this.normalizeLabel(row.output_name, 'No output'),
          outputOrder: this.toNumber(row.output_order),
          indicatorId: row.indicator_id,
          indicatorCode: this.normalizeLabel(row.indicator_code, 'N/A'),
          indicatorDescription: this.normalizeLabel(row.indicator_description, 'No description'),
          unit: this.normalizeLabel(row.indicator_unit, 'units'),
          totalTarget: this.toNumber(row.indicator_total_target),
          committedTotal: 0,
          reportedTotal: 0,
          progressPercent: 0,
          indicatorPlannedCompletionDate: this.normalizeDate(row.indicator_planned_completion_date),
          indicatorActualCompletionDate: this.normalizeDate(row.indicator_actual_completion_date),
          plannedStart: null,
          plannedEnd: null,
          actualStart: null,
          actualEnd: null,
          workpackages: [],
        });
      }

      if (!workpackageMapByIndicator.has(row.indicator_id)) {
        workpackageMapByIndicator.set(row.indicator_id, new Map<string, StrategyTimelineWorkpackageDto>());
      }

      const workpackageMap = workpackageMapByIndicator.get(row.indicator_id);
      const workpackageId = row.workpackage_id ?? '__unassigned__';

      if (workpackageMap && !workpackageMap.has(workpackageId)) {
        workpackageMap.set(workpackageId, {
          id: workpackageId,
          name: this.normalizeLabel(row.workpackage_name, 'Unassigned'),
          code: this.normalizeOptionalText(row.workpackage_code),
          plannedStart: null,
          plannedEnd: null,
          actualStart: null,
          actualEnd: null,
          committedTotal: 0,
          reportedTotal: 0,
          progressPercent: 0,
          products: [],
        });
      }

      const workpackage = workpackageMap?.get(workpackageId);
      if (!workpackage) {
        continue;
      }

      const committedTarget = this.toNumber(row.committed_target);
      const reportedProgress = this.toNumber(row.reported_progress);

      const productVm: StrategyTimelineProductDto = {
        id: row.product_id,
        name: this.normalizeLabel(row.product_name, 'Untitled product'),
        countryName: this.normalizeOptionalText(row.country_name),
        ownerOrganizationName: this.normalizeOptionalText(row.owner_organization_name),
        deliverable: this.normalizeOptionalText(row.product_deliverable),
        plannedStart: null,
        plannedEnd: null,
        actualStart: null,
        actualEnd: null,
        committedTarget,
        reportedProgress,
        progressPercent: committedTarget > 0 ? (reportedProgress / committedTarget) * 100 : 0,
        tasks: tasksByProduct.get(row.product_id) ?? [],
      };

      const productRange = this.computeRangeFromTasks(productVm.tasks);
      productVm.plannedStart = productRange.plannedStart;
      productVm.plannedEnd = productRange.plannedEnd;
      productVm.actualStart = productRange.actualStart;
      productVm.actualEnd = productRange.actualEnd;

      workpackage.products.push(productVm);
      uniqueProductIds.add(productVm.id);
    }

    const timeline = Array.from(indicatorsMap.values());

    for (const indicator of timeline) {
      const workpackageMap = workpackageMapByIndicator.get(indicator.indicatorId);
      const workpackages = workpackageMap ? Array.from(workpackageMap.values()) : [];

      for (const workpackage of workpackages) {
        workpackage.products.sort((a, b) => this.compareCode(a.name, b.name));

        workpackage.committedTotal = workpackage.products.reduce(
          (sum, product) => sum + product.committedTarget,
          0,
        );
        workpackage.reportedTotal = workpackage.products.reduce(
          (sum, product) => sum + product.reportedProgress,
          0,
        );
        workpackage.progressPercent = workpackage.committedTotal > 0
          ? (workpackage.reportedTotal / workpackage.committedTotal) * 100
          : 0;

        const workpackageRange = this.computeRangeFromProducts(workpackage.products);
        workpackage.plannedStart = workpackageRange.plannedStart;
        workpackage.plannedEnd = workpackageRange.plannedEnd;
        workpackage.actualStart = workpackageRange.actualStart;
        workpackage.actualEnd = workpackageRange.actualEnd;
      }

      workpackages.sort((a, b) =>
        this.compareCode(a.name, b.name)
        || this.compareCode(a.code ?? '', b.code ?? ''),
      );

      indicator.workpackages = workpackages;
      indicator.committedTotal = workpackages.reduce((sum, item) => sum + item.committedTotal, 0);
      indicator.reportedTotal = workpackages.reduce((sum, item) => sum + item.reportedTotal, 0);
      indicator.progressPercent = indicator.totalTarget > 0
        ? (indicator.reportedTotal / indicator.totalTarget) * 100
        : 0;

      const indicatorRange = this.computeRangeFromWorkpackages(
        workpackages,
        indicator.indicatorPlannedCompletionDate,
        indicator.indicatorActualCompletionDate,
      );
      indicator.plannedStart = indicatorRange.plannedStart;
      indicator.plannedEnd = indicatorRange.plannedEnd;
      indicator.actualStart = indicatorRange.actualStart;
      indicator.actualEnd = indicatorRange.actualEnd;
    }

    timeline.sort((a, b) =>
      (a.outputOrder - b.outputOrder)
      || this.compareCode(a.outputCode, b.outputCode)
      || this.compareCode(a.indicatorCode, b.indicatorCode),
    );

    const outputs = Array.from(outputsOptionsMap.values()).sort((a, b) =>
      (a.order - b.order)
      || this.compareCode(a.code, b.code)
      || this.compareCode(a.name, b.name),
    );

    const indicators = Array.from(indicatorsOptionsMap.values()).sort((a, b) =>
      this.compareCode(a.outputCode, b.outputCode)
      || this.compareCode(a.code, b.code),
    );

    const workpackageCount = timeline.reduce(
      (sum, indicator) => sum + indicator.workpackages.length,
      0,
    );

    return {
      generatedAt: new Date().toISOString(),
      workpackageKey,
      tenantStartDate: this.normalizeDate(tenantDateWindow.startDate),
      tenantEndDate: this.normalizeDate(tenantDateWindow.endDate),
      outputs,
      indicators,
      timeline,
      meta: {
        indicatorCount: timeline.length,
        workpackageCount,
        productCount: uniqueProductIds.size,
        taskCount: uniqueTaskIds.size,
        unscheduledTaskCount,
      },
    };
  }

  // Vista Árbol (Output -> Indicators -> Projects)
  async getFullStrategyTree() {
    const dataSource = await this.tenantConnection.getTenantConnection();
    return dataSource.getRepository(StrategicOutput).find({
      relations: [
          'indicators', // 👈 Renombrado
          'indicators.contributions', 
          'indicators.contributions.product'
      ],
      order: { order: 'ASC', code: 'ASC' }
    });
  }

  async findProjectStrategy(productId: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const assignments = await dataSource.getRepository(ProductStrategy).find({
      where: { productId },
      relations: ['indicator', 'indicator.output', 'values'] // 👈 Renombrado
    });

    const taskProgress = await this.getProductTaskProgress(dataSource, productId);

    return assignments.map((assignment) => ({
      ...assignment,
      completedTasks: taskProgress.completedTasks,
      totalTasks: taskProgress.totalTasks,
      tasksCompletionRatio: taskProgress.completionRatio,
      tasksCompletionPercentage: taskProgress.completionRatio * 100,
      latestCompletedTaskDate: taskProgress.latestCompletedTaskDate,
    }));
  }

  private computeRangeFromTasks(tasks: StrategyTimelineTaskDto[]): TimelineRangeResult {
    const range = this.createRangeAccumulator();

    for (const task of tasks) {
      this.includeRangeValues(range, task.plannedStart, task.plannedEnd, 'planned');
      this.includeRangeValues(range, task.actualStart, task.actualEnd, 'actual');
    }

    return this.materializeRange(range);
  }

  private computeRangeFromProducts(products: StrategyTimelineProductDto[]): TimelineRangeResult {
    const range = this.createRangeAccumulator();

    for (const product of products) {
      this.includeRangeValues(range, product.plannedStart, product.plannedEnd, 'planned');
      this.includeRangeValues(range, product.actualStart, product.actualEnd, 'actual');
    }

    return this.materializeRange(range);
  }

  private computeRangeFromWorkpackages(
    workpackages: StrategyTimelineWorkpackageDto[],
    plannedMilestone?: string | null,
    actualMilestone?: string | null,
  ): TimelineRangeResult {
    const range = this.createRangeAccumulator();

    for (const workpackage of workpackages) {
      this.includeRangeValues(range, workpackage.plannedStart, workpackage.plannedEnd, 'planned');
      this.includeRangeValues(range, workpackage.actualStart, workpackage.actualEnd, 'actual');
    }

    this.includeMilestone(range, plannedMilestone, 'planned');
    this.includeMilestone(range, actualMilestone, 'actual');

    return this.materializeRange(range);
  }

  private createRangeAccumulator(): TimelineRangeAccumulator {
    return {
      plannedStart: null,
      plannedEnd: null,
      actualStart: null,
      actualEnd: null,
    };
  }

  private includeRangeValues(
    range: TimelineRangeAccumulator,
    startRaw: string | null,
    endRaw: string | null,
    kind: 'planned' | 'actual',
  ): void {
    const start = this.dateStringToUtcDate(startRaw);
    const end = this.dateStringToUtcDate(endRaw);

    if (!start && !end) {
      return;
    }

    const effectiveStart = start ?? end;
    const effectiveEnd = end ?? start;

    if (!effectiveStart || !effectiveEnd) {
      return;
    }

    const normalizedStart = effectiveStart <= effectiveEnd ? effectiveStart : effectiveEnd;
    const normalizedEnd = effectiveStart <= effectiveEnd ? effectiveEnd : effectiveStart;

    if (kind === 'planned') {
      if (!range.plannedStart || normalizedStart < range.plannedStart) {
        range.plannedStart = normalizedStart;
      }
      if (!range.plannedEnd || normalizedEnd > range.plannedEnd) {
        range.plannedEnd = normalizedEnd;
      }
      return;
    }

    if (!range.actualStart || normalizedStart < range.actualStart) {
      range.actualStart = normalizedStart;
    }
    if (!range.actualEnd || normalizedEnd > range.actualEnd) {
      range.actualEnd = normalizedEnd;
    }
  }

  private includeMilestone(
    range: TimelineRangeAccumulator,
    dateRaw: string | null | undefined,
    kind: 'planned' | 'actual',
  ): void {
    this.includeRangeValues(range, dateRaw ?? null, dateRaw ?? null, kind);
  }

  private materializeRange(range: TimelineRangeAccumulator): TimelineRangeResult {
    return {
      plannedStart: this.formatUtcDate(range.plannedStart),
      plannedEnd: this.formatUtcDate(range.plannedEnd),
      actualStart: this.formatUtcDate(range.actualStart),
      actualEnd: this.formatUtcDate(range.actualEnd),
    };
  }

  private normalizeDate(value: unknown): string | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return this.formatUtcDate(value);
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }

      const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
      if (match?.[1]) {
        return match[1];
      }

      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }

      return this.formatUtcDate(parsed);
    }

    return null;
  }

  private normalizeOptionalText(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeLabel(value: unknown, fallback: string): string {
    return this.normalizeOptionalText(value) ?? fallback;
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async getProductTaskProgress(dataSource: any, productId: string): Promise<ProductTaskProgress> {
    const completedTaskPredicate = this.completedTaskPredicateSql('st_progress');

    const rows = (await dataSource.query(
      `SELECT
         COUNT(*)::int AS total_tasks,
         SUM(CASE WHEN ${completedTaskPredicate} THEN 1 ELSE 0 END)::int AS completed_tasks,
         MAX(CASE WHEN ${completedTaskPredicate} THEN COALESCE(t.actual_end_date, t.updated_at, t.end_date, t.start_date) END)
           AS latest_completed_task_date
       FROM tasks t
       LEFT JOIN catalog_items st_progress ON st_progress.id = t.status_id
       WHERE t.product_id = $1`,
      [productId],
    )) as Array<{
      total_tasks: number | string | null;
      completed_tasks: number | string | null;
      latest_completed_task_date: string | Date | null;
    }>;

    const raw = rows[0];

    const totalTasks = this.toNumber(raw?.total_tasks);
    const completedTasks = this.toNumber(raw?.completed_tasks);
    const completionRatio = totalTasks > 0 ? completedTasks / totalTasks : 0;

    return {
      totalTasks,
      completedTasks,
      completionRatio,
      latestCompletedTaskDate: this.normalizeDate(raw?.latest_completed_task_date ?? null),
    };
  }

  private completedTaskPredicateSql(statusAlias: string): string {
    const normalized = `LOWER(COALESCE(${statusAlias}.code, ${statusAlias}.name, ''))`;
    return `(
      ${normalized} IN ('completed', 'done', 'finalized', 'finished', 'completado', 'completada', 'cerrado', 'cerrada')
      OR ${normalized} LIKE '%complet%'
      OR ${normalized} LIKE '%finish%'
    )`;
  }

  private compareNullableDateAsc(a: string | null, b: string | null): number {
    if (!a && !b) {
      return 0;
    }
    if (!a) {
      return 1;
    }
    if (!b) {
      return -1;
    }
    return a.localeCompare(b);
  }

  private compareCode(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  private dateStringToUtcDate(raw: string | null): Date | null {
    if (!raw) {
      return null;
    }

    const parts = raw.split('-').map((value) => Number(value));
    if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
      return null;
    }

    const [year, month, day] = parts;
    return new Date(Date.UTC(year, month - 1, day));
  }

  private formatUtcDate(value: Date | null): string | null {
    if (!value) {
      return null;
    }

    const year = value.getUTCFullYear();
    const month = `${value.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${value.getUTCDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}