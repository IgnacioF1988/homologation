// Barrel export para hooks

export { default as useFormState, getInitialFormState } from './useFormState';
export { default as useFormMode, FORM_MODES } from './useFormMode';
export { default as useFieldCascade } from './useFieldCascade';
export { default as useInstrumentLookup } from './useInstrumentLookup';
export { default as useDuplicateValidation } from './useDuplicateValidation';
export { default as useFormValidation } from './useFormValidation';
export { default as useCatalogOptions } from './useCatalogOptions';

// DEPRECATED: useInvestmentTypeConfig - usar useAssetTypeConfig en su lugar
// Re-export para compatibilidad hacia atras - eventualmente remover
export { default as useInvestmentTypeConfig } from './useInvestmentTypeConfig';

// Helpers de tipos - ahora vienen de config/assetTypes
export {
  isEquity,
  isFixedIncome,
  isCash,
  isDerivative,
  isFund,
  isBBG,
  normalizeAssetType as normalizeInvestmentType,
  getAssetTypeConfig,
  getAvailableTypes as getAvailableInvestmentTypes,
  registerAssetType as registerInvestmentType,
} from '../config/assetTypes';

// Constantes de tipos - IDs numéricos del catálogo cat.investmentTypes
export const INVESTMENT_TYPES = {
  NO_APLICA: 0,
  FIXED_INCOME: 1,
  EQUITY: 2,
  CASH: 3,
  PAYABLE_RECEIVABLE: 4,
  BANK_DEBT: 5,
  FUND: 6,
  DERIVATIVE: 7,
};

export { default as useCompanyAutocomplete, COMPANY_STATES } from './useCompanyAutocomplete';
export { default as useSectionVisibility } from './useSectionVisibility';
export { default as useAssetTypeConfig } from './useAssetTypeConfig';
