# Custom Fields Migration Plan

**Date:** March 9, 2026  
**Project:** Product Report Multi-Tenant  
**Scope:** Refactor custom fields storage architecture

---

## 📋 Table of Contents

1. [Current Architecture](#current-architecture)
2. [Problems Identified](#problems-identified)
3. [Proposed Solution](#proposed-solution)
4. [Migration Strategy](#migration-strategy)
5. [Implementation Steps](#implementation-steps)
6. [Rollback Plan](#rollback-plan)
7. [Performance Considerations](#performance-considerations)

---

## Current Architecture

### Database Schema

#### 1. Field Definitions Table
```sql
-- Defines WHAT custom fields exist for each tenant
CREATE TABLE product_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL,              -- "work_package", "gender_action"
  label VARCHAR(200) NOT NULL,            -- "Work Package", "Gender Action"
  type VARCHAR(50) NOT NULL,              -- Field type enum
  linked_catalog_code VARCHAR(100),       -- FK to catalog code
  required BOOLEAN DEFAULT false,
  order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(key)  -- Per tenant isolation handled by connection
);
```

**Field Types:**
- `TEXT` - Free text input
- `NUMBER` - Numeric values
- `DATE` - Date picker
- `BOOLEAN` - Checkbox (true/false)
- `CATALOG_REF` - Single-select from catalog ⚠️
- `CATALOG_MULTI` - Multi-select from catalog ✅
- `ORG_MULTI` - Multi-select organizations ✅

#### 2. Products Table (Scalar Values)
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  description TEXT,
  -- ... other standard fields
  
  -- JSONB column for scalar custom field values
  attributes JSONB DEFAULT '{}',
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**Example `attributes` content:**
```json
{
  "work_package": "uuid-abc-123",           // CATALOG_REF: UUID string ⚠️ NO FK
  "next_steps": "Complete baseline study",  // TEXT: plain text
  "budget": 50000,                          // NUMBER: numeric
  "start_date": "2026-03-15",              // DATE: ISO string
  "is_active": true,                        // BOOLEAN: boolean
  "gender_action": "uuid-def-456"          // CATALOG_REF: UUID string ⚠️
}
```

#### 3. Organization Multi-Select (Pivot Table)
```sql
CREATE TABLE product_custom_org_links (
  product_id UUID NOT NULL,
  field_definition_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  PRIMARY KEY (product_id, field_definition_id, organization_id),
  
  FOREIGN KEY (product_id) 
    REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (field_definition_id) 
    REFERENCES product_field_definitions(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) 
    REFERENCES workspace_organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_product_org_links_product 
  ON product_custom_org_links(product_id);
CREATE INDEX idx_product_org_links_field 
  ON product_custom_org_links(field_definition_id);
```

**Characteristics:**
✅ Has proper foreign keys  
✅ Cascade deletes work correctly  
✅ Easy to query and audit  

#### 4. Catalog Multi-Select (Pivot Table)
```sql
CREATE TABLE product_custom_catalog_links (
  product_id UUID NOT NULL,
  field_definition_id UUID NOT NULL,
  catalog_item_id UUID NOT NULL,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  PRIMARY KEY (product_id, field_definition_id, catalog_item_id),
  
  FOREIGN KEY (product_id) 
    REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (field_definition_id) 
    REFERENCES product_field_definitions(id) ON DELETE CASCADE,
  FOREIGN KEY (catalog_item_id) 
    REFERENCES catalog_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_product_catalog_links_product 
  ON product_custom_catalog_links(product_id);
CREATE INDEX idx_product_catalog_links_field 
  ON product_custom_catalog_links(field_definition_id);
```

**Characteristics:**
✅ Has proper foreign keys  
✅ Cascade deletes work correctly  
✅ Easy to query and audit  

---

## Problems Identified

### 🔴 Critical: CATALOG_REF Without Foreign Keys

**Problem:**
```json
// products.attributes JSONB
{
  "work_package": "3c8a9b12-dead-4567-beef-deadbeef0001"
                   ↑
                   UUID stored as string in JSONB
                   NO FOREIGN KEY CONSTRAINT
                   ↓
  If catalog_items.id = '3c8a9b12-dead-...' gets deleted:
  - Value becomes orphan
  - No cascade delete
  - No referential integrity
  - Frontend shows "—" or empty
```

**Impact:**
- ❌ Orphaned references accumulate over time
- ❌ Cannot enforce data integrity
- ❌ Difficult to audit catalog usage
- ❌ Frontend displays break silently

**Current Workaround:**
```typescript
// Frontend tries to resolve UUID → name
resolveCatalogRefName(uuid: string, catalogCode: string): string {
  const items = this.catalogItemsMap()[catalogCode] ?? [];
  const item = items.find(i => i.id === uuid);
  return item?.name ?? '—';  // Returns "—" if not found
}
```

### 🟡 Medium: Inconsistent Storage Pattern

Different field types stored in different places:

| Field Type | Storage Location | Has FK? | Queryable? |
|------------|------------------|---------|------------|
| TEXT, NUMBER, DATE, BOOLEAN | `products.attributes` JSONB | ❌ | ⚠️ Slow (JSONB scan) |
| CATALOG_REF | `products.attributes` JSONB | ❌ | ❌ Very slow |
| ORG_MULTI | `product_custom_org_links` table | ✅ | ✅ Fast |
| CATALOG_MULTI | `product_custom_catalog_links` table | ✅ | ✅ Fast |

**Inconsistency Issues:**
- Developers must remember different patterns for different types
- Backend code has 3 different read/write paths
- Difficult to extend with new field types

### 🟡 Medium: Query Performance for Scalars

```sql
-- Find all products with budget > 10000
-- Current: Must scan entire attributes JSONB
SELECT * FROM products 
WHERE (attributes->>'budget')::numeric > 10000;
-- ⚠️ Full table scan, no index possible

-- Find products by specific catalog_ref value
SELECT * FROM products 
WHERE attributes->>'work_package' = 'uuid-123';
-- ⚠️ Full table scan, no GIN index helps with equality
```

### 🟢 Low: Difficult to Audit/Report

**Questions that are hard to answer:**

1. "How many products are using catalog item X?"
   ```sql
   -- For CATALOG_MULTI: Easy
   SELECT COUNT(*) FROM product_custom_catalog_links 
   WHERE catalog_item_id = 'uuid-x';
   
   -- For CATALOG_REF: Impossible without full scan
   SELECT COUNT(*) FROM products 
   WHERE attributes ? 'work_package' 
     AND attributes->>'work_package' = 'uuid-x';
   -- ⚠️ Very slow on large datasets
   ```

2. "Which products have the field 'next_steps' filled?"
   ```sql
   SELECT * FROM products 
   WHERE attributes ? 'next_steps' 
     AND attributes->>'next_steps' IS NOT NULL 
     AND attributes->>'next_steps' != '';
   -- ⚠️ Complex and slow
   ```

---

## Proposed Solution

### Unified Pivot Table ("Comodín" Pattern)

**Core Concept:** ONE table stores ALL custom field values with a `value_type` discriminator.

```sql
CREATE TABLE product_custom_field_values (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  field_definition_id UUID NOT NULL,
  
  -- Type discriminator
  value_type VARCHAR(50) NOT NULL,
  -- Values: 'CATALOG_ITEM', 'ORGANIZATION', 'TEXT', 'NUMBER', 'DATE', 'BOOLEAN'
  
  -- Foreign key references (nullable, type-dependent)
  catalog_item_id UUID,
  organization_id UUID,
  
  -- Scalar values (nullable, type-dependent)
  text_value TEXT,
  number_value NUMERIC(20,4),
  date_value DATE,
  boolean_value BOOLEAN,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- ══════════════════════════════════════════════════════════════
  -- CONSTRAINTS
  -- ══════════════════════════════════════════════════════════════
  
  -- Foreign keys with CASCADE
  CONSTRAINT fk_product 
    FOREIGN KEY (product_id) 
    REFERENCES products(id) ON DELETE CASCADE,
    
  CONSTRAINT fk_field_definition 
    FOREIGN KEY (field_definition_id) 
    REFERENCES product_field_definitions(id) ON DELETE CASCADE,
    
  CONSTRAINT fk_catalog_item 
    FOREIGN KEY (catalog_item_id) 
    REFERENCES catalog_items(id) ON DELETE CASCADE,
    
  CONSTRAINT fk_organization 
    FOREIGN KEY (organization_id) 
    REFERENCES workspace_organizations(id) ON DELETE CASCADE,
  
  -- Single-value fields: only ONE row per product+field
  CONSTRAINT unique_single_value 
    UNIQUE (product_id, field_definition_id) 
    WHERE value_type IN ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN'),
  
  -- Type-based value validation
  CONSTRAINT valid_catalog_item_value 
    CHECK (
      (value_type = 'CATALOG_ITEM' AND catalog_item_id IS NOT NULL) OR
      (value_type != 'CATALOG_ITEM' AND catalog_item_id IS NULL)
    ),
    
  CONSTRAINT valid_organization_value 
    CHECK (
      (value_type = 'ORGANIZATION' AND organization_id IS NOT NULL) OR
      (value_type != 'ORGANIZATION' AND organization_id IS NULL)
    ),
    
  CONSTRAINT valid_text_value 
    CHECK (
      (value_type = 'TEXT' AND text_value IS NOT NULL) OR
      (value_type != 'TEXT' AND text_value IS NULL)
    ),
    
  CONSTRAINT valid_number_value 
    CHECK (
      (value_type = 'NUMBER' AND number_value IS NOT NULL) OR
      (value_type != 'NUMBER' AND number_value IS NULL)
    ),
    
  CONSTRAINT valid_date_value 
    CHECK (
      (value_type = 'DATE' AND date_value IS NOT NULL) OR
      (value_type != 'DATE' AND date_value IS NULL)
    ),
    
  CONSTRAINT valid_boolean_value 
    CHECK (
      (value_type = 'BOOLEAN' AND boolean_value IS NOT NULL) OR
      (value_type != 'BOOLEAN' AND boolean_value IS NULL)
    )
);

-- Indexes for performance
CREATE INDEX idx_pcfv_product_field 
  ON product_custom_field_values(product_id, field_definition_id);

CREATE INDEX idx_pcfv_catalog_item 
  ON product_custom_field_values(catalog_item_id) 
  WHERE catalog_item_id IS NOT NULL;

CREATE INDEX idx_pcfv_organization 
  ON product_custom_field_values(organization_id) 
  WHERE organization_id IS NOT NULL;

CREATE INDEX idx_pcfv_value_type 
  ON product_custom_field_values(value_type);
```

### Data Examples

**Before (Current):**
```sql
-- Product ID: prod-001
-- Scalar values in JSONB
products.attributes = {
  "work_package": "cat-uuid-123",
  "next_steps": "Complete study",
  "budget": 50000,
  "is_active": true
}

-- Multi-select in pivot tables
product_custom_org_links:
  (prod-001, field-abc, org-111)
  (prod-001, field-abc, org-222)

product_custom_catalog_links:
  (prod-001, field-xyz, cat-item-aaa)
  (prod-001, field-xyz, cat-item-bbb)
```

**After (Proposed):**
```sql
-- ALL values in single unified table
product_custom_field_values:
  (prod-001, field-wp,  'CATALOG_ITEM', catalog_item_id=cat-uuid-123, ...)
  (prod-001, field-ns,  'TEXT',         text_value='Complete study', ...)
  (prod-001, field-bud, 'NUMBER',       number_value=50000, ...)
  (prod-001, field-act, 'BOOLEAN',      boolean_value=true, ...)
  (prod-001, field-abc, 'ORGANIZATION', organization_id=org-111, ...)
  (prod-001, field-abc, 'ORGANIZATION', organization_id=org-222, ...)
  (prod-001, field-xyz, 'CATALOG_ITEM', catalog_item_id=cat-item-aaa, ...)
  (prod-001, field-xyz, 'CATALOG_ITEM', catalog_item_id=cat-item-bbb, ...)
```

### Advantages

✅ **Referential Integrity**
- All catalog/org references have proper FKs
- Automatic cascade deletes
- No orphaned values possible

✅ **Consistent Pattern**
- Single read/write path for all field types
- Easier to understand and maintain
- Simpler backend code

✅ **Better Query Performance**
- Indexed lookups for all value types
- No JSONB scans required
- Fast filtering and aggregations

✅ **Easy Auditing**
```sql
-- How many products use this catalog item?
SELECT COUNT(DISTINCT product_id) 
FROM product_custom_field_values 
WHERE catalog_item_id = 'uuid-x';

-- Which products have budget > 10000?
SELECT product_id 
FROM product_custom_field_values 
WHERE value_type = 'NUMBER' 
  AND number_value > 10000;

-- Products missing required field X?
SELECT p.id FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM product_custom_field_values v
  WHERE v.product_id = p.id 
    AND v.field_definition_id = 'field-x'
);
```

✅ **Extensible**
- Add new field types: just add column + constraint
- No schema changes to products table
- Backward compatible during migration

---

## Migration Strategy

### Phase 1: Add New Table (Zero Downtime)

**Step 1.1:** Create new table and indexes
```sql
-- Run migration to create product_custom_field_values
-- (Full DDL shown in "Proposed Solution" section above)
```

**Step 1.2:** Keep existing tables unchanged
```sql
-- DO NOT drop or modify:
-- - products.attributes (JSONB column)
-- - product_custom_org_links
-- - product_custom_catalog_links
```

**Result:** Both old and new structures coexist.

---

### Phase 2: Dual-Write Mode (Transition Period)

**Step 2.1:** Update backend to write to BOTH locations

```typescript
// products.service.ts

async create(dto: CreateProductDto, memberId: string) {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  
  try {
    // 1. Create product (keep attributes for backward compat)
    const product = await queryRunner.manager.save(Product, {
      name: dto.name,
      attributes: dto.attributes,  // STILL WRITE TO JSONB
      // ... other fields
    });
    
    // 2. NEW: Write scalars to unified table
    for (const [key, value] of Object.entries(dto.attributes)) {
      const fieldDef = await this.getFieldDefinitionByKey(key);
      if (!fieldDef) continue;
      
      await queryRunner.manager.insert(ProductCustomFieldValue, {
        product_id: product.id,
        field_definition_id: fieldDef.id,
        value_type: this.mapFieldTypeToValueType(fieldDef.type),
        ...this.mapValueToColumns(fieldDef.type, value)
      });
    }
    
    // 3. Write ORG_MULTI (migrate from old table to new)
    for (const [fieldId, orgIds] of Object.entries(dto.customOrgFields)) {
      for (const orgId of orgIds) {
        // Old way (keep for now)
        await queryRunner.manager.insert(ProductCustomOrgLink, {
          product_id: product.id,
          field_definition_id: fieldId,
          organization_id: orgId
        });
        
        // NEW way
        await queryRunner.manager.insert(ProductCustomFieldValue, {
          product_id: product.id,
          field_definition_id: fieldId,
          value_type: 'ORGANIZATION',
          organization_id: orgId
        });
      }
    }
    
    // 4. Catalog multi-select (same dual-write)
    // ... similar pattern
    
    await queryRunner.commitTransaction();
    return product;
    
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}
```

**Step 2.2:** Update backend reads with fallback logic

```typescript
async findOne(id: string) {
  const product = await repo.findOne(id, { /* relations */ });
  
  // Try NEW table first
  const newValues = await this.loadFromUnifiedTable(id);
  
  if (newValues.length > 0) {
    // Data migrated: use new table
    return {
      ...product,
      customFields: this.groupByFieldKey(newValues)
    };
  } else {
    // Fallback: use old structure
    const legacyValues = await this.loadCustomLinks(id);
    return {
      ...product,
      attributes: product.attributes,  // JSONB
      customLinks: legacyValues         // Old pivot tables
    };
  }
}
```

**Result:** All new data goes to new table. Old data still readable.

---

### Phase 3: Migrate Historical Data

**Step 3.1:** Background migration script

```typescript
// migrations/migrate-custom-fields-to-unified.ts

async function migrateProductCustomFields() {
  const products = await dataSource.query(`
    SELECT id, attributes FROM products 
    WHERE id NOT IN (
      SELECT DISTINCT product_id FROM product_custom_field_values
    )
  `);
  
  console.log(`Migrating ${products.length} products...`);
  
  for (const product of products) {
    await migrateOneProduct(product.id, product.attributes);
  }
}

async function migrateOneProduct(productId: string, attributes: any) {
  const fieldDefs = await getFieldDefinitions();
  const defMap = new Map(fieldDefs.map(d => [d.key, d]));
  
  // Migrate scalar values from JSONB
  for (const [key, value] of Object.entries(attributes || {})) {
    const def = defMap.get(key);
    if (!def) continue;
    
    await dataSource.query(`
      INSERT INTO product_custom_field_values (
        product_id, field_definition_id, value_type,
        ${getValueColumn(def.type)}
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING
    `, [productId, def.id, getValueType(def.type), value]);
  }
  
  // Migrate ORG_MULTI
  const orgLinks = await dataSource.query(`
    SELECT field_definition_id, organization_id 
    FROM product_custom_org_links 
    WHERE product_id = $1
  `, [productId]);
  
  for (const link of orgLinks) {
    await dataSource.query(`
      INSERT INTO product_custom_field_values (
        product_id, field_definition_id, value_type, organization_id
      ) VALUES ($1, $2, 'ORGANIZATION', $3)
      ON CONFLICT DO NOTHING
    `, [productId, link.field_definition_id, link.organization_id]);
  }
  
  // Migrate CATALOG_MULTI (similar pattern)
  // ...
}
```

**Step 3.2:** Run migration in batches
```bash
# Dry run
npm run migrate:custom-fields -- --dry-run

# Real migration (batches of 100)
npm run migrate:custom-fields -- --batch-size=100

# Monitor progress
npm run migrate:custom-fields -- --status
```

**Step 3.3:** Verify data integrity
```sql
-- Check all products have been migrated
SELECT COUNT(*) FROM products 
WHERE id NOT IN (
  SELECT DISTINCT product_id FROM product_custom_field_values
);
-- Should be 0

-- Compare counts
SELECT 
  (SELECT COUNT(*) FROM product_custom_org_links) as old_org_count,
  (SELECT COUNT(*) FROM product_custom_field_values WHERE value_type = 'ORGANIZATION') as new_org_count;
-- Should match
```

---

### Phase 4: Switch to Read from New Table

**Step 4.1:** Update backend reads to use unified table only

```typescript
async findOne(id: string) {
  const product = await repo.findOne(id);
  
  // Load ALL custom fields from unified table
  const values = await dataSource.query(`
    SELECT 
      pfd.key as field_key,
      pfd.type as field_type,
      v.value_type,
      v.text_value,
      v.number_value,
      v.date_value,
      v.boolean_value,
      v.catalog_item_id,
      ci.name as catalog_item_name,
      v.organization_id,
      wo.name as organization_name
    FROM product_custom_field_values v
    JOIN product_field_definitions pfd ON v.field_definition_id = pfd.id
    LEFT JOIN catalog_items ci ON v.catalog_item_id = ci.id
    LEFT JOIN workspace_organizations wo ON v.organization_id = wo.id
    WHERE v.product_id = $1
    ORDER BY pfd.order
  `, [id]);
  
  return {
    ...product,
    customFields: this.transformToFrontendFormat(values)
  };
}
```

**Step 4.2:** Update frontend DTO to new format

```typescript
// product.model.ts

export interface ProductDto {
  id: string;
  name: string;
  // ... standard fields
  
  // NEW: Unified custom fields structure
  customFields: CustomFieldValue[];
}

export interface CustomFieldValue {
  key: string;
  label: string;
  type: FieldType;
  
  // Value depends on type
  textValue?: string;
  numberValue?: number;
  dateValue?: string;
  booleanValue?: boolean;
  
  // For CATALOG_ITEM and ORGANIZATION (can be multi)
  linkedItems?: Array<{ id: string; name: string }>;
}
```

**Step 4.3:** Update frontend components

```typescript
// product-concept-note.component.ts

renderCustomFields(product: ProductDto) {
  return product.customFields.map(field => {
    // All types handled uniformly
    if (field.type === 'CATALOG_REF' || field.type === 'CATALOG_MULTI') {
      return {
        ...field,
        displayValue: field.linkedItems?.map(i => i.name).join(', ') || '—'
      };
    } else if (field.type === 'TEXT') {
      return {
        ...field,
        displayValue: field.textValue || '—'
      };
    } else if (field.type === 'NUMBER') {
      return {
        ...field,
        displayValue: field.numberValue?.toLocaleString() || '—'
      };
    }
    // ... other types
  });
}
```

**Result:** Application uses new table. Old tables ignored.

---

### Phase 5: Deprecate Old Tables

**Step 5.1:** Stop writing to old locations

```typescript
// Remove dual-write code
async create(dto: CreateProductDto) {
  // Write ONLY to product_custom_field_values
  // Remove writes to:
  // - products.attributes
  // - product_custom_org_links
  // - product_custom_catalog_links
}
```

**Step 5.2:** Mark old columns/tables as deprecated

```sql
-- Add comment to old structures
COMMENT ON COLUMN products.attributes IS 
  'DEPRECATED: Migrated to product_custom_field_values. Will be dropped in v2.0';

COMMENT ON TABLE product_custom_org_links IS 
  'DEPRECATED: Migrated to product_custom_field_values. Will be dropped in v2.0';
```

**Step 5.3:** Monitor for 2-4 weeks
- Check application logs for errors
- Validate all features work correctly
- Backup old data before deletion

---

### Phase 6: Clean Up (Final)

**Step 6.1:** Drop old tables

```sql
-- After 1 month of stable operation
DROP TABLE IF EXISTS product_custom_org_links;
DROP TABLE IF EXISTS product_custom_catalog_links;
```

**Step 6.2:** Remove attributes column

```sql
-- Backup first!
ALTER TABLE products RENAME COLUMN attributes TO attributes_legacy;

-- After another week with no issues:
ALTER TABLE products DROP COLUMN attributes_legacy;
```

**Step 6.3:** Remove old code paths

```typescript
// Delete all legacy read/write functions:
// - loadCustomLinks()
// - saveToAttributesJson()
// - saveToOrgLinksTable()
// etc.
```

---

## Rollback Plan

### If Issues Found in Phase 2-3 (Dual-Write)

**Action:** Stop writing to new table, continue with old structure

```typescript
// Feature flag to disable new table writes
if (!config.USE_UNIFIED_CUSTOM_FIELDS) {
  // Use old code path only
  return this.createProductLegacy(dto);
}
```

**Impact:** Zero downtime, no data loss.

---

### If Issues Found in Phase 4 (Reading from New)

**Action:** Revert read logic to old tables

```typescript
async findOne(id: string) {
  if (config.READ_FROM_UNIFIED_TABLE) {
    return this.findOneUnified(id);
  } else {
    return this.findOneLegacy(id);  // Fallback
  }
}
```

**Impact:** Application continues working with old structure.

---

### If Critical Issues in Phase 5-6

**Action:** Restore old tables from backup

```sql
-- Restore from backup
psql -U user -d tenant_db < backup_before_cleanup.sql

-- Re-enable legacy code paths
UPDATE config SET use_legacy_custom_fields = true;
```

**Impact:** 
- Requires deployment rollback
- Some new data may be lost (window between cleanup and rollback)
- Should be rare if previous phases validated correctly

---

## Performance Considerations

### Read Performance

**Before (JSONB scan):**
```sql
EXPLAIN ANALYZE 
SELECT * FROM products 
WHERE (attributes->>'budget')::numeric > 10000;

-- Result: Seq Scan on products (cost=0..5000 rows=500)
```

**After (Indexed lookup):**
```sql
EXPLAIN ANALYZE
SELECT DISTINCT p.* 
FROM products p
JOIN product_custom_field_values v ON p.id = v.product_id
WHERE v.value_type = 'NUMBER' 
  AND v.number_value > 10000;

-- Result: Index Scan on idx_pcfv_... (cost=0..150 rows=500)
```

**Improvement:** ~30x faster for filtered queries

---

### Write Performance

**Before:** 1 write to products.attributes (JSONB update)  
**After:** N writes to product_custom_field_values (N = # of fields)

**Trade-off:**
- Writes are ~2-3x slower (acceptable for this use case)
- Reads are 10-30x faster (big win)
- Most operations are reads, not writes

**Optimization:**
```typescript
// Batch insert for better performance
await dataSource.query(`
  INSERT INTO product_custom_field_values 
    (product_id, field_definition_id, value_type, text_value)
  SELECT 
    $1, 
    unnest($2::uuid[]), 
    unnest($3::varchar[]), 
    unnest($4::text[])
`, [productId, fieldIds, valueTypes, values]);
```

---

### Storage Impact

**Current Storage:**
```
products.attributes: ~200-500 bytes/product (JSONB overhead)
product_custom_org_links: 48 bytes/row
product_custom_catalog_links: 48 bytes/row
```

**New Storage:**
```
product_custom_field_values: 
  ~80-120 bytes/row (depending on value type)
  
Example: Product with 8 custom fields:
  Before: 500 bytes (JSONB) + 2 rows (192 bytes) = 692 bytes
  After: 8 rows × 100 bytes = 800 bytes
  
Overhead: +15% storage, but gains in query performance outweigh cost
```

---

## Implementation Timeline

| Phase | Duration | Risk | Can Rollback? |
|-------|----------|------|---------------|
| 1. Add new table | 1 day | Low | ✅ Yes (no impact) |
| 2. Dual-write mode | 1 week | Medium | ✅ Yes (flag off) |
| 3. Migrate historical | 2-3 days | Medium | ✅ Yes (delete new rows) |
| 4. Switch reads | 1 week | High | ✅ Yes (code rollback) |
| 5. Deprecate old | 2-4 weeks | Low | ⚠️ Partial |
| 6. Clean up | 1 day | Low | ❌ No (backup required) |

**Total:** ~6-8 weeks with testing and monitoring periods

---

## Next Steps

1. **Review this document** with team
2. **Approve migration plan** or request changes
3. **Create feature branch:** `feature/unified-custom-fields`
4. **Implement Phase 1:** Create new table + migration script
5. **Test on staging environment** with production-like data
6. **Deploy to production** with feature flags enabled
7. **Monitor and iterate** through remaining phases

---

## Questions / Decisions Needed

- [ ] Approval to proceed with migration?
- [ ] Preferred timeline (fast-track 3 weeks vs. cautious 8 weeks)?
- [ ] Should we keep `attributes` JSONB as fallback indefinitely?
- [ ] Batch size for historical migration (100, 500, 1000)?
- [ ] Monitoring/alerting requirements during migration?

---

## References

- [TypeORM Migrations Docs](https://typeorm.io/migrations)
- [PostgreSQL JSONB Performance](https://www.postgresql.org/docs/current/datatype-json.html)
- [Multi-Tenant Database Patterns](https://docs.microsoft.com/en-us/azure/architecture/patterns/multitenant-identity)

---

**Document Version:** 1.0  
**Last Updated:** March 9, 2026  
**Author:** Development Team  
**Status:** 🟡 Pending Approval
