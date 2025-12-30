interface RetryOptions {
  maxRetries?: number; // Default: 3
  initialDelayMs?: number; // Default: 1000 (1s)
  maxDelayMs?: number; // Default: 10000 (10s)
  backoffMultiplier?: number; // Default: 2
}

/**
 * Fetches a URL with exponential backoff retry logic for transient failures.
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @param retryOptions - Retry configuration options
 * @returns Promise<Response>
 *
 * Retry behavior:
 * - Retries on: HTTP 429 (rate limit), 500-599 (server errors), network errors
 * - Does NOT retry on: HTTP 400-428, 430-499 (client errors except rate limit)
 * - Uses exponential backoff with jitter to prevent thundering herd
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retryOptions?: RetryOptions
): Promise<Response> {
  const maxRetries = retryOptions?.maxRetries ?? 3;
  const initialDelayMs = retryOptions?.initialDelayMs ?? 1000;
  const maxDelayMs = retryOptions?.maxDelayMs ?? 10000;
  const backoffMultiplier = retryOptions?.backoffMultiplier ?? 2;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Check if we should retry based on status code
      const shouldRetry = shouldRetryStatus(response.status);

      if (!shouldRetry || attempt === maxRetries) {
        // Either success, non-retriable error, or max retries reached
        return response;
      }

      // Log retry attempt
      console.warn(
        `Fetch failed with HTTP ${response.status} for ${url}. Retry ${attempt + 1}/${maxRetries}...`
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is a retriable network error
      const isRetriableError = isNetworkError(error);

      if (!isRetriableError || attempt === maxRetries) {
        // Non-retriable error or max retries reached
        throw lastError;
      }

      // Log retry attempt
      console.warn(
        `Fetch failed with network error for ${url}: ${lastError.message}. Retry ${attempt + 1}/${maxRetries}...`
      );
    }

    // Calculate delay with exponential backoff and jitter
    if (attempt < maxRetries) {
      const baseDelay = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt),
        maxDelayMs
      );

      // Add jitter: random value between 0 and 25% of base delay
      const jitter = Math.random() * 0.25 * baseDelay;
      const delay = baseDelay + jitter;

      console.log(`Waiting ${Math.round(delay)}ms before retry...`);
      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs a return
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Determines if an HTTP status code should trigger a retry.
 */
function shouldRetryStatus(status: number): boolean {
  // Retry on:
  // - 429 (Too Many Requests / Rate Limit)
  // - 500-599 (Server Errors)
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;

  // Don't retry on:
  // - 200-399 (Success / Redirect)
  // - 400-428, 430-499 (Client Errors except rate limit)
  return false;
}

/**
 * Determines if an error is a retriable network error.
 */
function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // Common network error patterns
  const networkErrorPatterns = [
    'network',
    'fetch failed',
    'econnreset',
    'enotfound',
    'etimedout',
    'econnrefused',
  ];

  const errorMessage = error.message.toLowerCase();

  // Check for common network error messages
  if (networkErrorPatterns.some(pattern => errorMessage.includes(pattern))) {
    return true;
  }

  // Check for AbortError (timeout)
  if (error.name === 'AbortError') {
    return true;
  }

  // TypeError often indicates network issues in fetch
  if (error instanceof TypeError) {
    return true;
  }

  return false;
}

/**
 * Sleep helper function.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
