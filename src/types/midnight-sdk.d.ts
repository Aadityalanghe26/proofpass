/**
 * Type stubs for @midnight-ntwrk/midnight-js-contracts
 * Real package installed at deployment time from the Midnight registry.
 */
declare module '@midnight-ntwrk/midnight-js-contracts' {
  export interface MidnightProvider {
    contractAddress: string;
  }
  export interface ContractLedger {
    income_threshold:    bigint;
    networth_threshold:  bigint;
    total_verifications: bigint;
    is_accredited:       boolean;
  }
  export interface WitnessProvider {
    [key: string]: () => bigint | string | boolean;
  }
  export class Contract {
    constructor(provider: MidnightProvider);
    callTx: {
      prove_accreditation(args: Record<string, unknown>, witnesses: WitnessProvider): Promise<void>;
      reset_accreditation(args: Record<string, unknown>, witnesses: Record<string, unknown>): Promise<void>;
    };
    ledger(): Promise<ContractLedger>;
  }
  export function createMidnightProvider(options: { contractAddress: string }): Promise<MidnightProvider>;
}
