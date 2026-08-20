import {
  EncryptedPDFError,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  type SecurityOptions,
} from '@cantoo/pdf-lib'
import { looksLikePdf } from './engine'

export interface ProtectPermissions {
  restrictPrinting: boolean
  restrictCopying: boolean
  restrictEditing: boolean
  restrictAnnotating: boolean
  restrictFormFilling: boolean
}

export interface ProtectPdfOptions {
  userPassword: string
  ownerPassword?: string
  permissions?: ProtectPermissions
}

export interface SecurityResult {
  bytes: Uint8Array
  pageCount: number
}

export interface ProtectionReport {
  encrypted: boolean
  /** True when opening the document requires a password. */
  needsPassword: boolean
  pageCount: number | null
}

function passwordError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : ''
  if (message.startsWith('Password incorrect')) {
    return 'The password is incorrect. Try it again.'
  }
  if (message.startsWith('NEEDS PASSWORD')) {
    return 'This PDF is locked. Enter its open password to unlock it.'
  }
  if (reason instanceof EncryptedPDFError) {
    return 'This PDF is encrypted and cannot be read without its password.'
  }
  return 'This PDF could not be read. It may be corrupted or use unsupported encryption.'
}

function validatePassword(password: string, label: string): void {
  if (!password.trim()) {
    throw new Error(`Enter ${label.toLowerCase()} to continue.`)
  }
  if (password.length < 4) {
    throw new Error(`${label} must be at least 4 characters long.`)
  }
  if (password.length > 64) {
    throw new Error(`${label} must be 64 characters or fewer.`)
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(password)) {
    throw new Error(`${label} cannot contain control characters.`)
  }
}

/**
 * Inspects a PDF and reports whether it is encrypted and whether opening it
 * requires a password. Never throws for password-protected inputs.
 */
export async function inspectPdfProtection(
  bytes: Uint8Array,
): Promise<ProtectionReport> {
  if (!looksLikePdf(bytes)) {
    throw new Error('The selected file is not a valid PDF.')
  }
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes)
  } catch (reason) {
    if (reason instanceof EncryptedPDFError) {
      // Encrypted — check whether an empty password opens it (restriction-only
      // documents have a user password that is empty).
      try {
        const opened = await PDFDocument.load(bytes, { password: '' })
        return {
          encrypted: true,
          needsPassword: false,
          pageCount: opened.getPageCount(),
        }
      } catch {
        return { encrypted: true, needsPassword: true, pageCount: null }
      }
    }
    throw new Error(
      'This PDF could not be read. It may be corrupted or use unsupported encryption.',
      { cause: reason },
    )
  }
  return { encrypted: false, needsPassword: false, pageCount: doc.getPageCount() }
}

/**
 * Encrypts a PDF with an open password and optional restrictions. The result
 * is re-opened to verify the password is genuinely required and the document
 * stays valid before it is returned.
 */
export async function protectPdf(
  bytes: Uint8Array,
  options: ProtectPdfOptions,
): Promise<SecurityResult> {
  const userPassword = options.userPassword
  validatePassword(userPassword, 'Open password')
  const ownerPassword = options.ownerPassword?.trim()
    ? options.ownerPassword
    : userPassword
  if (options.ownerPassword?.trim()) {
    validatePassword(options.ownerPassword, 'Permissions password')
  }

  if (!looksLikePdf(bytes)) {
    throw new Error('The selected file is not a valid PDF.')
  }

  const report = await inspectPdfProtection(bytes)
  if (report.encrypted) {
    throw new Error('This PDF is already protected. Unlock it before protecting it again.')
  }

  const doc = await PDFDocument.load(bytes)
  const originalPages = doc.getPageCount()

  const permissions = options.permissions
  const securityOptions: SecurityOptions = {
    userPassword,
    ownerPassword,
    algorithm: 'AES-256',
  }
  if (permissions) {
    securityOptions.permissions = {
      printing: permissions.restrictPrinting ? true : undefined,
      copying: permissions.restrictCopying ? true : undefined,
      modifying: permissions.restrictEditing ? true : undefined,
      annotating: permissions.restrictAnnotating ? true : undefined,
      fillingForms: permissions.restrictFormFilling ? true : undefined,
    }
  }

  doc.encrypt(securityOptions)
  const protectedBytes = await doc.save({ rewrite: true })

  // Result validation — the password must really be required and the PDF
  // must reopen with the right password and the same page count.
  let reopened: PDFDocument
  try {
    reopened = await PDFDocument.load(protectedBytes, { password: userPassword })
  } catch {
    throw new Error('The protected PDF could not be reopened for verification.')
  }
  if (reopened.getPageCount() !== originalPages) {
    throw new Error('The protected PDF lost content during encryption.')
  }
  let requiresPassword = false
  try {
    await PDFDocument.load(protectedBytes)
  } catch (reason) {
    requiresPassword = reason instanceof EncryptedPDFError
  }
  if (!requiresPassword) {
    throw new Error('The protected PDF is not actually password-protected.')
  }

  return { bytes: protectedBytes, pageCount: reopened.getPageCount() }
}

/**
 * Removes the encryption dictionary and any stale references to it from a
 * decrypted document context so the rewritten PDF is genuinely unprotected.
 */
function stripEncryptionFromContext(doc: PDFDocument): void {
  const { context } = doc
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    const dict = object instanceof PDFRawStream ? object.dict : object
    if (!(dict instanceof PDFDict)) continue
    const filter = dict.get(PDFName.of('Filter'))
    const filterName = filter && filter.toString ? filter.toString() : ''
    const isEncryptDict =
      (filterName === '/Standard' ||
        filterName === '/AESV2' ||
        filterName === '/AESV3') &&
      dict.get(PDFName.of('V')) !== undefined &&
      dict.get(PDFName.of('R')) !== undefined
    const referencesEncryption =
      dict.get(PDFName.of('Encrypt')) !== undefined
    if (isEncryptDict || referencesEncryption) {
      context.delete(ref)
    }
  }
}

/**
 * Decrypts a password-protected PDF and rewrites it without encryption.
 * The output is re-opened to verify the protection is really gone and the
 * content is intact.
 */
export async function unlockPdf(
  bytes: Uint8Array,
  password: string,
): Promise<SecurityResult> {
  if (!looksLikePdf(bytes)) {
    throw new Error('The selected file is not a valid PDF.')
  }

  // Do not reject PDFs that look unencrypted up-front: many "protected"
  // files carry restrictions without an encryption dictionary. Attempt the
  // open with the given password (or empty) and strip whatever protection
  // metadata exists.
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes, { password: password.trim() })
  } catch (reason) {
    if (!password.trim()) {
      throw new Error('Enter the PDF password to unlock it.', { cause: reason })
    }
    throw new Error(passwordError(reason), { cause: reason })
  }

  const originalPages = doc.getPageCount()
  stripEncryptionFromContext(doc)
  const unlockedBytes = await doc.save({ rewrite: true })

  // Result validation — reopening without a password must now succeed and the
  // page count must be preserved.
  let reopened: PDFDocument
  try {
    reopened = await PDFDocument.load(unlockedBytes)
  } catch {
    throw new Error(
      'The unlocked PDF could not be reopened. The password may be wrong, or this PDF uses unsupported encryption.',
    )
  }
  if (reopened.isEncrypted || reopened.getPageCount() !== originalPages) {
    throw new Error('The unlocked PDF is not valid. The password may be wrong.')
  }

  return { bytes: unlockedBytes, pageCount: reopened.getPageCount() }
}