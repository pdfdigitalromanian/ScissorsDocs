/**
 * SignToolbar — the Sign workflow's toolbar in the workspace. It mirrors
 * the Sign tool page modes (Select / Draw / Type / Upload) but lives next
 * to the document so signatures can be created and placed directly on the
 * page. Creating a signature opens the SignatureStudio dialog; accepting it
 * returns to the page in place mode.
 *
 * Every signature created in this session appears in the palette — click a
 * thumb to make it the active one, then click the page to drop copies of it
 * (single or multiple). When a placed signature is selected on the page the
 * palette highlights the signature it came from.
 */
import { useEffect, useMemo, useState } from 'react'
import IconButton from '@/components/ui/IconButton'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import { usePdfEditor } from '../PdfEditorProvider'
import SignatureStudio from '@/features/tools/sign/components/SignatureStudio'
import type { StudioTab } from '@/features/tools/sign/components/SignatureStudio'
import {
  Modal,
  ModalBody,
  ModalClose,
  ModalHeader,
  ModalTitle,
} from '@/components/ui'
import '@/features/tools/sign/sign.css'
import '../editor.css'

export function SignToolbar() {
  const {
    signMode,
    setSignMode,
    signatures,
    activeSignatureId,
    setActiveSignatureId,
    signaturePlaceMode,
    setSignaturePlaceMode,
    createSignature,
    deleteSignature,
    elements,
    selectedElementIds,
  } = usePdfEditor()
  const [studioTab, setStudioTab] = useState<StudioTab | null>(null)

  /* When a placed signature is selected on the page, follow it so the
     palette highlights the signature that selection came from. */
  const selectedSignatureId = useMemo(() => {
    for (const id of selectedElementIds) {
      const element = elements.find((entry) => entry.id === id)
      if (
        element?.type === 'image' &&
        element.kind === 'signature' &&
        element.signatureId
      ) {
        return element.signatureId
      }
    }
    return null
  }, [elements, selectedElementIds])

  useEffect(() => {
    if (selectedSignatureId) {
      setActiveSignatureId(selectedSignatureId)
    }
  }, [selectedSignatureId, setActiveSignatureId])

  if (!signMode) return null

  const activeId = selectedSignatureId ?? activeSignatureId
  const activeSignature =
    signatures.find((signature) => signature.id === activeId) ?? null
  const placing = signaturePlaceMode === 'draw'

  function openStudio(tab: StudioTab) {
    setStudioTab(tab)
  }

  function handleCreated() {
    setSignaturePlaceMode('draw')
    setStudioTab(null)
  }

  function chooseSignature(id: string) {
    setActiveSignatureId(id)
    setSignaturePlaceMode('draw')
  }

  return (
    <>
      <div
        className="editor-toolbar sign-toolbar"
        role="toolbar"
        aria-label="Sign tools"
      >
        <div className="editor-toolbar__group">
          <IconButton
            icon="pointer"
            label="Select — move, resize or rotate placed signatures"
            iconSize="sm"
            aria-pressed={!placing}
            onClick={() => setSignaturePlaceMode('select')}
          />
          <IconButton
            icon="edit"
            label="Draw a signature"
            iconSize="sm"
            onClick={() => openStudio('draw')}
          />
          <IconButton
            icon="text"
            label="Type a signature"
            iconSize="sm"
            onClick={() => openStudio('type')}
          />
          <IconButton
            icon="upload"
            label="Upload a signature image"
            iconSize="sm"
            onClick={() => openStudio('upload')}
          />
        </div>

        {signatures.length > 0 ? (
          <div className="sign-toolbar__palette">
            {signatures.map((signature) => (
              <button
                key={signature.id}
                type="button"
                className={`sign-toolbar__chip${
                  signature.id === activeId
                    ? ' sign-toolbar__chip--active'
                    : ''
                }`}
                title={`${signature.label} — click a page to place`}
                aria-pressed={signature.id === activeId}
                onClick={() => chooseSignature(signature.id)}
              >
                <img
                  src={signature.dataUrl}
                  alt={signature.label}
                  draggable={false}
                />
              </button>
            ))}
            <div className="sign-toolbar__chip-meta">
              <span className="sign-toolbar__asset-label">
                {activeSignature ? activeSignature.label : 'Signature'}
              </span>
              <span className="sign-toolbar__asset-mode">
                {placing ? 'Click a page to place' : 'Select mode'}
              </span>
            </div>
            <IconButton
              icon="check"
              label="Place this signature"
              iconSize="sm"
              aria-pressed={placing}
              onClick={() => setSignaturePlaceMode('draw')}
            />
            {activeSignature ? (
              <IconButton
                icon="trash"
                label="Delete signature"
                iconSize="sm"
                onClick={() => void deleteSignature(activeSignature.id)}
              />
            ) : null}
          </div>
        ) : (
          <div className="editor-toolbar__note">
            <Icon name="edit" size="sm" />
            No signature yet — click Draw, Type or Upload to create one
          </div>
        )}

        <div className="editor-toolbar__group">
          <Button variant="ghost" size="sm" onClick={() => setSignMode(false)}>
            Done
          </Button>
        </div>
      </div>

      <Modal open={studioTab !== null} onClose={() => setStudioTab(null)} size="md">
        <ModalHeader>
          <ModalTitle>Create signature</ModalTitle>
          <ModalClose />
        </ModalHeader>
        <ModalBody>
          {studioTab ? (
            <SignatureStudio
              initialTab={studioTab}
              onCreate={(signature) => {
                createSignature(signature)
                handleCreated()
              }}
            />
          ) : null}
        </ModalBody>
      </Modal>
    </>
  )
}