import { CreateProductDto } from '../../products/dto/create-product.dto';

/**
 * SubmitProductRequestDto
 * Re-uses CreateProductDto validation rules — same fields, same constraints.
 * The payload is serialized as JSONB and deserialized on approval.
 */
export class SubmitProductRequestDto extends CreateProductDto {}
