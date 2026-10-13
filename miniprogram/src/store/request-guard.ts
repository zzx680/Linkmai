export interface CaseRequestContext {
  caseId: string
  epoch: number
}

export class CaseRequestGuard {
  private epoch = 0
  private activeCaseId: string | null = null

  invalidate(): number {
    this.epoch += 1
    this.activeCaseId = null
    return this.epoch
  }

  activate(caseId: string): CaseRequestContext {
    this.epoch += 1
    this.activeCaseId = caseId
    return { caseId, epoch: this.epoch }
  }

  capture(caseId: string): CaseRequestContext {
    return { caseId, epoch: this.epoch }
  }

  isCurrent(context: CaseRequestContext): boolean {
    return this.activeCaseId === context.caseId && this.epoch === context.epoch
  }

  getSnapshot(): { activeCaseId: string | null; epoch: number } {
    return { activeCaseId: this.activeCaseId, epoch: this.epoch }
  }
}
