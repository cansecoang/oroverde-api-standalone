import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const createHost = () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();

    const response = { status, json } as any;
    const request = { url: '/api/tasks' } as any;

    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as ArgumentsHost;

    return { host, status, json };
  };

  it('returns enriched diagnostics for postgres 42703 errors', () => {
    const filter = new AllExceptionsFilter();
    const loggerWarnSpy = jest.spyOn((filter as any).logger, 'warn').mockImplementation();
    const loggerErrorSpy = jest.spyOn((filter as any).logger, 'error').mockImplementation();

    const exception = new QueryFailedError(
      'SELECT product.name FROM products product',
      [],
      {
        code: '42703',
        message: 'column distinctAlias.Product_id does not exist',
        table: 'products',
        column: 'Product_id',
        hint: 'Perhaps you meant to reference the column "product_id".',
        position: '77',
        query: 'SELECT DISTINCT distinctAlias.Product_id FROM products product',
        stack: 'stack-trace',
      } as any,
    );

    const { host, status, json } = createHost();

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Database Error',
        message: 'Columna no encontrada en la base de datos',
        path: '/api/tasks',
        details: expect.objectContaining({
          code: '42703',
          table: 'products',
          column: 'Product_id',
          hint: 'Perhaps you meant to reference the column "product_id".',
          position: '77',
          queryFragment: expect.stringContaining('SELECT DISTINCT'),
        }),
      }),
    );

    expect(loggerErrorSpy).toHaveBeenCalled();
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Database diagnostics [42703]'),
    );
  });

  it('keeps existing behavior for non-42703 query errors', () => {
    const filter = new AllExceptionsFilter();
    const loggerWarnSpy = jest.spyOn((filter as any).logger, 'warn').mockImplementation();

    const exception = new QueryFailedError(
      'INSERT INTO products(name) VALUES($1)',
      [],
      {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
        detail: 'Key (name)=(Demo) already exists.',
        constraint: 'products_name_key',
      } as any,
    );

    const { host, status, json } = createHost();
    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Ya existe un registro con estos datos únicos',
      }),
    );
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });
});
