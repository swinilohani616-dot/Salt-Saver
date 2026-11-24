/** Importer registry: source id -> adapter, plus the short names used on the command line. */
import { pmbiAdapter } from './pmbi.js';
import { nppaAdapter } from './nppa.js';
import { brandAdapter } from './brands.js';
import { brandPriceAdapter } from './brandPrices.js';

export const ADAPTERS = {
  [pmbiAdapter.sourceId]: pmbiAdapter,
  [nppaAdapter.sourceId]: nppaAdapter,
  [brandAdapter.sourceId]: brandAdapter,
  [brandPriceAdapter.sourceId]: brandPriceAdapter,
};

export const COMMAND_NAMES = {
  ja: pmbiAdapter.sourceId,
  pmbi: pmbiAdapter.sourceId,
  nppa: nppaAdapter.sourceId,
  brands: brandAdapter.sourceId,
  'brand-prices': brandPriceAdapter.sourceId,
};
