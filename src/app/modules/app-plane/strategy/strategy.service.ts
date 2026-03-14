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
      relations: ['values'],
    });

    if (!strategy) {
      throw new NotFoundException('La asignación producto-indicador no fue encontrada.');
    }

    const currentReportedTotal = (strategy.values ?? []).reduce(
      (sum, item) => sum + Number(item.value),
      0,
    );

    if (normalizedTarget < currentReportedTotal) {
      throw new BadRequestException(
        `La meta comprometida no puede ser menor al avance ya reportado (${currentReportedTotal}).`,
      );
    }

    strategy.committed_target = normalizedTarget;
    return strategyRepo.save(strategy);
  }

  // ---------------------------------------------------------
  // 3. OPERACIÓN (Reportes con HARD CAP 🔒)
  // ---------------------------------------------------------

  async reportProgress(dto: ReportProgressDto) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    
    const strategyRepo = dataSource.getRepository(ProductStrategy);
    const valuesRepo = dataSource.getRepository(StrategyValue);

    // 1. Buscamos la Estrategia con todo su historial de reportes
    const strategy = await strategyRepo.findOne({ 
        where: { id: dto.productStrategyId },
        relations: ['values'] // 👈 Vital para poder sumar lo anterior
    });

    if (!strategy) {
        throw new NotFoundException('La asignación del proyecto no fue encontrada.');
    }

    // 2. Calculamos cuánto llevan acumulado hasta hoy
    // (Sumamos los valores existentes en BD)
    const currentTotal = strategy.values.reduce((sum, item) => sum + Number(item.value), 0);

    // 3. Proyectamos el nuevo total si permitiéramos este reporte
    const newTotal = currentTotal + Number(dto.value);

    // 4. 🔒 VALIDACIÓN HARD CAP
    // Si la suma supera la meta prometida (committed_target), lanzamos error.
    if (newTotal > strategy.committed_target) {
        const remaining = strategy.committed_target - currentTotal;
        
        throw new BadRequestException(
            `⛔ Límite Excedido: La meta del proyecto es ${strategy.committed_target}. ` +
            `Llevas acumulado ${currentTotal}. ` +
            `Solo puedes reportar un máximo de ${remaining} más.`
        );
    }

    // 5. Si todo está en orden, guardamos
    const report = valuesRepo.create(dto);
    return valuesRepo.save(report);
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
    return dataSource.getRepository(ProductStrategy).find({
      where: { productId },
      relations: ['indicator', 'indicator.output', 'values'] // 👈 Renombrado
    });
  }
}