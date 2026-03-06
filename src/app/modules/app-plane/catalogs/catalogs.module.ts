import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';
import { Catalog } from './entities/catalog.entity';
import { CatalogItem } from './entities/catalog-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Catalog, CatalogItem])],
  controllers: [CatalogsController],
  providers: [CatalogsService],
  exports: [CatalogsService]
})
export class CatalogsModule {}
