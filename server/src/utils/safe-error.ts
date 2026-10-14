// Upstream exceptions can contain Authorization headers, signed URLs and
// personal data. Log only bounded diagnostic identifiers, never the object.
export function safeError(error: unknown) {
  const value = error as { name?: unknown; code?: unknown; response?: { status?: unknown } } | null
  const identifier = (input: unknown) => typeof input === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(input) ? input : undefined
  return {
    name: identifier(value?.name) || 'Error',
    code: identifier(value?.code),
    status: typeof value?.response?.status === 'number' ? value.response.status : undefined,
  }
}
