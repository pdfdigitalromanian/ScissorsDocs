import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import Textarea from '@/components/ui/Textarea'
import type { ToolDefinition, ToolOptionField } from '../tool-definitions'
import { checkToolsServer, executeTool, ToolsApiError } from '../tools-api'

interface ToolRunnerProps {
  tool: ToolDefinition
}

type FieldValues = Record<string, string | boolean>

function initialValues(fields: ToolOptionField[]): FieldValues {
  return Object.fromEntries(
    fields.map((field) => [field.name, field.defaultValue ?? '']),
  )
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

export default function ToolRunner({ tool }: ToolRunnerProps) {
  const [files, setFiles] = useState<File[]>([])
  const [values, setValues] = useState<FieldValues>(() =>
    initialValues(tool.fields),
  )
  const [running, setRunning] = useState(false)
  const [serverOnline, setServerOnline] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    let active = true
    void checkToolsServer().then((online) => {
      if (active) setServerOnline(online)
    })
    return () => {
      active = false
    }
  }, [])

  const selectedFiles = useMemo(
    () =>
      files.map((file) => `${file.name} · ${(file.size / 1024).toFixed(1)} KB`),
    [files],
  )

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
    try {
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
        setResult(response.data)
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The tool could not run.',
      )
      setServerOnline(
        caught instanceof ToolsApiError ? caught.serverAvailable : false,
      )
    } finally {
      setRunning(false)
    }
  }

  return (
    <form className="tool-runner" onSubmit={handleSubmit}>
      <div className="tool-runner__server" aria-live="polite">
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
            {selectedFiles.map((file) => (
              <li key={file}>{file}</li>
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

      {error ? (
        <div className="tool-runner__error" role="alert">
          <Icon name="alert-circle" size="sm" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="tool-runner__result" aria-live="polite">
          <h2>Result</h2>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
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
