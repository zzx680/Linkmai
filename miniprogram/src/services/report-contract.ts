export interface ReportContract {
  caseId?: string
  analysis: string
  liability: string
  compensation: string
  recommendations: string[]
  generatedAt: string
}

export interface ReportEnvelope<T extends ReportContract = ReportContract> {
  report: T
}

export interface PendingReport {
  runId: string
  status: 'queued' | 'running'
}

export type ReportGenerationResult<T extends ReportContract = ReportContract> = ReportEnvelope<T> | PendingReport

export function isPendingReport(result: ReportGenerationResult): result is PendingReport {
  return 'runId' in result && (result.status === 'queued' || result.status === 'running')
}

export function readReportEnvelope<T extends ReportContract>(result: ReportEnvelope<T>): T {
  return result.report
}
