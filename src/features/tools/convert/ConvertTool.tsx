import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { useNavigate } from 'react-router-dom'
import { ingestFiles } from '@/features/documents'
import { executeTool, checkToolsServer } from '../tools-api'
import { makeZipBlob, type ZipEntryInput } from '../local/lib/zip'
import { getLocalToolHandler } from '../local/registry'
import type { ConversionConfig } from './convert-config'
import './convert.css'

type JobStatus =
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'preparing'
  | 'complete'
  | 'failed'

interface Job {
  file: File
  status: JobStatus
  error: string
  blob: Blob | null
  filename: string
}

const STATUS_TEXT: Record<JobStatus, string> = {
  uploading: 'Uploading…',
  queued: 'Queued…',
  processing: 'Processing…',
  preparing: 'Preparing result…',
  complete: 'Complete',
  failed: 'Failed',
}

async function runLocalConversion(
  toolId: string,
  file: File,
): Promise<{ kind: 'download'; blob: Blob; filename: string }> {
  const handler = getLocalToolHandler(toolId)
  if (!handler) {
    throw new Error('This conversion has no engine available in the browser.')
  }
  const result = await handler({
    files: [file],
    options: {},
  })
  return { kind: 'download', blob: result.blob, filename: result.filename }
}

export default function ConvertTool({ config }: { config: ConversionConfig }) {
  const navigate = useNavigate()
  const [files, setFiles] = useState<File[]>([])
  const [serverAvailable, setServerAvailable] = useState(true)
  const [running, setRunning] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [opening, setOpening] = useState(false)
  const cancelledRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void checkToolsServer().then((available) => {
      if (!cancelled) setServerAvailable(available)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function addFiles(picked: File[]) {
    const accepted = picked.filter((file) =>
      config.extensions.some((extension) =>
        file.name.toLowerCase().endsWith(extension),
      ),
    )
    setError('')
    if (config.serverEngine && !serverAvailable) {
      setError(
        'The conversion engine runs on the Python tools server, which is currently offline. Start it with npm run server and try again.',
      )
      return
    }
    if (!config.serverEngine && !config.localEngine) {
      setError(
        `This conversion (${config.label}) requires an online conversion engine that is not configured on the server. It cannot run locally — nothing was uploaded.`,
      )
      return
    }
    if (accepted.length === 0) {
      setError(
        `The selected file does not look like ${config.from}. Choose a supported document.`,
      )
      return
    }
    setFiles((current) => [...current, ...accepted])
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
  }

  async function runConversion() {
    if (files.length === 0) return
    setError('')
    setRunning(true)
    setProgress('')
    cancelledRef.current = false
    setJobs(
      files.map((file) => ({
        file,
        status: 'queued' as JobStatus,
        error: '',
        blob: null,
        filename: '',
      })),
    )

    for (let index = 0; index < files.length; index += 1) {
      if (cancelledRef.current) break
      const file = files[index]
      const update = (patch: Partial<Job>) =>
        setJobs((current) =>
          current.map((job, jobIndex) =>
            jobIndex === index ? { ...job, ...patch } : job,
          ),
        )

      update({ status: 'uploading' })
      setProgress(`Uploading ${file.name}…`)
      await new Promise((resolve) => setTimeout(resolve, 350))
      if (cancelledRef.current) break

      update({ status: 'queued' })
      setProgress(`Queued ${file.name}…`)
      await new Promise((resolve) => setTimeout(resolve, 350))
      if (cancelledRef.current) break

      update({ status: 'processing' })
      setProgress(
        config.localEngine
          ? `Converting ${file.name} in your browser…`
          : `Converting ${file.name} on the server…`,
      )
      try {
        const result = config.localEngine
          ? await runLocalConversion(config.toolId, file)
          : await executeTool(config.toolId, [file], {})
        if (cancelledRef.current) break
        update({ status: 'preparing' })
        await new Promise((resolve) => setTimeout(resolve, 250))
        if (cancelledRef.current) break
        if (result.kind !== 'download') {
          throw new Error('The conversion returned an unexpected response.')
        }
        update({
          status: 'complete',
          blob: result.blob,
          filename: result.filename,
        })
        setProgress(`Completed ${file.name}.`)
      } catch (reason) {
        update({
          status: 'failed',
          error:
            reason instanceof Error
              ? reason.message
              : 'The conversion failed.',
        })
        setProgress(`Failed ${file.name}.`)
      }
    }

    setRunning(false)
  }

  const completed = jobs.filter((job) => job.status === 'complete')
  const anyComplete = completed.length > 0

  async function handleOpenAll() {
    const pdfBlobs = completed.filter(
      (job) => config.resultIsPdf && job.blob,
    )
    if (pdfBlobs.length === 0) return
    setOpening(true)
    try {
      const filesToOpen = pdfBlobs.map(
        (job) =>
          new File([job.blob as unknown as BlobPart], job.filename, {
            type: 'application/pdf',
          }),
      )
      const results = await ingestFiles(filesToOpen)
      const ids = results
        .map((item) => item.document?.id)
        .filter((id): id is string => Boolean(id))
      if (ids.length === 0) throw new Error('No PDF could be opened.')
      navigate(`/workspace?docs=${encodeURIComponent(ids.join(','))}`)
    } catch {
      setOpening(false)
    }
  }

  async function handleDownloadAll() {
    const entries: ZipEntryInput[] = []
    for (const job of completed) {
      if (!job.blob) continue
      const bytes = new Uint8Array(await job.blob.arrayBuffer())
      entries.push({ name: job.filename, data: bytes })
    }
    const url = URL.createObjectURL(makeZipBlob(entries))
    const link = document.createElement('a')
    link.href = url
    link.download = `${config.toolId}-results.zip`
    link.click()
    URL.revokeObjectURL(url)
  }

  const dropRef = useRef<HTMLInputElement>(null)

  return (
    <div className="organize-workflow convert-workflow">
      <section className="organize-section">
        <div className="organize-section__heading">
          <h2>{config.label}</h2>
          <p>{config.description}</p>
        </div>

        <div className="convert-status" aria-live="polite">
          <span
            className={`convert-status__dot${serverAvailable ? ' convert-status__dot--ok' : ' convert-status__dot--off'}`}
            aria-hidden="true"
          />
          {config.localEngine ? (
            'Runs locally in your browser — no upload needed.'
          ) : config.serverEngine ? (
            serverAvailable
              ? 'Online conversion engine available — documents are uploaded for processing.'
              : 'Online conversion engine offline — start it with npm run server.'
          ) : (
            'Online conversion engine not configured — this conversion cannot run yet.'
          )}
        </div>

        {config.serverEngine || config.localEngine ? (
          <div
            className="convert-drop"
            onClick={() => dropRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') dropRef.current?.click()
            }}
            role="button"
            tabIndex={0}
            aria-label="Add documents"
          >
            <Icon name="upload" size="lg" aria-hidden="true" />
            <p>Upload {config.from} files</p>
            <span>
              {config.localEngine
                ? 'Click to browse — the conversion runs entirely in your browser.'
                : 'Click to browse — documents are processed online.'}
            </span>
            <input
              ref={dropRef}
              type="file"
              accept={config.accept}
              multiple
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
          </div>
        ) : (
          <div className="convert-unavailable" role="status">
            <Icon name="alert-circle" size="sm" aria-hidden="true" />
            <div>
              <p>
                {config.label} is an <strong>online</strong> operation, but the
                conversion engine for {config.from} is not installed on the
                tools server. No fake or local conversion is performed.
              </p>
              <p>
                Once a conversion engine is configured, this workflow becomes
                available automatically.
              </p>
            </div>
          </div>
        )}

        {files.length > 0 ? (
          <ul className="convert-files">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <Icon name="file-text" aria-hidden="true" />
                <span className="convert-files__name">{file.name}</span>
                <button
                  type="button"
                  className="convert-files__remove"
                  onClick={() => removeFile(index)}
                  aria-label={`Remove ${file.name}`}
                  disabled={running}
                >
                  <Icon name="trash" size="sm" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <div className="organize-error" role="alert">
            <Icon name="alert-circle" size="sm" aria-hidden="true" />
            {error}
          </div>
        ) : null}

        <div className="organize-actions">
          <Button
            size="lg"
            disabled={files.length === 0 || running || !(config.serverEngine || config.localEngine)}
            onClick={() => void runConversion()}
          >
            {running ? <Spinner size="sm" label="Converting" /> : null}
            {running ? 'Converting…' : `Convert to ${config.to}`}
          </Button>
          {running ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                cancelledRef.current = true
              }}
            >
              Cancel
            </Button>
          ) : null}
          <span className="organize-hint" role="status">
            {running ? progress : `Converts ${config.from} to ${config.to}.`}
          </span>
        </div>
      </section>

      {jobs.length > 0 ? (
        <section className="organize-section convert-jobs">
          <div className="organize-section__heading">
            <h2>Conversion jobs</h2>
            <p>Each file is processed as its own job on the server.</p>
          </div>
          <ul className="convert-jobs__list">
            {jobs.map((job, index) => (
              <li
                key={`${job.file.name}-${index}`}
                className={`convert-job convert-job--${job.status}`}
              >
                <span className="convert-job__icon" aria-hidden="true">
                  {job.status === 'complete' ? (
                    <Icon name="check-circle" size="sm" />
                  ) : job.status === 'failed' ? (
                    <Icon name="alert-circle" size="sm" />
                  ) : (
                    <Spinner size="sm" label="" />
                  )}
                </span>
                <div className="convert-job__body">
                  <p className="convert-job__name">{job.file.name}</p>
                  <p className="convert-job__status">{STATUS_TEXT[job.status]}</p>
                  {job.status === 'failed' && job.error ? (
                    <p className="convert-job__error">{job.error}</p>
                  ) : null}
                </div>
                {job.status === 'complete' && job.blob ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const blob = job.blob
                      if (!blob) return
                      const url = URL.createObjectURL(blob)
                      const link = document.createElement('a')
                      link.href = url
                      link.download = job.filename
                      link.click()
                      URL.revokeObjectURL(url)
                    }}
                  >
                    Download
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {anyComplete ? (
            <div className="convert-jobs__actions">
              {completed.length > 1 ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void handleDownloadAll()}>
                  Download all (.zip)
                </Button>
              ) : null}
              {config.resultIsPdf ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={opening}
                  onClick={() => void handleOpenAll()}
                >
                  <Icon name="workspace" size="sm" aria-hidden="true" />
                  {opening ? 'Opening…' : 'Open PDFs in workspace'}
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}