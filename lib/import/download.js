/**
 * Downloads an official file with a timeout, a size limit and retries with
 * exponential backoff. Used only when a source has a direct file URL; the PMBI
 * and NPPA lists currently have none, so those files are downloaded by hand.
 */

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export class DownloadError extends Error {
  constructor(message, { status = null, attempts = 0 } = {}) {
    super(message);
    this.status = status;
    this.attempts = attempts;
  }
}

/**
 * @param {string} url
 * @param {{timeoutMs?:number, retries?:number, baseDelayMs?:number, maxBytes?:number,
 *          fetchImpl?:typeof fetch, sleep?:(ms:number)=>Promise<void>, userAgent?:string}} [options]
 * @returns {Promise<{bytes:Buffer, contentType:string|null, url:string, attempts:number}>}
 */
export async function downloadFile(url, options = {}) {
  const {
    timeoutMs = 60_000,
    retries = 3,
    baseDelayMs = 2_000,
    maxBytes = 50 * 1024 * 1024,
    fetchImpl = fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    userAgent = 'SaltSaver-data-import/1.0',
  } = options;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new DownloadError(`Not a valid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new DownloadError('Only http(s) URLs can be downloaded.');

  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
        headers: { 'User-Agent': userAgent, Accept: '*/*' },
      });
      if (!response.ok) {
        const error = new DownloadError(`HTTP ${response.status} from ${parsed.host}`, { status: response.status, attempts: attempt });
        if (!RETRYABLE.has(response.status)) throw Object.assign(error, { final: true });
        throw error;
      }
      const declared = Number(response.headers.get('content-length'));
      if (declared > maxBytes) throw Object.assign(new DownloadError(`File is larger than ${maxBytes} bytes.`, { attempts: attempt }), { final: true });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > maxBytes) throw Object.assign(new DownloadError(`File is larger than ${maxBytes} bytes.`, { attempts: attempt }), { final: true });
      if (bytes.length === 0) throw new DownloadError('The server sent an empty file.', { attempts: attempt });
      return { bytes, contentType: response.headers.get('content-type'), url: response.url || url, attempts: attempt };
    } catch (error) {
      lastError = error instanceof DownloadError ? error : new DownloadError(error.name === 'TimeoutError' ? `Timed out after ${timeoutMs} ms` : error.message, { attempts: attempt });
      lastError.attempts = attempt;
      if (error.final || attempt > retries) break;
      await sleep(baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
    }
  }
  throw lastError;
}
