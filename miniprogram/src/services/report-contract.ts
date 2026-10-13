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

export function readReportEnvelope<T extends ReportContract>(result: ReportEnvelope<T>): T {
  return result.report
}
