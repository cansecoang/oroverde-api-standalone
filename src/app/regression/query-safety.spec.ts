import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '..');

const readAppFile = (...parts: string[]): string => {
  const filePath = path.join(APP_ROOT, ...parts);
  return fs.readFileSync(filePath, 'utf8');
};

describe('Query Safety Regression Guards', () => {
  it('avoids Product.findOne select name pattern in task/checkin/member notification flows', () => {
    const files = [
      readAppFile('modules', 'app-plane', 'tasks', 'tasks.service.ts'),
      readAppFile('modules', 'app-plane', 'products', 'project-checkins.service.ts'),
      readAppFile('modules', 'app-plane', 'products', 'product-members.service.ts'),
    ];

    const riskyPattern = /getRepository\(Product\)\.findOne\(\{[\s\S]{0,200}?select:\s*\['name'\]/m;

    for (const source of files) {
      expect(source).not.toMatch(riskyPattern);
      expect(source).toMatch(/resolveProductName\(/);
    }
  });

  it('avoids distinct+skip/take anti-pattern in products and checkins pagination', () => {
    const productsService = readAppFile('modules', 'app-plane', 'products', 'products.service.ts');
    const checkinsService = readAppFile('modules', 'app-plane', 'products', 'project-checkins.service.ts');

    const riskyDistinctSkipTake = /distinct\(true\)[\s\S]{0,240}\.skip\(|\.skip\([\s\S]{0,120}\.take\(/m;

    expect(productsService).not.toMatch(riskyDistinctSkipTake);
    expect(checkinsService).not.toMatch(riskyDistinctSkipTake);

    expect(productsService).toMatch(/\.limit\(cappedLimit\)/);
    expect(productsService).toMatch(/\.offset\(\(effectivePage - 1\) \* cappedLimit\)/);

    expect(checkinsService).toMatch(/basePastQb/);
    expect(checkinsService).toMatch(/\.limit\(safePastLimit\)/);
    expect(checkinsService).toMatch(/\.offset\(\(safePastPage - 1\) \* safePastLimit\)/);
  });
});
