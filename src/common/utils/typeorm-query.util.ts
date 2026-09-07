import {
  FindManyOptions,
  FindOptionsWhere,
  ILike,
  FindOptionsOrder,
} from 'typeorm';
import { BaseQueryDto } from '../dto/base-query.dto';
import { PaginationMetaDto } from '../dto/pagination.dto';

export interface QueryBuilderConfig<Entity> {
  queryDto: BaseQueryDto;
  searchableColumns?: Array<keyof Entity>;
  sortableColumns?: Array<keyof Entity>;
  defaultSort?: keyof Entity;
  customFilters?: FindOptionsWhere<Entity>;
}

/**
 * Builds a strict TypeORM FindManyOptions object handling Pagination, Global Search, and Custom Filters.
 */
export function buildFindOptions<Entity>(
  config: QueryBuilderConfig<Entity>,
): FindManyOptions<Entity> {
  const {
    queryDto,
    searchableColumns = [],
    sortableColumns = [],
    defaultSort,
    customFilters = {},
  } = config;

  const { page, limit, search, sortBy, sortOrder } = queryDto;
  const skip = (page - 1) * limit;

  // 1. Build Where Conditions (Merge Search ORs with Custom ANDs)
  let whereConditions: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[] =
    customFilters;

  if (search && searchableColumns.length > 0) {
    const searchPattern = `%${search}%`;
    whereConditions = searchableColumns.map(
      (col): FindOptionsWhere<Entity> => ({
        ...customFilters,
        [col]: ILike(searchPattern),
      }),
    );
  }

  // 2. Build Order Options safely to prevent SQL Injection
  const sortCol =
    sortBy && sortableColumns.includes(sortBy as keyof Entity)
      ? (sortBy as keyof Entity)
      : defaultSort;

  const orderOptions = (
    sortCol ? { [sortCol]: sortOrder } : {}
  ) as FindOptionsOrder<Entity>;

  // 3. Return strictly typed TypeORM options
  return {
    where: whereConditions,
    order: orderOptions,
    skip,
    take: limit,
  };
}

/**
 * Automatically builds the standardized PaginationMetaDto from a query and total count.
 */
export function buildPaginationMeta(
  queryDto: BaseQueryDto,
  totalItems: number,
): PaginationMetaDto {
  const { page, limit } = queryDto;
  const skip = (page - 1) * limit;
  return PaginationMetaDto.fromOffset(skip, limit, totalItems);
}
