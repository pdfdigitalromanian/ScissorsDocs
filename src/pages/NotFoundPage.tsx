import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import './pages.css'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="placeholder-page">
      <EmptyState
        headingLevel="h1"
        icon="search"
        title="Page not found"
        description="The page you are looking for doesn't exist or has been moved."
        action={
          <Button variant="primary" onClick={() => navigate('/')}>
            Go to Home
          </Button>
        }
      />
    </div>
  )
}
