export function createApiRequest({ getSession, fetcher = fetch }) {
  return async (path, { body, signal, ...options } = {}) => {
    const { data, error } = await getSession();
    if (error || !data.session?.access_token) throw new Error('Sign in to continue.');
    const response = await fetcher(`/api${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    });
    if (response.status === 204) return undefined;
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.message ?? 'The request could not be completed.');
      Object.assign(error, { status: response.status, errors: result.errors, correlationId: result.correlationId });
      throw error;
    }
    return result;
  };
}

