// Shared across WeChat's separate tab-bar instances. Keep the last tap while
// the native router is switching; never launch competing switchTab calls.
export class TabNavigationController {
  private desiredRoute: string | null = null
  private switching = false
  private listeners = new Set<(route: string) => void>()

  constructor(
    private route: string,
    private navigate: (route: string) => Promise<unknown>,
    private onError: () => void,
  ) {}

  subscribe(listener: (route: string) => void) {
    this.listeners.add(listener)
    listener(this.route)
    return () => { this.listeners.delete(listener) }
  }

  sync(route: string) {
    this.route = route
    this.listeners.forEach(listener => listener(route))
  }

  request(route: string) {
    this.desiredRoute = route
    this.flush()
  }

  private flush() {
    if (this.switching || !this.desiredRoute) return
    if (this.desiredRoute === this.route) {
      this.desiredRoute = null
      return
    }
    const target = this.desiredRoute
    this.switching = true
    Promise.resolve().then(() => this.navigate(target)).then(() => {
      this.sync(target)
    }).catch(() => {
      // A newer queued destination can still succeed; avoid interrupting it
      // with a toast for a superseded request.
      if (this.desiredRoute === target) this.onError()
    }).finally(() => {
      this.switching = false
      if (this.desiredRoute === target) this.desiredRoute = null
      this.flush()
    })
  }
}
