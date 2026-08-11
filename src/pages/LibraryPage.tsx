import { useLocation } from 'react-router-dom'
import { DocumentsLibrary } from '@/features/library'

/**
 * LibraryPage backs the /recent and /favorites routes. Both render the same
 * real local document management surface; the route only sets the starting
 * section (all documents vs. favorites).
 */
export default function LibraryPage() {
  const location = useLocation()
  const variant = location.pathname === '/favorites' ? 'favorites' : 'recent'

  /* Key by variant so switching /recent <-> /favorites remounts the library
     and resets the active section to the matching tab. */
  return <DocumentsLibrary key={variant} variant={variant} />
}
