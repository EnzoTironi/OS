/**
 * Speakable History projection. Internal ids stay off the data path.
 * Speaker does not open a History Connect client. Inject in tests only.
 */
export interface HistoryExplanation {
  readonly complete: boolean;
  readonly explanationDigest: string;
  readonly labels: readonly string[];
  readonly operationId: string;
}

export interface HistoryQueryClient {
  explain(operationId: string): Promise<HistoryExplanation | undefined>;
}
