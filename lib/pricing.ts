/**
 * Shared pricing helpers. The effective (payable) price is always derived from
 * the trusted regular/sale values stored in the database — never from the
 * client. A sale price is only valid when it is positive and strictly lower
 * than the regular price.
 */
export function getValidSalePrice(
  regularPrice: number | null | undefined,
  salePrice: number | null | undefined,
): number | null {
  const regular = Number(regularPrice ?? 0);
  const sale = Number(salePrice ?? 0);
  if (sale > 0 && regular > 0 && sale < regular) return sale;
  return null;
}

export function getEffectivePrice(
  regularPrice: number | null | undefined,
  salePrice: number | null | undefined,
): number {
  const regular = Number(regularPrice ?? 0);
  const sale = getValidSalePrice(regularPrice, salePrice);
  return sale ?? regular;
}

/** Returns true when a valid sale price should be displayed. */
export function hasSale(
  regularPrice: number | null | undefined,
  salePrice: number | null | undefined,
): boolean {
  return getValidSalePrice(regularPrice, salePrice) !== null;
}