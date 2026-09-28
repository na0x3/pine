export interface KYCProvider { getStatus(customerId: string): Promise<{ status: string; checkedAt: string | null }> }
export interface SanctionsProvider { screenIndividual(name: string): Promise<{ potentialMatches: number | null }>; screenBusiness(name: string): Promise<{ potentialMatches: number | null }> }
export interface TransactionProvider { getTransaction(id: string): Promise<unknown> }
export interface FraudProvider { scoreTransaction(id: string): Promise<{ score: number | null }> }
export interface BlockchainRiskProvider { analyzeWallet(address: string): Promise<{ score: number | null }>; analyzeTransaction(hash: string): Promise<{ score: number | null }> }
export interface IdentityProvider { verifyCustomer(id: string): Promise<{ verified: boolean | null }> }
export interface DocumentProvider { listCustomerDocuments(id: string): Promise<Array<{ id: string; label: string }>> }

// Mock providers deliberately return unknown/empty results. They are not screening decisions.
export const mockProviders = {
  kyc: { async getStatus() { return { status: 'UNKNOWN', checkedAt: null }; } } satisfies KYCProvider,
  sanctions: { async screenIndividual() { return { potentialMatches: null }; }, async screenBusiness() { return { potentialMatches: null }; } } satisfies SanctionsProvider,
  transactions: { async getTransaction() { return null; } } satisfies TransactionProvider,
  fraud: { async scoreTransaction() { return { score: null }; } } satisfies FraudProvider,
  blockchain: { async analyzeWallet() { return { score: null }; }, async analyzeTransaction() { return { score: null }; } } satisfies BlockchainRiskProvider,
  identity: { async verifyCustomer() { return { verified: null }; } } satisfies IdentityProvider,
  documents: { async listCustomerDocuments() { return []; } } satisfies DocumentProvider,
};
