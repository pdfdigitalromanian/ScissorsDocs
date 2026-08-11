const API_BASE_URL = (import.meta.env.VITE_TOOLS_API_BASE_URL ?? '').replace(
  /\/$/,
  '',
)

export type ToolExecutionResult =
  | {
      kind: 'download'
      blob: Blob
      filename: string
    }
  | {
      kind: 'json'
      data: Record<string, unknown>
    }

export class ToolsApiError extends Error {
  readonly serverAvailable: boolean

  constructor(
    message: string,
    serverAvailable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ToolsApiError'
    this.serverAvailable = serverAvailable
  }
}

function responseFilename(response: Response): string {
  const disposition = response.headers.get('content-disposition') ?? ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) return decodeURIComponent(encoded.replace(/^"|"$/g, ''))
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'result'
}

async function responseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string }
    return payload.detail ?? `The server returned ${response.status}.`
  } catch {
    return `The server returned ${response.status}.`
  }
}

export async function executeTool(
  toolId: string,
  files: File[],
  options: Record<string, string | number | boolean>,
): Promise<ToolExecutionResult> {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  form.append('options', JSON.stringify(options))

  let response: Response
  try {
    response = await fetch(
      `${API_BASE_URL}/api/tools/${encodeURIComponent(toolId)}`,
      {
        method: 'POST',
        body: form,
      },
    )
  } catch (error) {
    throw new ToolsApiError(
      'The Python tools server is unavailable. Start it with npm run server.',
      false,
      { cause: error },
    )
  }

  if (!response.ok) {
    throw new ToolsApiError(await responseError(response), true)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return {
      kind: 'json',
      data: (await response.json()) as Record<string, unknown>,
    }
  }

  return {
    kind: 'download',
    blob: await response.blob(),
    filename: responseFilename(response),
  }
}

export async function checkToolsServer(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`)
    return response.ok
  } catch {
    return false
  }
}
