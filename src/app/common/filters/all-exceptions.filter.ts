import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError, EntityNotFoundError } from 'typeorm';

/**
 * Global exception filter que captura todos los errores y los formatea consistentemente.
 * Maneja errores específicos de TypeORM y los convierte en respuestas HTTP apropiadas.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';
    let error = 'Internal Server Error';
    let details: any = undefined;

    // 1. HttpException (BadRequestException, NotFoundException, etc.)
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || message;
        error = (exceptionResponse as any).error || exception.name;
      } else {
        message = exceptionResponse;
        error = exception.name;
      }
    }
    // 2. TypeORM QueryFailedError (violaciones de FK, unique, etc.)
    else if (exception instanceof QueryFailedError) {
      status = HttpStatus.BAD_REQUEST;
      error = 'Database Error';
      
      const dbError = exception as any;
      const errorCode = dbError.code;

      // PostgreSQL error codes
      switch (errorCode) {
        case '23505': // unique_violation
          message = 'Ya existe un registro con estos datos únicos';
          details = this.extractConstraintDetail(dbError);
          break;
        case '23503': // foreign_key_violation
          message = 'Referencia inválida: el registro relacionado no existe';
          details = this.extractConstraintDetail(dbError);
          break;
        case '23502': // not_null_violation
          message = 'Campo obligatorio faltante';
          details = this.extractConstraintDetail(dbError);
          break;
        case '23514': // check_violation
          message = 'Valor fuera del rango permitido';
          details = this.extractConstraintDetail(dbError);
          break;
        case '42P01': // undefined_table
          message = 'Estructura de base de datos inválida';
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          break;
        case '42703': // undefined_column
          message = 'Columna no encontrada en la base de datos';
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          details = {
            code: errorCode,
            ...(dbError.table && { table: dbError.table }),
            ...(dbError.column && { column: dbError.column }),
            ...(dbError.hint && { hint: dbError.hint }),
            ...(dbError.position && { position: dbError.position }),
            ...(this.safeQueryFragment(dbError.query) && {
              queryFragment: this.safeQueryFragment(dbError.query),
            }),
          };
          break;
        default:
          message = 'Error en la operación de base de datos';
          details = { code: errorCode, detail: dbError.detail };
      }

      this.logger.error(
        `Database error [${errorCode}]: ${dbError.message}`,
        dbError.stack,
      );

      if (errorCode === '42703') {
        this.logger.warn(
          `Database diagnostics [42703]: ${JSON.stringify(details)}`,
        );
      }
    }
    // 3. TypeORM EntityNotFoundError
    else if (exception instanceof EntityNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      error = 'Not Found';
      message = 'El registro solicitado no fue encontrado';
    }
    // 4. Otros errores no manejados
    else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled error: ${exception.message}`,
        exception.stack,
      );
      message = process.env.NODE_ENV === 'production' 
        ? 'Error interno del servidor' 
        : exception.message;
      details = process.env.NODE_ENV === 'production' 
        ? undefined 
        : { stack: exception.stack };
    }

    // Construir respuesta consistente
    const errorResponse = {
      statusCode: status,
      error,
      message,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }

  /**
   * Extrae información útil del detalle de error de PostgreSQL
   */
  private extractConstraintDetail(dbError: any): any {
    const detail = dbError.detail || '';
    const constraint = dbError.constraint || '';
    const table = dbError.table || '';
    const column = dbError.column || '';

    return {
      ...(constraint && { constraint }),
      ...(table && { table }),
      ...(column && { column }),
      ...(detail && { detail }),
    };
  }

  /**
   * Entrega un fragmento seguro de la consulta para depuración.
   * Evita parámetros y limita longitud para no exponer datos sensibles.
   */
  private safeQueryFragment(query: unknown): string | undefined {
    if (typeof query !== 'string' || !query.trim()) {
      return undefined;
    }

    return query
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
  }
}
