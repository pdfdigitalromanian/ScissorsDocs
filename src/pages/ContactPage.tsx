import { useState } from 'react'
import { Link } from 'react-router-dom'
import EntryHeader from '@/features/home/components/EntryHeader'
import { Icon } from '@/components/icons/Icon'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui'
import '@/features/home/home.css'
import './contact.css'

export default function ContactPage() {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)

  function validate() {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Name is required.'
    if (!email.trim()) next.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = 'Please enter a valid email address.'
    if (!message.trim()) next.message = 'Message is required.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!validate()) return
    setSubmitted(true)
    toast({
      title: 'Message sent',
      description: 'Thank you for reaching out. We will get back to you shortly.',
      variant: 'info',
    })
  }

  return (
    <div className="entry-page">
      <div className="entry-page__panel">
        <EntryHeader />
        <main id="main-content" className="entry-main" tabIndex={-1}>
          <section className="contact-hero" aria-labelledby="contact-title">
            <h1 id="contact-title" className="contact-hero__title">
              Get in touch
            </h1>
            <p className="contact-hero__description">
              Have a question, feedback, or need help? We would love to hear from
              you.
            </p>
          </section>

          <div className="contact-layout">
            <div className="contact-info" aria-label="Contact information">
              <div className="contact-info__item">
                <span className="contact-info__icon" aria-hidden="true">
                  <Icon name="search" size="sm" />
                </span>
                <div className="contact-info__copy">
                  <strong>General inquiries</strong>
                  <span>hello@scissordoc.com</span>
                </div>
              </div>
              <div className="contact-info__item">
                <span className="contact-info__icon" aria-hidden="true">
                  <Icon name="settings" size="sm" />
                </span>
                <div className="contact-info__copy">
                  <strong>Technical support</strong>
                  <span>support@scissordoc.com</span>
                </div>
              </div>
              <div className="contact-info__item">
                <span className="contact-info__icon" aria-hidden="true">
                  <Icon name="workspace" size="sm" />
                </span>
                <div className="contact-info__copy">
                  <strong>Partnerships</strong>
                  <span>partners@scissordoc.com</span>
                </div>
              </div>
            </div>

            {submitted ? (
              <div className="contact-success">
                <span className="contact-success__icon" aria-hidden="true">
                  <Icon name="search" size="xl" />
                </span>
                <h2 className="contact-success__title">Message received</h2>
                <p className="contact-success__description">
                  Thanks for contacting us. We will get back to you as soon as
                  possible.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSubmitted(false)
                    setName('')
                    setEmail('')
                    setSubject('')
                    setMessage('')
                  }}
                >
                  Send another message
                </Button>
                <Link to="/" className="contact-success__home">
                  Back to home
                </Link>
              </div>
            ) : (
              <form className="contact-form" onSubmit={handleSubmit} noValidate>
                <Input
                  label="Name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  error={errors.name}
                  autoComplete="name"
                />
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={errors.email}
                  autoComplete="email"
                />
                <Input
                  label="Subject"
                  placeholder="What is this about?"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
                <Textarea
                  label="Message"
                  placeholder="Write your message here..."
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  error={errors.message}
                />
                <div className="contact-form__actions">
                  <Button type="submit" variant="primary" size="lg">
                    Send message
                  </Button>
                </div>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
