import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import Textarea from '@/components/ui/Textarea'
import { ingestFiles } from '@/features/documents'
import type { ToolDefinition, ToolOptionField } from '../tool-definitions'
import { checkToolsServer, executeTool, ToolsApiError } from '../tools-api'
import {
  getLocalToolHandler,
  isLocalTool,
} from '../local/registry'
import type { LocalToolResult } from '../local/types'

interface ToolRunnerProps {
  tool: ToolDefinition
}

type FieldValues = Record<string, string | boolean>

function initialValues(fields: ToolOptionField[]): FieldValues {
  return Object.fromEntries(
    fields.map((field) => [field.name, field.defaultValue ?? '']),
  )
}

/**
 * Converts a server JSON payload into a downloadable result. Tools that
 * return structured JSON (e.g. the AI tools) become a plain-text file so the
 * result panel never sees a result with a missing `mimeType`.
 */
function jsonToResult(data: Record<string, unknown>): LocalToolResult {
  const maybeBlob = data.blob
  if (
    typeof data.filename === 'string' &&
    typeof data.mimeType === 'string' &&
    maybeBlob instanceof Blob
  ) {
    return data as unknown as LocalToolResult
  }
  const text = JSON.stringify(data, null, 2)
  const bytes = new TextEncoder().encode(text)
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: 'text/plain;charset=utf-8',
  })
  const summary =
    typeof data.summary === 'string' || typeof data.summary_text === 'string'
      ? String(data.summary ?? data.summary_text)
      : ''
  return {
    blob,
    filename: `${toolFilename(data)}.json`,
    mimeType: 'application/json',
    summary,
  }
}

function toolFilename(data: Record<string, unknown>): string {
  if (typeof data.source_filename === 'string') {
    return data.source_filename.replace(/\.[^/.]+$/, '') || 'result'
  }
  return 'result'
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: ToolOptionField
  value: string | boolean
  onChange: (value: string | boolean) => void
}) {
  if (field.type === 'checkbox') {
    return (
      <Checkbox
        label={field.label}
        checked={Boolean(value)}
        onChange={(event) => onChange(event.target.checked)}
      />
    )
  }

  if (field.type === 'textarea') {
    return (
      <Textarea
        label={field.label}
        hint={field.hint}
        required={field.required}
        placeholder={field.placeholder}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  if (field.type === 'select') {
    return (
      <div className="field">
        <label className="field__label" htmlFor={`tool-option-${field.name}`}>
          {field.label}
        </label>
        <select
          id={`tool-option-${field.name}`}
          className="input"
          value={String(value)}
          required={field.required}
          onChange={(event) => onChange(event.target.value)}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {field.hint ? <span className="field__hint">{field.hint}</span> : null}
      </div>
    )
  }

  return (
    <Input
      label={field.label}
      hint={field.hint}
      type={field.type}
      min={field.min}
      max={field.max}
      step={field.type === 'number' ? 'any' : undefined}
      required={field.required}
      placeholder={field.placeholder}
      value={String(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function resultPreview(result: LocalToolResult): string | null {
  if (result.mimeType?.startsWith('image/')) {
    return URL.createObjectURL(result.blob)
  }
  return null
}

function ResultPanel({
  result,
  onStartAnother,
}: {
  result: LocalToolResult
  onStartAnother: () => void
}) {
  const navigate = useNavigate()
  const [openingWorkspace, setOpeningWorkspace] = useState(false)
  const previewUrl = resultPreview(result)
  const [reloadedUrl, setReloadedUrl] = useState(previewUrl)

  useEffect(() => {
    return () => {
      if (reloadedUrl) URL.revokeObjectURL(reloadedUrl)
    }
  }, [reloadedUrl])

  async function handleOpenInWorkspace() {
    const file = new File([result.blob], result.filename, {
      type: result.mimeType,
    })
    setOpeningWorkspace(true)
    try {
      const results = await ingestFiles([file])
      const ids = results
        .map((item) => item.document?.id)
        .filter((id): id is string => Boolean(id))
      if (ids.length === 0) {
        throw new Error('The result could not be opened in the workspace.')
      }
      navigate(`/workspace?docs=${encodeURIComponent(ids.join(','))}`)
    } catch (caught) {
      setOpeningWorkspace(false)
    }
  }

  return (
    <div className="tool-runner__result" aria-live="polite">
      <div className="tool-runner__result-heading">
        <Icon name="check-circle" size="sm" aria-hidden="true" />
        <h2>Done</h2>
      </div>

      {previewUrl ? (
        <div className="tool-runner__result-preview">
          <img
            src={previewUrl}
            alt="Conversion result preview"
            onLoad={() => setReloadedUrl(previewUrl)}
          />
        </div>
      ) : null}

      <div className="tool-runner__result-file">
        <Icon name="file-text" aria-hidden="true" />
        <div>
          <strong>{result.filename}</strong>
          <span>
            {result.mimeType === 'application/pdf'
              ? 'PDF'
              : result.mimeType?.startsWith('image/')
                ? 'Image'
                : 'Text'}
            {result.summary ? ` · ${result.summary}` : ''}
          </span>
        </div>
      </div>

      {result.details?.length ? (
        <dl className="tool-runner__result-details">
          {result.details.map((detail) => (
            <div key={detail.label}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="tool-runner__result-actions">
        <Button
          type="button"
          variant="primary"
          onClick={() => triggerDownload(result.blob, result.filename)}
        >
          <Icon name="download" size="sm" aria-hidden="true" />
          Download
        </Button>
        {result.mimeType === 'application/pdf' ? (
          <Button
            type="button"
            variant="outline"
            disabled={openingWorkspace}
            onClick={handleOpenInWorkspace}
          >
            <Icon name="workspace" size="sm" aria-hidden="true" />
            {openingWorkspace ? 'Opening…' : 'Open in workspace'}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onStartAnother}>
          Start another conversion
        </Button>
      </div>
    </div>
  )
}

export default function ToolRunner({ tool }: ToolRunnerProps) {
  const local = isLocalTool(tool.id)
  const [files, setFiles] = useState<File[]>([])
  const [values, setValues] = useState<FieldValues>(() =>
    initialValues(tool.fields),
  )
  const [running, setRunning] = useState(false)
  const [serverOnline, setServerOnline] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<LocalToolResult | null>(null)
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(
    null,
  )

  useEffect(() => {
    if (local) return
    let active = true
    void checkToolsServer().then((online) => {
      if (active) setServerOnline(online)
    })
    return () => {
      active = false
    }
  }, [local])

  const selectedFiles = useMemo(
    () =>
      files.map((file) => `${file.name} · ${(file.size / 1024).toFixed(1)} KB`),
    [files],
  )

  function moveFile(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= files.length) return
    setFiles((current) => {
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const reorderable = tool.id === 'convert-images-to-pdf' && files.length > 1

  function updateField(name: string, value: string | boolean) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const minimum = tool.input.minFiles ?? 1
    if (files.length < minimum) {
      setError(
        minimum === 1
          ? `Choose the required ${tool.input.label.toLowerCase()}.`
          : `Choose at least ${minimum} files.`,
      )
      return
    }

    setRunning(true)
    setError('')
    setResult(null)
    setProgress(null)

    try {
      if (local) {
        const handler = getLocalToolHandler(tool.id)
        if (!handler) throw new Error('This tool is not available yet.')
        const options: Record<string, string | number | boolean> = {}
        for (const field of tool.fields) {
          const value = values[field.name]
          if (field.type === 'checkbox') {
            options[field.name] = Boolean(value)
          } else if (field.type === 'number' && String(value).trim()) {
            options[field.name] = Number(value)
          } else if (String(value).trim()) {
            options[field.name] = String(value)
          }
        }
        const localResult = await handler({
          files,
          options,
          onProgress: (value, label) => setProgress({ value, label }),
        })
        setResult(localResult)
      } else {
        const options: Record<string, string | number | boolean> = {}
        for (const field of tool.fields) {
          const value = values[field.name]
          if (field.type === 'checkbox') {
            options[field.name] = Boolean(value)
          } else if (field.type === 'number' && String(value).trim()) {
            options[field.name] = Number(value)
          } else if (String(value).trim()) {
            options[field.name] = String(value)
          }
        }
        const response = await executeTool(tool.id, files, options)
        setServerOnline(true)
        if (response.kind === 'download') {
          triggerDownload(response.blob, response.filename)
        } else {
          setResult(jsonToResult(response.data))
        }
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The tool could not run.',
      )
      if (!local) {
        setServerOnline(
          caught instanceof ToolsApiError ? caught.serverAvailable : false,
        )
      }
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  return (
    <form className="tool-runner" onSubmit={handleSubmit}>
      <div className="tool-runner__server" aria-live="polite">
        {local ? (
          <>
            <span
              className="tool-runner__server-dot tool-runner__server-dot--online"
              aria-hidden="true"
            />
            Runs in your browser — no upload needed
          </>
        ) : (
          <>
            <span
              className={`tool-runner__server-dot tool-runner__server-dot--${
                serverOnline === null
                  ? 'checking'
                  : serverOnline
                    ? 'online'
                    : 'offline'
              }`}
              aria-hidden="true"
            />
            {serverOnline === null
              ? 'Checking Python server'
              : serverOnline
                ? 'Python server connected'
                : 'Python server offline'}
          </>
        )}
      </div>

      <div className="tool-runner__section">
        <div className="tool-runner__section-heading">
          <h2>Files</h2>
          <p>
            {tool.input.hint ?? `Choose ${tool.input.label.toLowerCase()}.`}
          </p>
        </div>
        <label className="tool-runner__file-control">
          <Icon name="upload" size="lg" aria-hidden="true" />
          <span>Choose {tool.input.label}</span>
          <input
            type="file"
            accept={tool.input.accept}
            multiple={tool.input.multiple}
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
        </label>
        {selectedFiles.length ? (
          <ul className="tool-runner__files" aria-label="Selected files">
            {selectedFiles.map((file, index) => (
              <li key={`${file}-${index}`}>
                {reorderable ? (
                  <span className="tool-runner__reorder">
                    <button
                      type="button"
                      aria-label={`Move ${file} up`}
                      disabled={index === 0}
                      onClick={() => moveFile(index, -1)}
                    >
                      <Icon name="chevron-up" size="xs" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${file} down`}
                      disabled={index === selectedFiles.length - 1}
                      onClick={() => moveFile(index, 1)}
                    >
                      <Icon name="chevron-down" size="xs" aria-hidden="true" />
                    </button>
                  </span>
                ) : null}
                <span className="tool-runner__file-index">
                  {reorderable ? String(index + 1).padStart(2, '0') : ''}
                </span>
                {file}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {tool.fields.length ? (
        <div className="tool-runner__section">
          <div className="tool-runner__section-heading">
            <h2>Options</h2>
          </div>
          <div className="tool-runner__fields">
            {tool.fields.map((field) => (
              <FieldControl
                key={field.name}
                field={field}
                value={values[field.name] ?? ''}
                onChange={(value) => updateField(field.name, value)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {progress && running ? (
        <div className="tool-runner__progress" role="status">
          <div className="tool-runner__progress-bar">
            <span style={{ width: `${progress.value}%` }} />
          </div>
          <p>
            {progress.label} · {progress.value}%
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="tool-runner__error" role="alert">
          <Icon name="alert-circle" size="sm" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      {result ? (
        <ResultPanel
          result={result}
          onStartAnother={() => {
            setResult(null)
            setFiles([])
          }}
        />
      ) : null}

      <div className="tool-runner__actions">
        <Button type="submit" size="lg" disabled={running}>
          {running ? <Spinner size="sm" label="Running tool" /> : null}
          {running ? 'Processing…' : `Run ${tool.label}`}
        </Button>
      </div>
    </form>
  )
}