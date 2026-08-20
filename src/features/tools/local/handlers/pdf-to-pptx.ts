import { localBytes, formatBytes } from '../types'
import type { LocalToolContext, LocalToolResult } from '../types'
import { loadPdfDocument, renderPageToCanvas, canvasToBlob } from '../lib/pdf'
import { zipArchive } from '../lib/office'

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const OFFICE_REL_NS =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'

function contentTypes(slideCount: number): string {
  let s = XML
  s += `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  s += `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
  s += `<Default Extension="xml" ContentType="application/xml"/>`
  s += `<Default Extension="png" ContentType="image/png"/>`
  s += `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`
  s += `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`
  s += `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`
  s += `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`
  for (let i = 1; i <= slideCount; i += 1) {
    s += `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  }
  s += `</Types>`
  return s
}

function emptySpTree(wEmu: number, hEmu: number): string {
  return `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${wEmu}" cy="${hEmu}"/><a:chOff x="0" y="0"/><a:chExt cx="${wEmu}" cy="${hEmu}"/></a:xfrm></p:grpSpPr></p:spTree>`
}

function rootRels(): string {
  return (
    XML +
    `<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`
  )
}

function presentationXml(slideCount: number, wEmu: number, hEmu: number): string {
  const ids = Array.from(
    { length: slideCount },
    (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`,
  ).join('')
  return (
    XML +
    `<p:presentation xmlns:a="${A}" xmlns:r="${OFFICE_REL_NS}" xmlns:p="${P}">` +
    `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
    `<p:sldIdLst>${ids}</p:sldIdLst>` +
    `<p:sldSz cx="${wEmu}" cy="${hEmu}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`
  )
}

function presentationRels(slideCount: number): string {
  const rels = [
    `<Relationship Id="rId1" Type="${OFFICE_REL_NS}/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
  ]
  for (let i = 1; i <= slideCount; i += 1) {
    rels.push(
      `<Relationship Id="rId${i + 1}" Type="${OFFICE_REL_NS}/slide" Target="slides/slide${i}.xml"/>`,
    )
  }
  return XML + `<Relationships xmlns="${REL_NS}">${rels.join('')}</Relationships>`
}

function slideMasterXml(wEmu: number, hEmu: number): string {
  return (
    XML +
    `<p:sldMaster xmlns:a="${A}" xmlns:r="${OFFICE_REL_NS}" xmlns:p="${P}">` +
    `<p:cSld>${emptySpTree(wEmu, hEmu)}</p:cSld>` +
    `<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>` +
    `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`
  )
}

function slideMasterRels(): string {
  return (
    XML +
    `<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`
  )
}

function slideLayoutXml(wEmu: number, hEmu: number): string {
  return (
    XML +
    `<p:sldLayout xmlns:a="${A}" xmlns:r="${OFFICE_REL_NS}" xmlns:p="${P}" type="blank" preserve="1">` +
    `<p:cSld name="Blank">${emptySpTree(wEmu, hEmu)}</p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  )
}

function slideLayoutRels(): string {
  return (
    XML +
    `<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`
  )
}

function themeXml(): string {
  return (
    XML +
    `<a:theme xmlns:a="${A}" name="ScissorsTheme"><a:themeElements>` +
    `<a:clrScheme name="Standard"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>` +
    `<a:fontScheme name="Standard"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
    `<a:fmtScheme name="Standard"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>` +
    `</a:themeElements></a:theme>`
  )
}

function slideXml(imageRelId: string, wEmu: number, hEmu: number): string {
  return (
    XML +
    `<p:sld xmlns:a="${A}" xmlns:r="${OFFICE_REL_NS}" xmlns:p="${P}"><p:cSld><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${wEmu}" cy="${hEmu}"/><a:chOff x="0" y="0"/><a:chExt cx="${wEmu}" cy="${hEmu}"/></a:xfrm></p:grpSpPr>` +
    `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Page"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${imageRelId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${wEmu}" cy="${hEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>` +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  )
}

function slideRels(imageTarget: string): string {
  return (
    XML +
    `<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/image" Target="${imageTarget}"/></Relationships>`
  )
}

/**
 * Local PDF → PPTX conversion. Every PDF page is rendered to a PNG and placed
 * full-bleed on its own slide, so the deck looks like the original PDF pages.
 */
export async function pdfToPptxHandler(
  context: LocalToolContext,
): Promise<LocalToolResult> {
  const { files, options, onProgress } = context
  if (files.length === 0) throw new Error('Choose a PDF file to convert.')

  const source = files.find((file) => /\.pdf$/i.test(file.name)) ?? files[0]
  const bytes = await localBytes(source)
  const loaded = await loadPdfDocument(bytes)
  try {
    const { document } = loaded
    const pageCount = document.numPages
    const scale = Number(options.scale ?? 1.5)
    const pages: { bytes: Uint8Array; widthPt: number; heightPt: number }[] = []
    for (let index = 1; index <= pageCount; index += 1) {
      onProgress?.(
        Math.round((index / pageCount) * 100),
        `Rendering page ${index} of ${pageCount}`,
      )
      const page = await document.getPage(index)
      const viewport = page.getViewport({ scale: 1 })
      const canvas = await renderPageToCanvas(page, scale)
      const blob = await canvasToBlob(canvas, 'image/png')
      pages.push({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        widthPt: viewport.width,
        heightPt: viewport.height,
      })
    }

    const slideWEmu = Math.round((pages[0]?.widthPt ?? 720) * 12700)
    const slideHEmu = Math.round((pages[0]?.heightPt ?? 540) * 12700)

    const parts: Record<string, Uint8Array> = {}
    const enc = new TextEncoder()
    const put = (name: string, xml: string) => {
      parts[name] = enc.encode(xml)
    }

    put('[Content_Types].xml', contentTypes(pageCount))
    put('_rels/.rels', rootRels())
    put('ppt/presentation.xml', presentationXml(pageCount, slideWEmu, slideHEmu))
    put('ppt/_rels/presentation.xml.rels', presentationRels(pageCount))
    put('ppt/slideMasters/slideMaster1.xml', slideMasterXml(slideWEmu, slideHEmu))
    put('ppt/slideMasters/_rels/slideMaster1.xml.rels', slideMasterRels())
    put('ppt/slideLayouts/slideLayout1.xml', slideLayoutXml(slideWEmu, slideHEmu))
    put('ppt/slideLayouts/_rels/slideLayout1.xml.rels', slideLayoutRels())
    put('ppt/theme/theme1.xml', themeXml())
    pages.forEach((page, index) => {
      const num = index + 1
      put(`ppt/slides/slide${num}.xml`, slideXml('rId1', slideWEmu, slideHEmu))
      put(
        `ppt/slides/_rels/slide${num}.xml.rels`,
        slideRels(`../media/image${num}.png`),
      )
      parts[`ppt/media/image${num}.png`] = page.bytes
    })

    const outBytes = zipArchive(parts)
    const blob = new Blob([outBytes as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })
    const baseName = source.name.replace(/\.pdf$/i, '') || 'presentation'
    return {
      blob,
      filename: `${baseName}.pptx`,
      mimeType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      summary: `${pageCount} slide${pageCount > 1 ? 's' : ''} · ${formatBytes(
        blob.size,
      )}`,
    }
  } finally {
    await loaded.destroy()
  }
}